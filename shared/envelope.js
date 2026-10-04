// The signed message envelope: the one message shape everything uses.
// See specs/PROTOCOL.md ("Messages").

import { canonicalJson, randomId } from "./encoding.js";
import { addressOf, isAddress, sign, verify } from "./crypto.js";

/** The protocol version this code speaks. Draft versions start at 0. */
export const PROTOCOL_VERSION = "emind/0";

/**
 * @typedef {object} Envelope
 * @property {string} v      protocol version
 * @property {string} id     random, unique per message (with `from`), for spotting replays
 * @property {string} from   sender's address
 * @property {string | null} to  receiver's address, or null for a public statement
 * @property {string} kind   what kind of message: core kinds have no dot ("announce");
 *                           extension kinds are dotted ("emind.enter", "com.example.move")
 * @property {unknown} body  anything JSON can hold
 * @property {number} time   milliseconds since 1970, by the sender's clock
 * @property {string} sig    sender's signature over every other field
 */

/**
 * @param {CryptoKeyPair} keyPair sender
 * @param {string | null} to
 * @param {string} kind
 * @param {unknown} body
 * @param {{ id?: string, time?: number }} [fixed] set id and time (for test vectors only)
 * @returns {Promise<Envelope>}
 */
export async function seal(keyPair, to, kind, body, fixed = {}) {
  const unsigned = {
    v: PROTOCOL_VERSION,
    id: fixed.id ?? randomId(),
    from: await addressOf(keyPair.publicKey),
    to,
    kind,
    body: body ?? null,
    time: fixed.time ?? Date.now(),
  };
  return { ...unsigned, sig: await sign(keyPair.privateKey, "envelope", canonicalJson(unsigned)) };
}

/**
 * Check an envelope's shape and signature. The signature covers every field
 * except `sig` itself, including fields this code does not know, so later
 * versions and extensions can add fields that stay signed and are passed on
 * intact (rule 4 in specs/PROTOCOL.md: ignore what you do not understand).
 * @param {unknown} value
 * @returns {Promise<Envelope | null>} the envelope if valid, else null
 */
export async function open(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { sig, ...unsigned } = /** @type {Record<string, unknown>} */ (value);
  if (typeof unsigned.v !== "string" || !unsigned.v.startsWith("emind/")) return null;
  if (typeof unsigned.id !== "string" || unsigned.id.length < 16 || unsigned.id.length > 64) return null;
  if (!isAddress(unsigned.from)) return null;
  if (unsigned.to !== null && !isAddress(unsigned.to)) return null;
  if (typeof unsigned.kind !== "string" || typeof unsigned.time !== "number") return null;
  if (!("body" in unsigned)) return null;
  let text;
  try {
    text = canonicalJson(unsigned);
  } catch {
    return null;
  }
  if (!(await verify(unsigned.from, "envelope", text, sig))) return null;
  return /** @type {Envelope} */ (/** @type {unknown} */ ({ ...unsigned, sig }));
}

/**
 * Rejects copies of messages already seen, and messages whose time is too far
 * from now, so a recorded message cannot be sent again later.
 */
export class ReplayGuard {
  /** @param {number} [windowMs] how far a message's time may be from now */
  constructor(windowMs = 10 * 60 * 1000) {
    this.windowMs = windowMs;
    /** @type {Map<string, number>} message key to when it can be forgotten */
    this.seen = new Map();
  }

  /** @param {Envelope} envelope @returns {boolean} true if new and timely */
  accept(envelope) {
    const now = Date.now();
    if (Math.abs(now - envelope.time) > this.windowMs) return false;
    const key = envelope.from + " " + envelope.id;
    if (this.seen.has(key)) return false;
    this.seen.set(key, envelope.time + this.windowMs);
    if (this.seen.size > 10_000) {
      for (const [k, until] of this.seen) if (until < now) this.seen.delete(k);
    }
    return true;
  }
}
