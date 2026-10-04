// Keys, signatures and hashes, using only Web Crypto (built into browsers and Deno).
//
// Formats (see specs/PROTOCOL.md, "Identity" and "Content"):
//   address    ed25519-<52 lowercase base32 characters>   (the raw public key)
//   hash       sha256-<52 lowercase base32 characters>
//   signature  ed25519-<103 lowercase base32 characters>
// Each starts with a label naming the method that made it, so stronger methods
// can be added in later protocol versions without changing anything else.
//
// Every signature also covers a purpose label ("emind-envelope", "emind-claim"),
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
 * Rebuild a key pair from a 32-byte Ed25519 seed (the raw private key). Used
 * for test vectors; ordinary keys are made with generateKeyPair and never leave
 * their device.
 * @param {Uint8Array<ArrayBuffer>} seed
 * @returns {Promise<CryptoKeyPair>}
 */
export async function keyPairFromSeed(seed) {
  // PKCS #8 wrapping for an Ed25519 private key: a fixed 16-byte prefix, then the seed.
  const prefix = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
  const pkcs8 = new Uint8Array([...prefix, ...seed]);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, ED25519, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const publicKey = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, ED25519, true, ["verify"]);
  return { privateKey, publicKey };
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

/**
 * True if the text is base32 in its one canonical form: leftover bits at the
 * end must be zero, so no two strings decode to the same bytes.
 * @param {string} text
 */
function canonicalBase32(text) {
  try {
    return toBase32(fromBase32(text)) === text;
  } catch {
    return false;
  }
}

/** @param {unknown} address @returns {address is string} */
export function isAddress(address) {
  return typeof address === "string" && /^ed25519-[a-z2-7]{52}$/.test(address) &&
    canonicalBase32(address.slice(8));
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
  return utf8(`emind-${purpose}\n${text}`);
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
    if (!canonicalBase32(signature.slice(8))) return false;
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
  return typeof hash === "string" && /^sha256-[a-z2-7]{52}$/.test(hash) && canonicalBase32(hash.slice(7));
}
