// Keys and IDs. Runs unchanged in browsers and Deno, using only WebCrypto.
//
// A key is an Ed25519 key pair. Its ID is the public key in lowercase base32 (52 characters),
// short enough to be a web address label. A person's key comes from 24 words (BIP39), which
// recreate the same key on any device.

import { WORDS } from "./words-en.js";

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const enc = new TextEncoder();

/** @param {Uint8Array} bytes */
export function base32(bytes) {
  let out = "", bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** @param {string} text */
export function fromBase32(text) {
  const out = [];
  let bits = 0, value = 0;
  for (const ch of text) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("not base32");
    value = ((value << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** @param {Uint8Array} bytes */
export function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** @param {string} text */
export function fromBase64url(text) {
  const s = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** @param {Uint8Array} bytes */
export function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** @param {string} id */
export function isId(id) {
  return typeof id === "string" && /^[a-z2-7]{52}$/.test(id);
}

/** @param {string} algorithm @param {Uint8Array<ArrayBuffer>} data */
export async function digest(algorithm, data) {
  return new Uint8Array(await crypto.subtle.digest(algorithm, data));
}

/** 24 new words: 256 random bits and an 8-bit checksum, as BIP39 says. */
export async function newWords() {
  return wordsFromEntropy(crypto.getRandomValues(new Uint8Array(32)));
}

/** @param {Uint8Array<ArrayBuffer>} entropy 32 bytes */
export async function wordsFromEntropy(entropy) {
  const check = (await digest("SHA-256", entropy))[0];
  const bits = [...entropy, check].map((b) => b.toString(2).padStart(8, "0")).join("");
  const words = [];
  for (let i = 0; i < 24; i++) words.push(WORDS[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]);
  return words.join(" ");
}

/**
 * Tidy typed or pasted words, or throw if they are not 24 valid words with a matching checksum. Anything
 * but letters is ignored, so a numbered list copied from a screenshot ("1. abandon 2. ability ...") works.
 * @param {string} text
 */
export async function checkWords(text) {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.length !== 24) throw new Error(`expected 24 words, got ${words.length}`);
  const bad = words.filter((w) => !WORDS.includes(w));
  if (bad.length) throw new Error(`not in the word list: ${bad.join(", ")}`);
  const bits = words.map((w) => WORDS.indexOf(w).toString(2).padStart(11, "0")).join("");
  const bytes = new Uint8Array(33);
  for (let i = 0; i < 33; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  if ((await digest("SHA-256", bytes.slice(0, 32)))[0] !== bytes[32]) {
    throw new Error("the words do not fit together; check for a mistyped word");
  }
  return words.join(" ");
}

/**
 * The phrase written compactly, for QR codes: its 256 random bits in base32 (52 characters). The words
 * are the BIP39 encoding of the same bits, so either form gives the other.
 * @param {string} words
 */
export async function compactPhrase(words) {
  const tidy = (await checkWords(words)).split(" ");
  const bits = tidy.map((w) => WORDS.indexOf(w).toString(2).padStart(11, "0")).join("");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return base32(bytes);
}

/** The words for a compact phrase. @param {string} compact */
export async function wordsFromCompact(compact) {
  if (!/^[a-z2-7]{52}$/.test(compact)) throw new Error("not a compact phrase");
  return wordsFromEntropy(fromBase32(compact));
}

/**
 * @typedef {{ id: string, privateKey: CryptoKey }} Signer
 * A signing key. The private key is non-extractable: not even this code can read it back.
 */

/** The BIP39 seed (64 bytes) for the words. @param {string} words @param {string} [passphrase] */
export async function seedFromWords(words, passphrase = "") {
  const tidy = await checkWords(words);
  const pw = await crypto.subtle.importKey("raw", enc.encode(tidy.normalize("NFKD")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const salt = enc.encode(("mnemonic" + passphrase).normalize("NFKD"));
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-512", salt, iterations: 2048 }, pw, 512),
  );
}

/** The SLIP-0010 Ed25519 master private key (32 bytes) for a seed. @param {Uint8Array<ArrayBuffer>} seed */
export async function masterKey(seed) {
  const mac = await crypto.subtle.importKey(
    "raw",
    enc.encode("ed25519 seed"),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", mac, seed)).slice(0, 32);
}

const PKCS8_PREFIX = Uint8Array.from([48, 46, 2, 1, 0, 48, 5, 6, 3, 43, 101, 112, 4, 34, 4, 32]);

/** @param {Uint8Array} raw a 32-byte Ed25519 private key @returns {Promise<Signer>} */
export async function signerFromPrivateKey(raw) {
  const pkcs8 = new Uint8Array(48);
  pkcs8.set(PKCS8_PREFIX);
  pkcs8.set(raw, 16);
  // Import once to learn the public key, then again so the key cannot be read out.
  const open = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", open);
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
  pkcs8.fill(0);
  return { id: base32(fromBase64url(/** @type {string} */ (jwk.x))), privateKey };
}

/** The key for 24 words: the BIP39 seed with no passphrase, then its SLIP-0010 master key. @param {string} words */
export async function signerFromWords(words) {
  const seed = await seedFromWords(words);
  const raw = await masterKey(seed);
  seed.fill(0);
  const signer = await signerFromPrivateKey(raw);
  raw.fill(0);
  return signer;
}

/** @param {Signer} signer @param {Uint8Array<ArrayBuffer>} data */
export async function sign(signer, data) {
  return new Uint8Array(await crypto.subtle.sign("Ed25519", signer.privateKey, data));
}

/** @param {string} id @param {Uint8Array<ArrayBuffer>} signature @param {Uint8Array<ArrayBuffer>} data */
export async function verify(id, signature, data) {
  if (!isId(id)) return false;
  try {
    const key = await crypto.subtle.importKey("raw", fromBase32(id), { name: "Ed25519" }, false, [
      "verify",
    ]);
    return await crypto.subtle.verify("Ed25519", key, signature, data);
  } catch {
    return false;
  }
}
