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

/** @param {Uint8Array} bytes @returns {string} */
export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** @param {Uint8Array} bytes @returns {string} */
export function toBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** @param {string} text @returns {Uint8Array<ArrayBuffer>} */
export function fromBase64Url(text) {
  const padded = text.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Canonical JSON: object keys sorted at every level, no extra spaces.
 * Two programs that build the same value always produce the same text, so a
 * signature over it can be checked anywhere.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("canonicalJson: numbers must be finite");
    }
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}
