// The signed message envelope: the one message shape everything uses.
// See specs/PROTOCOL.md ("Messages") and specs/RUNTIME.md.

import { canonicalJson } from "./encoding.js";
import { addressOf, isAddress, sign, verify } from "./crypto.js";

/** The protocol version this code speaks. Draft versions start at 0. */
export const PROTOCOL_VERSION = "everygame/0";

/**
 * @typedef {object} Envelope
 * @property {string} v      protocol version
 * @property {string} from   sender's address
 * @property {string | null} to  receiver's address, or null for a public statement
 * @property {string} kind   what kind of message this is
 * @property {unknown} body  anything JSON can hold
 * @property {number} time   milliseconds since 1970, by the sender's clock
 * @property {string} sig    sender's signature over all the other fields
 */

/**
 * @param {CryptoKeyPair} keyPair sender
 * @param {string | null} to
 * @param {string} kind
 * @param {unknown} body
 * @returns {Promise<Envelope>}
 */
export async function seal(keyPair, to, kind, body) {
  const unsigned = {
    v: PROTOCOL_VERSION,
    from: await addressOf(keyPair.publicKey),
    to,
    kind,
    body: body ?? null,
    time: Date.now(),
  };
  return { ...unsigned, sig: await sign(keyPair.privateKey, canonicalJson(unsigned)) };
}

/**
 * Check an envelope's shape and signature. Unknown extra fields are ignored,
 * not rejected (rule 4 in specs/PROTOCOL.md), but they are not covered by the
 * signature, so they are dropped from the result.
 * @param {unknown} value
 * @returns {Promise<Envelope | null>} the envelope if valid, else null
 */
export async function open(value) {
  if (!value || typeof value !== "object") return null;
  const e = /** @type {Record<string, unknown>} */ (value);
  if (typeof e.v !== "string" || !e.v.startsWith("everygame/")) return null;
  if (typeof e.from !== "string" || !isAddress(e.from)) return null;
  if (e.to !== null && (typeof e.to !== "string" || !isAddress(e.to))) return null;
  if (typeof e.kind !== "string" || typeof e.time !== "number" || typeof e.sig !== "string") {
    return null;
  }
  const unsigned = { v: e.v, from: e.from, to: e.to, kind: e.kind, body: e.body ?? null, time: e.time };
  if (!(await verify(e.from, canonicalJson(unsigned), e.sig))) return null;
  return { ...unsigned, sig: e.sig };
}
