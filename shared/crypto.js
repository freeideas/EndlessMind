// Keys, signatures and hashes, using only Web Crypto (built into browsers and Deno).
//
// Formats (see specs/PROTOCOL.md, "Identity" and "Content"):
//   address    ed25519-<52 lowercase base32 characters>   (the raw public key)
//   hash       sha256-<52 lowercase base32 characters>
//   signature  ed25519-<103 lowercase base32 characters>
// Each starts with a label naming the method that made it, so stronger methods
// can be added in later protocol versions without changing anything else.
//
// Every signature also covers a purpose label ("wwg-envelope", "wwg-claim"),
// so a signature made for one purpose can never be passed off as another.

import { fromBase32, toBase32, utf8 } from "./encoding.js";

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
  return "ed25519-" + toBase32(raw);
}

/** @param {unknown} address @returns {address is string} */
export function isAddress(address) {
  return typeof address === "string" && /^ed25519-[a-z2-7]{52}$/.test(address);
}

/** @type {Map<string, Promise<CryptoKey>>} */
const importedKeys = new Map();

/** @param {string} address @returns {Promise<CryptoKey>} */
function publicKeyFor(address) {
  if (!isAddress(address)) throw new Error("not an ed25519 address: " + address);
  let key = importedKeys.get(address);
  if (!key) {
    const raw = fromBase32(address.slice("ed25519-".length));
    key = crypto.subtle.importKey("raw", raw, ED25519, true, ["verify"]);
    importedKeys.set(address, key);
  }
  return key;
}

/** @param {string} purpose @param {string} text */
function signedBytes(purpose, text) {
  if (!/^[a-z0-9-]+$/.test(purpose)) throw new Error("bad signature purpose: " + purpose);
  return utf8(`wwg-${purpose}\n${text}`);
}

/**
 * @param {CryptoKey} privateKey
 * @param {string} purpose  what the signature is for, e.g. "envelope" or "claim"
 * @param {string} text
 * @returns {Promise<string>} labeled signature
 */
export async function sign(privateKey, purpose, text) {
  const sig = await crypto.subtle.sign(ED25519, privateKey, signedBytes(purpose, text));
  return "ed25519-" + toBase32(new Uint8Array(sig));
}

/**
 * @param {string} address signer's address
 * @param {string} purpose
 * @param {string} text
 * @param {unknown} signature labeled signature
 * @returns {Promise<boolean>}
 */
export async function verify(address, purpose, text, signature) {
  try {
    if (typeof signature !== "string" || !/^ed25519-[a-z2-7]{103}$/.test(signature)) return false;
    const sig = fromBase32(signature.slice("ed25519-".length));
    return await crypto.subtle.verify(ED25519, await publicKeyFor(address), sig, signedBytes(purpose, text));
  } catch {
    return false;
  }
}

/**
 * Name a file by its content.
 * @param {Uint8Array<ArrayBuffer> | string} data
 * @returns {Promise<string>} labeled hash
 */
export async function hashOf(data) {
  const bytes = typeof data === "string" ? utf8(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return "sha256-" + toBase32(new Uint8Array(digest));
}

/** @param {unknown} hash @returns {hash is string} */
export function isHash(hash) {
  return typeof hash === "string" && /^sha256-[a-z2-7]{52}$/.test(hash);
}
