// The board and loading by demand: play added up across hosts, wishes claimed like any record, and a
// host that loads the most wished-for game by itself. Every host here is on this computer; nothing
// asks the web.

import assert from "node:assert/strict";
import { join } from "node:path";
import { runGame } from "../host/host.js";
import { runHost } from "../host/hosting.js";
import { openHosts } from "../host/hosts.js";
import { hex, newWords, signerFromWords } from "../shared/keys.js";
import { addNote, addSignature, isComplete } from "../shared/signed.js";

let nextPort = 21100 + Math.floor(Math.random() * 400);
const MINUTE = 60 * 1000;

/** @typedef {import("../shared/keys.js").Signer} Signer */

/** A folder for one test, removed once `work` ends. @param {(temp: string) => Promise<void>} work */
async function withTemp(work) {
  const temp = await Deno.makeTempDir();
  try {
    await work(temp);
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
}

/** A host on this computer, keeping everything in a folder of its own under `temp`. @param {string} temp @param {Partial<Parameters<typeof runHost>[0]>} [options] */
async function hosting(temp, options = {}) {
  const port = options.port ?? nextPort++;
  /** @type {string[]} */
  const said = [];
  const host = await runHost({ base: `http://localhost:${port}/`, port, store: join(temp, "host-" + port), data: join(temp, "data-" + port), log: (text) => said.push(text), ...options });
  return Object.assign(host, { said, port });
}

/** A small game's folder: whoever comes in signed in is offered a record. @param {string} temp @param {string} name */
async function gameFolder(temp, name) {
  const folder = join(temp, name);
  await Deno.mkdir(folder);
  await Deno.writeTextFile(join(folder, "card.json"), JSON.stringify({ name, description: `${name}, a game for tests.` }));
  await Deno.writeTextFile(join(folder, "game.js"), `export default {
    join(game, player) { if (player.id) game.offer(player, [{ text: "Came in to ${name}." }]); },
    message(game, player, data) { game.send(player, data); },
  };`);
  await Deno.writeTextFile(join(folder, "index.html"), `<!doctype html><title>${name}</title>`);
  return folder;
}

const newPlayer = async () => signerFromWords(await newWords());

/** Sign in to the realm at an address, as a player's EntryPortal would, and return the session. @param {string} base @param {Signer} player */
async function signIn(base, player) {
  const code = await (await fetch(base + "endlessmind/start", { method: "POST" })).json();
  const note = await addSignature({ v: 1, type: "enter", player: player.id, address: code.address, time: Date.now(), nonce: hex(crypto.getRandomValues(new Uint8Array(16))) }, player);
  const told = await fetch(code.address, { method: "POST", body: new URLSearchParams({ enter: JSON.stringify(note) }) });
  assert.equal(told.status, 200, await told.text());
  const wait = await fetch(`${base}endlessmind/wait/${code.code}?token=${code.token}`);
  await wait.body?.cancel();
  return /** @type {string} */ (wait.headers.get("set-cookie")).split(";")[0];
}

/** Connect a display as the signed-in player, so the game offers its record. @param {string} base @param {string} cookie */
async function play(base, cookie) {
  const socket = new WebSocket(base.replace(/^http/, "ws") + "endlessmind/play?guest=" + "ab".repeat(16), /** @type {any} */ ({ headers: { cookie } }));
  try {
    await new Promise((done, failed) => {
      socket.onopen = () => socket.send(JSON.stringify("hello"));
      socket.onmessage = done;
      socket.onerror = () => failed(new Error("could not connect to " + base));
    });
  } finally {
    socket.close();
    await new Promise((done) => (socket.onclose = done));
  }
}

/**
 * Claim every record waiting for the player, as their EntryPortal would: public, with words of their
 * own if given. Returns the complete records.
 * @param {string} base @param {string} cookie @param {Signer} player @param {string} [words]
 */
async function claim(base, cookie, player, words) {
  const made = await (await fetch(base + "endlessmind/claim", { method: "POST", headers: { cookie } })).json();
  const asked = await fetch(made.address, { redirect: "manual" });
  await asked.body?.cancel();
  const { records } = JSON.parse(decodeURIComponent(/** @type {string} */ (asked.headers.get("location")).split("#sign=")[1]));
  const signed = [];
  for (const record of records) {
    const mine = await addSignature({ ...record, public: true }, player);
    signed.push(words ? await addNote(mine, player, words) : mine);
  }
  const back = await fetch(made.address, { method: "POST", body: new URLSearchParams({ records: JSON.stringify(signed) }), redirect: "manual" });
  await back.body?.cancel();
  return JSON.parse(decodeURIComponent(/** @type {string} */ (back.headers.get("location")).split("#sign=")[1])).records;
}

/** Play a game as a new player and claim the record it offers. @param {string} base @param {string} [words] */
async function newcomer(base, words) {
  const player = await newPlayer();
  const cookie = await signIn(base, player);
  await play(base, cookie);
  await claim(base, cookie, player, words);
  return { player, cookie };
}

/** Ask a host's board for a wish, and return the status of its answer. @param {string} base @param {string} release @param {Record<string, string>} [headers] */
async function ask(base, release, headers = {}) {
  const answer = await fetch(base + "endlessmind/wish", { method: "POST", headers, body: JSON.stringify({ release }) });
  await answer.body?.cancel();
  return answer.status;
}

/** Wish for a release on a host's board, and claim the wish. @param {string} base @param {string} cookie @param {Signer} player @param {string} release */
async function wish(base, cookie, player, release) {
  assert.equal(await ask(base, release, { cookie }), 200);
  return claim(base, cookie, player);
}

/** A host's board, as any web page reads it. @param {string} base @returns {Promise<any[]>} */
const games = async (base) => (await (await fetch(base + "endlessmind/board.json")).json()).games;

Deno.test("a board adds up the play on record across the hosts that run a release, and lists a game no host runs", async () => {
  await withTemp(async (temp) => {
    const jane = await hosting(temp, { game: await gameFolder(temp, "Garden") });
    const id = /** @type {string} */ (jane.release?.id);
    const realm = /** @type {string} */ (jane.realm?.id);
    const other = await hosting(temp, { load: [id], hosts: [jane.base] });
    // A game on its maker's computer, reached through Jane's relay: no host runs it.
    const home = await runGame({ folder: await gameFolder(temp, "Cellar"), relay: true, hosts: await openHosts({ store: join(temp, "home"), start: [jane.base] }), store: join(temp, "home"), port: nextPort++, log() {} });
    try {
      const there = other.hosted()[0].base;
      const first = await newcomer(jane.base, "Lovely.");
      // The same player plays on the other host too, and so does a second one.
      const again = await signIn(there, first.player);
      await play(there, again);
      await claim(there, again, first.player);
      const second = await newcomer(there);

      const answer = await fetch(jane.base + "endlessmind/board.json");
      assert.equal(answer.headers.get("access-control-allow-origin"), "*");
      const { games: listed, time, ...board } = await answer.json();
      assert.deepEqual(board, { v: 1, type: "board", host: jane.hosts.id, address: jane.base });
      assert(Math.abs(Date.now() - time) < MINUTE);
      const [{ notes: [note], ...garden }, cellar] = listed;
      assert.deepEqual(garden, {
        realm,
        release: id,
        name: "Garden",
        description: "Garden, a game for tests.",
        hosts: [{ id: jane.hosts.id, address: jane.base, play: jane.base }, { id: other.hosts.id, address: other.base, play: there }],
        relayed: [],
        players: 2,
        records: 3,
        wishes: 0,
      });
      assert.deepEqual([note.player, note.text], [first.player.id, "Lovely."]);
      assert.deepEqual(cellar, { realm: home.realm.id, release: home.release?.id, name: "Cellar", description: "Cellar, a game for tests.", hosts: [], relayed: [home.base], players: 0, records: 0, wishes: 0, notes: [] });
      assert.equal(listed.length, 2);
      // The other host's board says the same of the game both run.
      const [same] = await games(other.base);
      assert.deepEqual([same.release, same.players, same.records, same.hosts.length], [id, 2, 3, 2]);
      assert(second.player.id !== first.player.id);

      // The page itself, at the host's main address beside the resident game.
      const page = await fetch(jane.base + "endlessmind/board");
      assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
      const text = await page.text();
      assert(text.startsWith("<!doctype html>"));
      assert.match(text, /Wish for this game/);
      assert.match(await (await fetch(jane.base)).text(), /Garden/);
    } finally {
      await home.stop();
      await other.stop();
      await jane.stop();
    }
  });
});

Deno.test("a wish is claimed like any record and shows on another host's board; only a player's newest counts, for a week", async () => {
  await withTemp(async (temp) => {
    let clock = Date.now();
    const jane = await hosting(temp, { game: await gameFolder(temp, "Garden"), now: () => clock });
    const john = await hosting(temp, { game: await gameFolder(temp, "Pond"), hosts: [jane.base] });
    // A host with no game of its own: players sign in to a realm it opens under its own ID.
    const plain = await hosting(temp, { hosts: [jane.base], now: () => clock });
    try {
      const [garden, pond] = [jane, john].map((host) => /** @type {string} */ (host.release?.id));
      const card = await (await fetch(plain.base + "endlessmind-card.json")).json();
      assert.deepEqual([card.signers, card.name], [[plain.hosts.id], new URL(plain.base).host]);
      assert.match(await (await fetch(plain.base)).text(), /href="endlessmind\/board"/);

      const player = await newPlayer();
      assert.equal(await ask(plain.base, garden), 401, "a guest cannot wish");
      const cookie = await signIn(plain.base, player);
      assert.equal(await ask(plain.base, "0".repeat(40), { cookie }), 404, "only a game on the board can be wished for");
      assert.equal(await ask(plain.base, garden, { cookie, origin: jane.base.slice(0, -1) }), 403, "only the board's own page may ask");
      const [record] = await wish(plain.base, cookie, player, garden);
      assert.deepEqual([record.signers, record.text, record.data, record.public], [[plain.hosts.id, player.id], `I want to play Garden (release ${garden}).`, { wish: garden }, true]);
      assert(await isComplete(record));
      assert.deepEqual((await (await fetch(plain.base + "endlessmind-list.json")).json()).records, [record]);

      // The host where it was made shows it at once, and any other host once it reads that host's list.
      /** @param {{ base: string }} host */
      const wishes = async (host) => Object.fromEntries((await games(host.base)).map((game) => [game.name, game.wishes]));
      assert.deepEqual(await wishes(plain), { Garden: 1, Pond: 0 });
      assert.deepEqual(await wishes(jane), { Garden: 1, Pond: 0 });
      // A wish is not play.
      assert.deepEqual((await games(jane.base)).map((game) => game.players), [0, 0]);

      // A newer wish takes the older one's place. Jane's host reads the list again after ten minutes.
      await new Promise((done) => setTimeout(done, 5));
      await wish(plain.base, cookie, player, pond);
      assert.deepEqual(await wishes(plain), { Garden: 0, Pond: 1 });
      await jane.board.refresh();
      assert.deepEqual(await wishes(jane), { Garden: 1, Pond: 0 });
      clock += 11 * MINUTE;
      await jane.board.refresh();
      assert.deepEqual(await wishes(jane), { Garden: 0, Pond: 1 });
      // After a week it counts no more.
      clock += 7 * 24 * 60 * MINUTE;
      assert.deepEqual(await wishes(plain), { Garden: 0, Pond: 0 });
    } finally {
      await plain.stop();
      await john.stop();
      await jane.stop();
    }
  });
});

Deno.test("a host loads the most wished-for game by itself and drops it for one wished for more; wishes without trusted play count for nothing", async () => {
  await withTemp(async (temp) => {
    const jane = await hosting(temp, { game: await gameFolder(temp, "Garden") });
    const john = await hosting(temp, { game: await gameFolder(temp, "Pond"), hosts: [jane.base] });
    const [garden, pond] = [jane, john].map((host) => /** @type {string} */ (host.release?.id));
    const port = nextPort++;
    const mine = { port, game: await gameFolder(temp, "Lobby"), hosts: [jane.base] };
    let host = await hosting(temp, { ...mine, auto: 1 });
    try {
      assert.deepEqual(host.loaded(), [], "nothing is wished for yet");
      // Four players with play on record in this host's own game, and a crowd with none.
      const known = await Promise.all([1, 2, 3, 4].map(() => newcomer(host.base)));
      const crowd = await Promise.all([1, 2, 3, 4, 5].map(async () => {
        const player = await newPlayer();
        return { player, cookie: await signIn(host.base, player) };
      }));
      for (const { player, cookie } of crowd) await wish(host.base, cookie, player, pond);
      await wish(host.base, known[0].cookie, known[0].player, garden);
      const trust = [/** @type {string} */ (host.realm?.id)];
      assert.deepEqual([...(await host.board.wishes(trust))], [[garden, 1]]);
      assert.deepEqual([...(await host.board.wishes([/** @type {string} */ (jane.realm?.id)]))], [], "nobody here has play signed by Jane's game");
      assert.deepEqual(Object.fromEntries((await host.board.games()).map((game) => [game.name, game.wishes])), { Lobby: 0, Garden: 1, Pond: 5 });

      // One wish that counts beats five that do not.
      await host.round();
      assert.deepEqual(host.loaded(), [garden]);
      const [running] = host.hosted();
      assert.deepEqual([running.id, running.name], [garden, "Garden"]);
      assert.match(await (await fetch(running.base)).text(), /Garden/);
      assert.match(host.said.join("\n"), /Loaded Garden \(release [0-9a-f]{40}\) by itself: 1 wish from players with play this host trusts, and 1 other host runs it\./);
      assert.deepEqual((await host.hosts.card())?.runs.map((run) => run.name), ["Lobby", "Garden"]);
      // The hosts it knows were told, so their boards say who runs the game now.
      assert.deepEqual((await games(jane.base)).find((game) => game.release === garden).hosts.map((/** @type {any} */ one) => one.id), [jane.hosts.id, host.hosts.id]);
      // A player there leaves something behind.
      await newcomer(running.base);
      const kept = join(temp, "host-" + port, "games", running.realm, "realm-data.json");
      assert.equal(JSON.parse(await Deno.readTextFile(kept)).public.length, 1);

      // Two wishes for the other game: one each, so the game already running stays.
      await wish(host.base, known[1].cookie, known[1].player, pond);
      await host.round();
      assert.deepEqual(host.loaded(), [garden], "between equals, nothing changes");
      // A third makes it the more wished for.
      await wish(host.base, known[2].cookie, known[2].player, pond);
      await host.round();
      assert.deepEqual(host.loaded(), [pond]);
      assert.deepEqual(host.hosted().map((game) => game.name), ["Pond"]);
      assert.match(host.said.join("\n"), /Dropped Garden \(release [0-9a-f]{40}\): Pond has more wishes per host\./);
      await assert.rejects(() => Deno.stat(join(temp, "host-" + port, "releases", garden)), "the dropped release leaves the store");
      assert.equal(JSON.parse(await Deno.readTextFile(kept)).public.length, 1, "what its players saved is kept");
      assert.equal(await fetch(running.base).then((answer) => (answer.body?.cancel(), answer.status)), 503, "no game is at that name now");

      // Started again, it runs what it had loaded; without --auto, it lets it go.
      await host.stop();
      host = await hosting(temp, { ...mine, auto: 1 });
      assert.deepEqual(host.loaded(), [pond]);
      await host.stop();
      host = await hosting(temp, mine);
      assert.deepEqual(host.loaded(), []);
      assert.deepEqual(host.hosted(), []);
      await assert.rejects(() => Deno.stat(join(temp, "host-" + port, "releases", pond)));
    } finally {
      await host.stop();
      await john.stop();
      await jane.stop();
    }
  });
  await assert.rejects(() => runHost({ base: "http://localhost:1/", trust: ["someone"] }), /not the ID/);
  await assert.rejects(() => runHost({ base: "http://localhost:1/", auto: -1 }), /whole number/);
});
