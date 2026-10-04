// Keys, signatures and hashes, using only Web Crypto (built into browsers and Deno).
//
// Every key, signature and hash carries a label naming the method that made it
// ("ed25519:", "sha256:"), so stronger methods can be added in later protocol
// versions without changing the meaning of anything else.

import { fromBase64Url, toBase64Url, toHex, utf8 } from "./encoding.js";

const ED25519 = { name: "Ed25519" };

/**
 * Make a new key pair. By default the private key cannot be exported, so it
 * stays on this device (the "a key pair lives on exactly one device" rule).
 * @param {boolean} [extractable]
 * @returns {Promise<CryptoKeyPair>}
 */
export async function generateKeyPair(extractable = false) {
  return /** @type {CryptoKeyPair} */ (
    await crypto.subtle.generateKey(ED25519, extractable, ["sign", "verify"])
  );
}

/**
 * An object's address is its labeled public key.
 * @param {CryptoKey} publicKey
 * @returns {Promise<string>}
 */
export async function addressOf(publicKey) {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  return "ed25519:" + toBase64Url(raw);
}

/** @param {string} address @returns {boolean} */
export function isAddress(address) {
  return typeof address === "string" && /^ed25519:[A-Za-z0-9_-]{43}$/.test(address);
}

/** @type {Map<string, Promise<CryptoKey>>} */
const importedKeys = new Map();

/** @param {string} address @returns {Promise<CryptoKey>} */
function publicKeyFor(address) {
  if (!isAddress(address)) throw new Error("not an ed25519 address: " + address);
  let key = importedKeys.get(address);
  if (!key) {
    const raw = fromBase64Url(address.slice("ed25519:".length));
    key = crypto.subtle.importKey("raw", raw, ED25519, true, ["verify"]);
    importedKeys.set(address, key);
  }
  return key;
}

/**
 * @param {CryptoKey} privateKey
 * @param {string} text
 * @returns {Promise<string>} labeled signature
 */
export async function sign(privateKey, text) {
  const sig = new Uint8Array(await crypto.subtle.sign(ED25519, privateKey, utf8(text)));
  return "ed25519:" + toBase64Url(sig);
}

/**
 * @param {string} address signer's address
 * @param {string} text
 * @param {string} signature labeled signature
 * @returns {Promise<boolean>}
 */
export async function verify(address, text, signature) {
  try {
    if (typeof signature !== "string" || !signature.startsWith("ed25519:")) return false;
    const sig = fromBase64Url(signature.slice("ed25519:".length));
    return await crypto.subtle.verify(ED25519, await publicKeyFor(address), sig, utf8(text));
  } catch {
    return false;
  }
}

/**
 * Name a file by its content.
 * @param {Uint8Array<ArrayBuffer> | string} data
 * @returns {Promise<string>} labeled hash, "sha256:<hex>"
 */
export async function hashOf(data) {
  const bytes = typeof data === "string" ? utf8(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return "sha256:" + toHex(new Uint8Array(digest));
}

/** @param {string} hash @returns {boolean} */
export function isHash(hash) {
  return typeof hash === "string" && /^sha256:[0-9a-f]{64}$/.test(hash);
}
