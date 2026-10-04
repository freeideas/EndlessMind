// The player's character: one portable secret plus a description, which the
// app creates on first visit and keeps across visits. The secret is never used
// directly: inside each realm the character acts under a key made from the
// secret and that realm's address (keyPairForRealm), so no two realms see the
// same address. Realms read the description and make an in-realm form from it.

import { newPortableKey } from "../shared/crypto.js";
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
