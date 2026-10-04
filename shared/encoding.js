// Small byte helpers shared by the browser app and Deno. No dependencies.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** @param {string} text @returns {Uint8Array<ArrayBuffer>} */
export function utf8(text) {
  return textEncoder.encode(text);
}

/** @param {Uint8Array} bytes @returns {string} */
export function fromUtf8(bytes) {
  return textDecoder.decode(bytes);
}

// Lowercase base32 (RFC 4648 alphabet, no padding). Chosen for addresses and
// hashes because it survives everywhere text gets mangled: case-insensitive
// systems, host names (a 32-byte key fits in one 63-character DNS label),
// double-click selection, and reading aloud.
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** @param {Uint8Array} bytes @returns {string} */
export function toBase32(bytes) {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** @param {string} text @returns {Uint8Array<ArrayBuffer>} */
export function fromBase32(text) {
  const out = new Uint8Array(Math.floor((text.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let i = 0;
  for (const ch of text) {
    const v = BASE32.indexOf(ch);
    if (v < 0) throw new Error("not base32: " + ch);
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out[i++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return out;
}

/** @param {number} byteCount @returns {string} random base32 text */
export function randomId(byteCount = 16) {
  return toBase32(crypto.getRandomValues(new Uint8Array(byteCount)));
}

/**
 * Canonical JSON, as defined by RFC 8785 (JSON Canonicalization Scheme):
 * object keys sorted by UTF-16 code units at every level, no extra spaces,
 * strings and numbers written the way JavaScript's JSON.stringify writes them.
 * Two programs that build the same value always produce the same text, so a
 * signature over it can be checked anywhere, in any language.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("canonicalJson: numbers must be finite");
    }
    if (value === undefined || typeof value === "function" || typeof value === "bigint") {
      throw new Error("canonicalJson: not a JSON value");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}
