// Releases: a game packed under an ID, checked byte for byte, fetched between hosts and run by ID.

import assert from "node:assert/strict";
import { join } from "node:path";
import { runHost } from "../host/hosting.js";
import { runGame } from "../host/host.js";
import { relayedBase } from "../host/relay.js";
import { checkRelease, fetchRelease, findRelease, NOTE, pack } from "../host/release.js";
import { hex, newWords, signerFromWords } from "../shared/keys.js";
import { addSignature, isComplete } from "../shared/signed.js";

let nextPort = 20100 + Math.floor(Math.random() * 400);

/** A game's folder made here, with a realm of its own. @param {string} temp @param {string} [name] */
async function gameFolder(temp, name = "game") {
  const folder = join(temp, name);
  await Deno.mkdir(join(folder, "art"), { recursive: true });
  await Deno.writeTextFile(join(folder, "card.json"), JSON.stringify({ name: "Packed", description: "A game for tests.", tags: ["test"] }));
  // The comment names a file for its types only, as the examples do; it is not part of the release.
  await Deno.writeTextFile(join(folder, "game.js"), `import { greeting } from "./words.js";
    /** @typedef {import("../../host/sealed.js").Game} Game */
    export default {
      join(game, player) { game.offer(player, [{ text: "You came in." }]); },
      message(game, player, data) { game.send(player, { said: greeting + data, who: player.who }); },
    };`);
  await Deno.writeTextFile(join(folder, "words.js"), `export const greeting = "hello ";\n`);
  await Deno.writeTextFile(join(folder, "index.html"), "<!doctype html><title>Packed</title>");
  await Deno.writeFile(join(folder, "art", "big.bin"), Uint8Array.from({ length: 600000 }, (_, i) => (i * 13) % 251));
  await Deno.writeTextFile(join(folder, ".secret-notes.txt"), "never packed");
  return folder;
}

/** @param {string} address @param {RequestInit} [how] */
const status = (address, how) => fetch(address, how).then((answer) => (answer.body?.cancel(), answer.status));

/** Send one message on a display's line and return the answer. @param {string} base @param {unknown} data @param {Record<string, string>} [headers] */
async function ask(base, data, headers = {}) {
  const socket = new WebSocket(base.replace(/^http/, "ws") + "endlessmind/play?guest=" + "ab".repeat(16), /** @type {any} */ ({ headers }));
  try {
    return await new Promise((done, failed) => {
      socket.onopen = () => socket.send(JSON.stringify(data));
      socket.onmessage = (event) => done(JSON.parse(event.data));
      socket.onerror = () => failed(new Error("could not connect to " + base));
    });
  } finally {
    socket.close();
    await new Promise((done) => (socket.onclose = done));
  }
}

Deno.test("packing a game gives a release whose ID covers every file, signed by the realm", async () => {
  const temp = await Deno.makeTempDir();
  try {
    const folder = await gameFolder(temp);
    const store = join(temp, "store");
    const release = await pack({ folder, store });
    assert.match(release.id, /^[0-9a-f]{40}$/);
    assert.deepEqual(release.note.card, { name: "Packed", description: "A game for tests.", tags: ["test"] });
    assert.equal(release.note.signers[0], release.realm);
    assert(await isComplete(release.note));
    const files = [];
    for await (const entry of Deno.readDir(release.folder)) files.push(entry.name);
    assert.deepEqual(files.sort(), ["art", "card.json", NOTE, "game.js", "index.html", "words.js"].sort(), "nothing hidden is packed");

    // The same files give the same release; a changed file gives another.
    assert.equal((await pack({ folder, store })).id, release.id);
    const checked = await checkRelease(store, release.id);
    assert.deepEqual([checked.id, checked.realm], [release.id, release.realm]);
    await Deno.writeTextFile(join(folder, "words.js"), `export const greeting = "hi ";\n`);
    const second = await pack({ folder, store });
    assert.notEqual(second.id, release.id);
    assert.equal(second.realm, release.realm);

    // The ID is the torrent's ID: SHA-1 of the "info" part of the torrent file, as any torrent program computes it.
    const torrent = await Deno.readFile(join(store, "releases", release.id, "release.torrent"));
    assert.equal(new TextDecoder("latin1").decode(torrent.subarray(0, 8)), "d4:infod");
    assert.equal(hex(new Uint8Array(await crypto.subtle.digest("SHA-1", torrent.subarray(7, torrent.length - 1)))), release.id);
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
});

Deno.test("a release that was changed, added to, or signed by someone else is refused", async () => {
  const temp = await Deno.makeTempDir();
  try {
    const folder = await gameFolder(temp);
    const store = join(temp, "store");
    const { id, realm } = await pack({ folder, store });
    const files = join(store, "releases", id, "files");
    /** Make one change, see the release refused, and put it back. @param {string} what @param {() => Promise<unknown>} change @param {() => Promise<unknown>} undo */
    const refused = async (what, change, undo) => {
      await change();
      await assert.rejects(() => checkRelease(store, id), Error, what);
      await undo();
      await checkRelease(store, id);
    };
    const game = await Deno.readTextFile(join(files, "game.js"));
    await refused("a changed file", () => Deno.writeTextFile(join(files, "game.js"), game + "\n// changed"), () => Deno.writeTextFile(join(files, "game.js"), game));
    await refused("an added file", () => Deno.writeTextFile(join(files, "extra.js"), "export {};"), () => Deno.remove(join(files, "extra.js")));
    await refused("a missing file", () => Deno.rename(join(files, "words.js"), join(temp, "words.js")), () => Deno.rename(join(temp, "words.js"), join(files, "words.js")));

    // Someone else packs the same files as their own, then claims the first realm made them.
    const thief = await gameFolder(temp, "thief");
    const theirs = await pack({ folder: thief, store });
    assert.notEqual(theirs.realm, realm);
    assert.notEqual(theirs.id, id);
    const note = await Deno.readTextFile(join(files, NOTE));
    await Deno.writeTextFile(join(store, "releases", theirs.id, "files", NOTE), note);
    await assert.rejects(() => checkRelease(store, theirs.id));
    // A note that names the first realm but is signed by another is no better.
    const stranger = await signerFromWords(await newWords());
    const forged = await addSignature({ ...JSON.parse(note), sigs: undefined }, stranger);
    await refused("a forged note", () => Deno.writeTextFile(join(files, NOTE), JSON.stringify(forged)), () => Deno.writeTextFile(join(files, NOTE), note));
    await assert.rejects(() => checkRelease(store, "0".repeat(40)));
    await assert.rejects(() => checkRelease(store, "../../etc"));
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
});

Deno.test("a host runs a game from its release's ID, fetched from the host that has it", async () => {
  const temp = await Deno.makeTempDir();
  const folder = await gameFolder(temp);
  const ports = [nextPort++, nextPort++, nextPort++];
  // Jane's server: her game is the resident game, signed by its realm.
  const jane = await runHost({ base: `http://localhost:${ports[0]}/`, port: ports[0], game: folder, store: join(temp, "jane"), log() {} });
  const id = /** @type {string} */ (jane.release?.id);
  const realm = /** @type {string} */ (jane.realm?.id);
  // Someone else's server, given only the ID and where to fetch it.
  const other = await runHost({ base: `http://localhost:${ports[1]}/`, port: ports[1], store: join(temp, "other"), load: [id], from: [jane.base], log() {} });
  // And someone at home, through the second server's relay.
  const home = await runGame({ release: await findRelease({ store: join(temp, "home"), id, from: [other.base] }), secretFile: join(temp, "home", "host-secret.txt"), data: join(temp, "home", "data"), relay: other.base, port: ports[2], log() {} });
  try {
    assert.equal(jane.release?.realm, realm);
    const [hosted] = other.hosted();
    assert.deepEqual(hosted, { id, realm, name: "Packed", base: `http://${realm}.localhost:${ports[1]}/` });

    // The same game answers in all three places.
    assert.deepEqual(await ask(jane.base, "jane"), { said: "hello jane", who: "guest:" + "ab".repeat(16) });
    assert.deepEqual(await ask(hosted.base, "other"), { said: "hello other", who: "guest:" + "ab".repeat(16) });
    assert.deepEqual(await ask(home.base, "home"), { said: "hello home", who: "guest:" + "ab".repeat(16) });
    assert.match(await (await fetch(hosted.base)).text(), /Packed/);
    assert.equal(await status(hosted.base + NOTE), 200);

    // Jane's own server signs as the realm. The others sign under IDs of their own, naming the realm and the release.
    const cards = await Promise.all([jane.base, hosted.base, home.base].map(async (base) => (await fetch(base + "endlessmind-card.json")).json()));
    assert.deepEqual(cards.map((card) => [card.name, card.realm, card.release]), [["Packed", undefined, undefined], ["Packed", realm, id], ["Packed", realm, id]]);
    assert.equal(cards[0].signers[0], realm);
    assert.notEqual(cards[1].signers[0], realm);
    assert.notEqual(cards[2].signers[0], cards[1].signers[0]);
    for (const card of cards) assert(await isComplete(card));
    // At home the address is made from the host's own ID, since that is the ID it can prove.
    assert.equal(home.base, relayedBase(other.base, cards[2].signers[0]));

    // A record offered on the second server names what was played, and who vouches for it.
    const player = (await signerFromWords(await newWords())).id;
    const session = "c".repeat(48);
    const there = /** @type {any} */ (await Deno.readTextFile(join(temp, "other", "games", realm, "realm-data.json")).then(JSON.parse, () => ({})));
    assert.deepEqual(there.offers ?? {}, {});
    // (Sign-in itself is covered by the realm's own tests; here a session is put in place by hand.)
    await other.stop();
    await Deno.writeTextFile(join(temp, "other", "games", realm, "realm-data.json"), JSON.stringify({ ...there, sessions: { [session]: { player, created: Date.now() } } }));
    const again = await runHost({ base: `http://localhost:${ports[1]}/`, port: ports[1], store: join(temp, "other"), load: [id], log() {} });
    try {
      assert.equal((await ask(hosted.base, "back", { cookie: `endlessmind=${session}` })).who, "player:" + player);
      const kept = JSON.parse(await Deno.readTextFile(join(temp, "other", "games", realm, "realm-data.json")));
      const [offer] = kept.offers[player];
      assert.deepEqual([offer.signers, offer.realm, offer.release, offer.text], [[cards[1].signers[0], player], realm, id, "You came in."]);

      // A relay does not hand a hosted game's name to a game on another computer.
      const taken = await runGame({ folder, relay: again.base, port: nextPort++, data: join(temp, "jane-at-home"), secretFile: join(folder, ".data", "realm-secret.txt"), log() {} });
      assert(!again.games().includes(realm));
      assert.deepEqual(await ask(hosted.base, "still"), { said: "hello still", who: "guest:" + "ab".repeat(16) });
      await taken.stop();
    } finally {
      await again.stop();
    }
  } finally {
    await home.stop();
    await other.stop();
    await jane.stop();
    await Deno.remove(temp, { recursive: true });
  }
});

Deno.test("what a host sends is believed only as far as it matches the ID", async () => {
  const temp = await Deno.makeTempDir();
  const folder = await gameFolder(temp);
  const port = nextPort++, liar = nextPort++;
  const jane = await runHost({ base: `http://localhost:${port}/`, port, game: folder, store: join(temp, "jane"), relay: false, entryPortal: false, log() {} });
  const id = /** @type {string} */ (jane.release?.id);
  // A host that passes everything on truthfully, except one file.
  const lying = Deno.serve({ port: liar, onListen() {} }, async (request) => {
    const path = new URL(request.url).pathname;
    const real = await fetch(`http://localhost:${port}${path}`);
    if (!path.endsWith("/words.js")) return real;
    await real.body?.cancel();
    return new Response(`export const greeting = "gotcha";\n`);
  });
  try {
    const store = join(temp, "store");
    await assert.rejects(() => fetchRelease({ store, id, from: [`http://localhost:${liar}/`] }), /could not be fetched/);
    await assert.rejects(() => Deno.stat(join(store, "releases", id)), Deno.errors.NotFound, "nothing of a refused release is kept");
    await assert.rejects(() => findRelease({ store, id }), /could not be fetched|not on this computer/);
    // The honest host after the liar gives the real thing.
    const release = await fetchRelease({ store, id, from: [`http://localhost:${liar}/`, jane.base] });
    assert.equal(release.id, id);
    // A host hands out only the releases it runs, and nothing beside them.
    assert.equal(await status(`${jane.base}endlessmind/release/${"0".repeat(40)}.torrent`), 404);
    assert.equal(await status(`${jane.base}endlessmind/release/${id}/.secret-notes.txt`), 404);
    assert.equal(await status(`${jane.base}endlessmind/release/${id}/..%2Frelease.torrent`), 404);
  } finally {
    await lying.shutdown();
    await jane.stop();
    await Deno.remove(temp, { recursive: true });
  }
});

Deno.test("a game with a WebAssembly server packs and checks like any other, but not with both servers", async () => {
  const temp = await Deno.makeTempDir();
  try {
    const folder = join(temp, "counter");
    await Deno.mkdir(folder);
    for (const name of ["card.json", "index.html", "game.wasm"]) await Deno.copyFile(join("examples/counter", name), join(folder, name));
    const store = join(temp, "store");
    const release = await pack({ folder, store });
    assert.equal((await checkRelease(store, release.id)).id, release.id);
    await Deno.writeTextFile(join(folder, "game.js"), "export default {};");
    await assert.rejects(() => pack({ folder, store }), /game\.js or game\.wasm, one of them/);
    await Deno.remove(join(folder, "game.js"));
    await Deno.remove(join(folder, "game.wasm"));
    await assert.rejects(() => pack({ folder, store }), /game\.js or game\.wasm, one of them/);
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
});
