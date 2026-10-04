// The actor's character: one portable secret plus a description, which the
// portal creates on first visit and keeps across visits. The secret is the
// character's key, and its public half is the address the character is known
// by everywhere. A realm can instead be entered privately, under a key made
// from the secret and that realm's address (see keysIn). Realms read the
// description and make an in-realm form from it.

import { addressOf, keyPairForRealm, keyPairFromSecret, newPortableKey } from "../shared/crypto.js";
import * as store from "./store.js";

/**
 * The character's general API, readable by any realm. A default layout, not a
 * requirement: realms use what they understand and ignore the rest.
 * @typedef {object} CharacterInfo
 * @property {string} name
 * @property {string} color        CSS color
 * @property {string} description  plain-language description
 */

/**
 * @typedef {object} Character
 * @property {string} secret  the one secret all of the character's per-realm keys come from
 * @property {CharacterInfo} info
 */

const ADJECTIVES = ["Brave", "Quiet", "Swift", "Lucky", "Curious", "Gentle", "Bold", "Sly", "Merry", "Tiny"];
const ANIMALS = ["Otter", "Fox", "Heron", "Badger", "Moth", "Hare", "Newt", "Wren", "Lynx", "Beetle"];

/** @template T @param {T[]} list @returns {T} */
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** @returns {Promise<Character>} */
export async function myCharacter() {
  /** @type {Character | undefined} */
  const saved = await store.get("character");
  if (saved?.secret) return saved;
  const { secret } = await newPortableKey();
  const name = `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
  /** @type {Character} */
  const character = {
    secret,
    info: {
      name,
      color: `hsl(${Math.floor(Math.random() * 360)}, 75%, 60%)`,
      description: `A ${name.toLowerCase()} who likes to explore.`,
    },
  };
  await store.put("character", character);
  return character;
}

/** @param {Partial<CharacterInfo>} changes */
export async function updateCharacter(changes) {
  const character = await myCharacter();
  character.info = { ...character.info, ...changes };
  await store.put("character", character);
  return character;
}

/**
 * The key a character acts under in a realm. By default it is the character's own lasting key, the same
 * everywhere, so the character is recognized wherever it goes and its good name goes with it. A realm
 * entered privately gets a key used only there, which no other realm can connect to the character. The
 * choice is made on the first visit and kept, so a realm always sees the same address.
 * @param {Character} character @param {string} realm  the realm's address, or its release hash
 */
export async function keysIn(character, realm) {
  let how = await store.get("as:" + realm);
  if (how !== "self" && how !== "private") {
    how = await store.get("private") ? "private" : "self";
    await store.put("as:" + realm, how);
  }
  return how === "private" ? keyPairForRealm(character.secret, realm) : keyPairFromSecret(character.secret);
}

/**
 * Every address this character could be known by in a realm: its lasting one, and the private one for
 * that realm. Claims about either are the character's own.
 * @param {string} secret @param {string} realm
 * @returns {Promise<Map<string, CryptoKeyPair>>} address to the key behind it
 */
export async function addressesIn(secret, realm) {
  const pairs = [await keyPairFromSecret(secret), await keyPairForRealm(secret, realm)];
  return new Map(await Promise.all(pairs.map(async (k) => /** @type {[string, CryptoKeyPair]} */ ([await addressOf(k.publicKey), k]))));
}
