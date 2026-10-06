// The secret-phrase recipe must match the published standards, so any login page made by anyone
// turns the same 24 words into the same ID. Vectors: BIP39 (Trezor's list) and SLIP-0010.

import assert from "node:assert/strict";
import {
  compactPhrase,
  wordsFromCompact,
  base32,
  checkWords,
  fromBase32,
  hex,
  masterKey,
  newWords,
  seedFromWords,
  signerFromPrivateKey,
  signerFromWords,
  wordsFromEntropy,
} from "../shared/keys.js";
import { addSignature, canonical, isComplete, validSigners } from "../shared/signed.js";
import { defaultName, tidyName } from "../shared/names.js";

const fromHex = (/** @type {string} */ s) => Uint8Array.from(s.match(/../g) ?? [], (b) => parseInt(b, 16));
const ZERO_WORDS = Array(23).fill("abandon").concat("art").join(" ");

Deno.test("BIP39: 24 words from entropy, and the seed (Trezor vector, passphrase TREZOR)", async () => {
  assert.deepEqual(await wordsFromEntropy(new Uint8Array(32)), ZERO_WORDS);
  assert.deepEqual(
    hex(await seedFromWords(ZERO_WORDS, "TREZOR")),
    "bda85446c68413707090a52022edd26a1c9462295029f2e60cd7c4f2bbd3097170af7a4d73245cafa9c3cca8d561a7c3de6f5d4a10be8ed2a5e608d68f92fcc8",
  );
});

Deno.test("SLIP-0010: Ed25519 master key (test vector 1)", async () => {
  const raw = await masterKey(fromHex("000102030405060708090a0b0c0d0e0f"));
  assert.deepEqual(hex(raw), "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7");
  const signer = await signerFromPrivateKey(raw);
  assert.deepEqual(hex(fromBase32(signer.id)), "a4b2856bfec510abab89753fac1ac0e1112364e7d250545963f135f2a33188ed");
});

Deno.test("the ID for the all-zero phrase (example in PROTOCOL.md)", async () => {
  assert.deepEqual((await signerFromWords(ZERO_WORDS)).id, "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a");
});

Deno.test("typed words are tidied, and mistakes are caught", async () => {
  assert.deepEqual(await checkWords("  Abandon " + ZERO_WORDS.slice(8).toUpperCase() + "\n"), ZERO_WORDS);
  await assert.rejects(() => checkWords(ZERO_WORDS.replace(/art$/, "zoo")), { message: new RegExp("fit together") });
  await assert.rejects(() => checkWords(ZERO_WORDS.replace(/art$/, "artt")), { message: new RegExp("not in the word list") });
  await assert.rejects(() => checkWords("abandon art"), { message: new RegExp("24 words") });
  await checkWords(await newWords());
});

Deno.test("base32 round trip", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  assert.deepEqual(fromBase32(base32(bytes)), bytes);
});

Deno.test("canonical JSON sorts keys and refuses fractions", () => {
  assert.deepEqual(canonical({ b: 1, a: [true, null, "x"], c: { z: 1, y: 2 } }), '{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}');
  let threw = false;
  try {
    canonical({ a: 1.5 });
  } catch {
    threw = true;
  }
  assert.ok(threw);
});

Deno.test("a record is complete only when every signer has signed the same text", async () => {
  const realm = await signerFromWords(await wordsFromEntropy(new Uint8Array(32).fill(1)));
  const player = await signerFromWords(ZERO_WORDS);
  const record = { v: 1, type: "record", signers: [realm.id, player.id], time: 1790000000000, text: "Finished the Glass Maze." };
  const half = await addSignature(record, realm);
  assert.deepEqual(await isComplete(half), false);
  const whole = await addSignature(half, player);
  assert.deepEqual(await isComplete(whole), true);
  const changed = { ...whole, text: "Finished the Glass Maze twice." };
  assert.deepEqual(await validSigners(changed), []);
});

Deno.test("the signed examples in PROTOCOL.md check out", async () => {
  const md = await Deno.readTextFile(new URL("../specs/PROTOCOL.md", import.meta.url));
  const examples = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]).filter((t) => t.includes('"sigs"') && !t.includes('"..."'));
  assert.ok(examples.length >= 2);
  for (const text of examples) {
    const example = JSON.parse(text);
    assert.deepEqual((await validSigners(example)).sort(), Object.keys(example.sigs).sort(), text);
  }
});

Deno.test("a numbered list pasted from a screenshot is read as the phrase", async () => {
  const numbered = ZERO_WORDS.split(" ").map((w, i) => `${i + 1}. ${w}`).join("\n");
  assert.deepEqual(await checkWords(numbered), ZERO_WORDS);
});

Deno.test("names: a starting name from the ID, and tidy chosen names", async () => {
  const id = (await signerFromWords(ZERO_WORDS)).id;
  assert.match(defaultName(id), /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.equal(tidyName("  Moon \u0000 Pie\n "), "Moon Pie");
  assert.equal(tidyName("x".repeat(60)).length, 40);
  assert.equal(tidyName(7), "");
});

Deno.test("the compact phrase for QR codes gives back the same words", async () => {
  assert.equal(await wordsFromCompact(await compactPhrase(ZERO_WORDS)), ZERO_WORDS);
  const words = await newWords();
  const compact = await compactPhrase(words);
  assert.equal(compact.length, 52);
  assert.equal(await wordsFromCompact(compact), words);
});
