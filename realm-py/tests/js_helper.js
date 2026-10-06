// Runs the JavaScript side of tests/test_cross.py: reads {command, input} as JSON on stdin and writes the
// answer as JSON, so the Python port can be compared with shared/*.js and realm/realm.js.

import { signerFromWords } from "../../shared/keys.js";
import { addSignature, canonical, validSigners } from "../../shared/signed.js";
import { defaultName, tidyName } from "../../shared/names.js";
import { qrSvg } from "../../shared/qr.js";
import { fileStore, memoryStore, openRealm } from "../../realm/realm.js";

/** @type {Record<string, (input: any) => Promise<any>>} */
const commands = {
  ids: async (phrases) => Promise.all(phrases.map(async (/** @type {string} */ w) => (await signerFromWords(w)).id)),
  canonical: async (values) => values.map((/** @type {unknown} */ v) => canonical(v)),
  sign: async ({ words, objects }) => {
    const signer = await signerFromWords(words);
    return Promise.all(objects.map((/** @type {any} */ o) => addSignature(o, signer)));
  },
  verify: async (objects) => Promise.all(objects.map((/** @type {any} */ o) => validSigners(o))),
  names: async (ids) => ids.map((/** @type {string} */ id) => defaultName(id)),
  tidy: async (names) => names.map((/** @type {unknown} */ n) => tidyName(n)),
  qr: async (texts) => texts.map((/** @type {string} */ t) => qrSvg(t)),
  card: async ({ base, card, words, now }) => (await openRealm({ base, card, words, store: memoryStore(), now: () => now })).card,
  // Open a realm on a data file written by the Python version, and say what it knows.
  realm: async ({ base, card, words, dataFile, player, cookie }) => {
    const realm = await openRealm({ base, card, words, store: fileStore(dataFile) });
    const request = new Request(base + "endlessmind/me", { headers: { cookie } });
    const me = await (/** @type {Response} */ (await realm.handle(request))).json();
    await realm.offer(player, [{ text: "Offered by the JavaScript version." }]);
    return { me, records: realm.records(player), list: realm.list(), name: realm.playerName(player) };
  },
};

const { command, input } = JSON.parse(await new Response(Deno.stdin.readable).text());
console.log(JSON.stringify(await commands[command](input)));
