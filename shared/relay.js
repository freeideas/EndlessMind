// Connection to a helper server: claim addresses, send and receive signed
// envelopes through its relay. Runs the same in a browser and in Deno, so the
// app and the host program share it.

import { addressOf, sign } from "./crypto.js";
import { MAX_MESSAGE_BYTES, parseStrictJson } from "./encoding.js";
import { open, ReplayGuard, seal } from "./envelope.js";

/** @typedef {import("./envelope.js").Envelope} Envelope */

export class Relay extends EventTarget {
  /** @param {string} url WebSocket address, e.g. wss://host/ws */
  constructor(url) {
    super();
    this.url = url;
    /** @type {WebSocket | null} */
    this.socket = null;
    /** Key pairs this connection speaks for. @type {Map<string, CryptoKeyPair>} */
    this.keys = new Map();
    /** @type {Map<string, { done: () => void, fail: (e: Error) => void }>} */
    this.pendingClaims = new Map();
    /** @type {Promise<void> | null} */
    this.ready = null;
    this.closedByUs = false;
    this.replays = new ReplayGuard();
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.reconnectTimer = undefined;
    /** Messages leave in the order send() was called. @type {Promise<unknown>} */
    this.sending = Promise.resolve();
    /** How far the server's clock is ahead of this device's, in milliseconds, once connected. */
    this.clockOff = 0;
    /** Messages are handled in the order they arrive. @type {Promise<unknown>} */
    this.receiving = Promise.resolve();
  }

  /** Connect (or reconnect) and re-claim every address. */
  connect() {
    if (this.closedByUs) return Promise.reject(new Error("Connection closed"));
    this.ready = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      const deadline = setTimeout(() => { reject(new Error("Connection timed out")); socket.close(); }, 10_000);
      socket.onopen = async () => {
        try {
          await Promise.all([...this.keys.values()].map((k) => this.#claim(k)));
          clearTimeout(deadline);
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      socket.onerror = () => reject(new Error("cannot reach the server"));
      // One at a time: checking a large message must not let a later small one overtake it.
      socket.onmessage = (event) => {
        this.receiving = this.receiving.then(() => this.#onMessage(event.data)).catch(console.error);
      };
      socket.onclose = () => {
        clearTimeout(deadline);
        reject(new Error("The connection closed"));
        for (const claim of this.pendingClaims.values()) claim.fail(new Error("the connection to the server closed"));
        this.pendingClaims.clear();
        this.dispatchEvent(new Event("close"));
        if (!this.closedByUs) this.reconnectTimer = setTimeout(() => this.connect().catch(() => {}), 2000);
      };
    });
    return this.ready;
  }

  close() {
    this.closedByUs = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  /** Speak for this key pair: messages to its address will arrive here. @param {CryptoKeyPair} keyPair */
  async addKey(keyPair) {
    const address = await addressOf(keyPair.publicKey);
    this.keys.set(address, keyPair);
    if (this.socket?.readyState === WebSocket.OPEN) await this.#claim(keyPair);
    return address;
  }

  /** @param {CryptoKeyPair} keyPair */
  async #claim(keyPair) {
    const address = await addressOf(keyPair.publicKey);
    const done = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        this.pendingClaims.delete(address);
        reject(new Error("Address claim timed out"));
      }, 10_000);
      this.pendingClaims.set(address, {
        done: () => { clearTimeout(deadline); resolve(undefined); },
        fail: (e) => { clearTimeout(deadline); reject(e); },
      });
    });
    this.#raw({ type: "claim", address });
    await done;
  }

  /** Stop speaking for an address, so the server no longer shows it as online. @param {string} address */
  release(address) {
    if (this.keys.delete(address)) this.#raw({ type: "release", address });
  }

  /**
   * Sign and send a message. The body is copied when this is called, and
   * messages leave in the order of the calls, however long each takes to sign.
   * Rejects if the message is too large for a relay to carry.
   * @param {CryptoKeyPair} from @param {string} to @param {string} kind @param {unknown} body
   * @returns {Promise<Envelope>}
   */
  send(from, to, kind, body) {
    const sealed = seal(from, to, kind, body);
    sealed.catch(() => {});
    const sent = this.sending.then(async () => {
      const envelope = await sealed;
      const text = JSON.stringify({ type: "send", envelope });
      if (text.length > MAX_MESSAGE_BYTES) {
        throw new Error(`A ${kind} message of ${text.length} characters is over the limit of ${MAX_MESSAGE_BYTES} and was not sent.`);
      }
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(text);
      return envelope;
    });
    this.sending = sent.catch(() => {});
    return sent;
  }

  /** @param {unknown} message */
  #raw(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  /** @param {string} text */
  async #onMessage(text) {
    const msg = /** @type {any} */ (parseStrictJson(text));
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "welcome" && typeof msg.time === "number") {
      this.clockOff = msg.time - Date.now();
    } else if (msg.type === "challenge") {
      const keyPair = this.keys.get(msg.address);
      if (!keyPair) return;
      const sig = await sign(keyPair.privateKey, "claim", `${new URL(this.url).host}\n${msg.nonce}`);
      this.#raw({ type: "prove", address: msg.address, sig });
    } else if (msg.type === "claimed") {
      this.pendingClaims.get(msg.address)?.done();
      this.pendingClaims.delete(msg.address);
    } else if (msg.type === "error" && msg.address) {
      this.pendingClaims.get(msg.address)?.fail(new Error(msg.error));
      this.pendingClaims.delete(msg.address);
    } else if (msg.type === "error") {
      console.warn("The helper server refused a message:", msg.error);
    } else if (msg.type === "replaced") {
      // Another holder of this key claimed it after us: the most recent claim wins.
      if (this.keys.delete(msg.address)) this.dispatchEvent(new CustomEvent("replaced", { detail: msg.address }));
    } else if (msg.type === "deliver") {
      const envelope = await open(msg.envelope);
      if (envelope && envelope.to && this.keys.has(envelope.to) && this.replays.accept(envelope)) {
        this.dispatchEvent(new CustomEvent("message", { detail: envelope }));
      }
    } else if (msg.type === "undeliverable") {
      this.dispatchEvent(new CustomEvent("undeliverable", { detail: msg.to }));
    }
  }
}
