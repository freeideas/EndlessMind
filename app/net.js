// Connection to a helper server: claim addresses, send and receive signed
// envelopes through its relay. Direct peer connections (WebRTC) come later;
// the envelope format does not change when they do.

import { addressOf, sign } from "../shared/crypto.js";
import { open, seal } from "../shared/envelope.js";

/** @typedef {import("../shared/envelope.js").Envelope} Envelope */

export class Relay extends EventTarget {
  /** @param {string} url WebSocket address, e.g. wss://host/ws */
  constructor(url) {
    super();
    this.url = url;
    /** @type {WebSocket | null} */
    this.socket = null;
    /** Key pairs this connection speaks for. @type {Map<string, CryptoKeyPair>} */
    this.keys = new Map();
    /** @type {Map<string, () => void>} */
    this.pendingClaims = new Map();
    /** @type {Promise<void> | null} */
    this.ready = null;
    this.closedByUs = false;
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
        this.dispatchEvent(new Event("close"));
        if (!this.closedByUs) setTimeout(() => this.connect(), 2000);
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
    const done = new Promise((resolve) => this.pendingClaims.set(address, () => resolve(undefined)));
    this.#raw({ type: "claim", address });
    await done;
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
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.type === "challenge") {
      const keyPair = this.keys.get(msg.address);
      if (!keyPair) return;
      const sig = await sign(keyPair.privateKey, "everygame-claim:" + msg.nonce);
      this.#raw({ type: "prove", address: msg.address, sig });
    } else if (msg.type === "claimed") {
      this.pendingClaims.get(msg.address)?.();
      this.pendingClaims.delete(msg.address);
    } else if (msg.type === "deliver") {
      const envelope = await open(msg.envelope);
      if (envelope && envelope.to && this.keys.has(envelope.to)) {
        this.dispatchEvent(new CustomEvent("message", { detail: envelope }));
      }
    } else if (msg.type === "undeliverable") {
      this.dispatchEvent(new CustomEvent("undeliverable", { detail: msg.to }));
    }
  }
}

/** The relay address of the server this page came from. */
export function defaultRelayUrl() {
  return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
}
