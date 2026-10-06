// Player names: what people see instead of a player ID. A player may choose any name; until they do,
// their name comes from their ID, so the same secret phrase gives the same starting name on every device.
// Names are not unique and prove nothing: records and trust rest on the ID.

import { fromBase32 } from "./keys.js";

// 64 friendly words each (4096 names), chosen so that no pairing reads as rude.
const ADJECTIVES = (
  "amber brave breezy bright bouncy calm cheerful clever cosmic cozy crimson curious dapper daring dreamy " +
  "eager fancy frosty gentle gleaming glowing golden happy honest humble jolly keen kind lively lucky lunar " +
  "mellow merry mighty minty misty mossy nifty nimble noble peppy plucky polite quick quiet rosy rusty " +
  "silver snowy sparkly spry starry sunny swift tidy tiny velvet vivid wandering whimsical witty zesty " +
  "patient sunlit"
).split(" ");
const NOUNS = (
  "acorn badger beetle biscuit button cactus clover comet cricket dolphin dumpling ember falcon feather " +
  "fern galaxy garnet gecko hazel heron iceberg jigsaw kettle kite koala lagoon lantern lynx maple meadow " +
  "moose muffin nebula newt nutmeg orchid otter owl panda pebble penguin pinecone pretzel puddle puffin " +
  "quill quokka raven ripple rocket saffron sparrow sprout teapot thimble tulip turtle umbrella voyager " +
  "waffle walrus willow yak zebra"
).split(" ");

/** @param {string} word */
const capital = (word) => word[0].toUpperCase() + word.slice(1);

/** The starting name for a player ID, such as "Amber Otter". @param {string} id */
export function defaultName(id) {
  const bytes = fromBase32(id);
  return `${capital(ADJECTIVES[bytes[0] % 64])} ${capital(NOUNS[bytes[1] % 64])}`;
}

/**
 * Tidy a chosen name: trimmed, single spaces, no control characters, at most 40 characters.
 * Returns "" if nothing is left.
 * @param {unknown} name
 */
export function tidyName(name) {
  if (typeof name !== "string") return "";
  return name.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40).trim();
}

export const NAME_WORDS = { ADJECTIVES, NOUNS };
