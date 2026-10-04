// Connection to a helper server: claim addresses, send and receive signed
// envelopes through its relay. Runs the same in a browser and in Deno, so the
// app and the host program share it.

import { addressOf, sign } from "./crypto.js";
import { parseStrictJson } from "./encoding.js";
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
  }

  /** Connect (or reconnect) and re-claim every address. */
  connect() {
    this.ready = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.onopen = async () => {
        try {
          await Promise.all([...this.keys.values()].map((k) => this.#claim(k)));
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      socket.onerror = () => reject(new Error("cannot reach the server"));
      socket.onmessage = (event) => this.#onMessage(event.data);
      socket.onclose = () => {
        for (const claim of this.pendingClaims.values()) claim.fail(new Error("the connection to the server closed"));
        this.pendingClaims.clear();
        this.dispatchEvent(new Event("close"));
        if (!this.closedByUs) setTimeout(() => this.connect().catch(() => {}), 2000);
      };
    });
    return this.ready;
  }

  close() {
    this.closedByUs = true;
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
    const done = new Promise((resolve, reject) =>
      this.pendingClaims.set(address, { done: () => resolve(undefined), fail: reject })
    );
    this.#raw({ type: "claim", address });
    await done;
  }

  /** Stop speaking for an address, so the server no longer shows it as online. @param {string} address */
  release(address) {
    if (this.keys.delete(address)) this.#raw({ type: "release", address });
  }

  /**
   * Sign and send a message.
   * @param {CryptoKeyPair} from @param {string} to @param {string} kind @param {unknown} body
   */
  async send(from, to, kind, body) {
    const envelope = await seal(from, to, kind, body);
    this.#raw({ type: "send", envelope });
    return envelope;
  }

  /** @param {unknown} message */
  #raw(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  /** @param {string} text */
  async #onMessage(text) {
    const msg = /** @type {any} */ (parseStrictJson(text));
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "challenge") {
      const keyPair = this.keys.get(msg.address);
      if (!keyPair) return;
      const sig = await sign(keyPair.privateKey, "claim", `${new URL(this.url).host}\n${msg.nonce}`);
      this.#raw({ type: "prove", address: msg.address, sig });
    } else if (msg.type === "claimed") {
      this.pendingClaims.get(msg.address)?.done();
      this.pendingClaims.delete(msg.address);
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
