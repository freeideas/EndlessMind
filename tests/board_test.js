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

/** Sign in to the realm at an address, as a player's EntryPortal would, and return the session. A visible sign-in is marked public: a visit. @param {string} base @param {Signer} player @param {boolean} [visible] */
async function signIn(base, player, visible = false) {
  const code = await (await fetch(base + "endlessmind/start", { method: "POST" })).json();
  const note = await addSignature({ v: 1, type: "enter", player: player.id, address: code.address, time: Date.now(), nonce: hex(crypto.getRandomValues(new Uint8Array(16))), ...(visible ? { public: true } : {}) }, player);
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

/** Play a game as a new player and claim the record it offers. @param {string} base @param {string} [words] @param {boolean} [visible] */
async function newcomer(base, words, visible = false) {
  const player = await newPlayer();
  const cookie = await signIn(base, player, visible);
  await play(base, cookie);
  await claim(base, cookie, player, words);
  return { player, cookie };
}

/** Ask a host's board for a wish, and return the status of its answer. @param {string} base @param {string} realm @param {Record<string, string>} [headers] */
async function ask(base, realm, headers = {}) {
  const answer = await fetch(base + "endlessmind/wish", { method: "POST", headers, body: JSON.stringify({ realm }) });
  await answer.body?.cancel();
  return answer.status;
}

/** Wish for a realm on a host's board, and claim the wish. @param {string} base @param {string} cookie @param {Signer} player @param {string} realm */
async function wish(base, cookie, player, realm) {
  assert.equal(await ask(base, realm, { cookie }), 200);
  return claim(base, cookie, player);
}

/** A host's board, as any web page reads it. @param {string} base @returns {Promise<any[]>} */
const games = async (base) => (await (await fetch(base + "endlessmind/board.json")).json()).games;

Deno.test("a board adds up a realm's play across the hosts that run any release of it, counting only players with play the host trusts, and a host follows a realm to its newest release", async () => {
  await withTemp(async (temp) => {
    const folder = await gameFolder(temp, "Garden");
    let jane = await hosting(temp, { game: folder });
    const id = /** @type {string} */ (jane.release?.id);
    const realm = /** @type {string} */ (jane.realm?.id);
    const other = await hosting(temp, { load: [realm], hosts: [jane.base] });
    // A game on its maker's computer, reached through Jane's relay: no host runs it.
    const home = await runGame({ folder: await gameFolder(temp, "Cellar"), relay: true, hosts: await openHosts({ store: join(temp, "home"), start: [jane.base] }), store: join(temp, "home"), port: nextPort++, log() {} });
    try {
      const there = other.hosted()[0].base;
      const first = await newcomer(jane.base, "Lovely.");
      // The same player plays on the other host too, and so does a second one, who never plays where
      // Jane's host trusts the signer: her board leaves that player out.
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
        name: "Garden",
        description: "Garden, a game for tests.",
        releases: [{ release: id, time: jane.release?.note.time, hosts: [{ id: jane.hosts.id, address: jane.base, play: jane.base }, { id: other.hosts.id, address: other.base, play: there }], relayed: [] }],
        players: 1,
        records: 2,
        visitors: 0,
        wishes: 0,
      });
      assert.deepEqual([note.player, note.text], [first.player.id, "Lovely."]);
      // A game no host runs gives no time for its release: only a host's card says it.
      assert.deepEqual(cellar, { realm: home.realm.id, name: "Cellar", description: "Cellar, a game for tests.", releases: [{ release: home.release?.id, hosts: [], relayed: [home.base] }], players: 0, records: 0, visitors: 0, wishes: 0, notes: [] });
      assert.equal(listed.length, 2);
      // The other host signed both players' play, so its board counts them both.
      const [same] = await games(other.base);
      assert.deepEqual([same.realm, same.players, same.records, same.releases[0].hosts.length], [realm, 2, 3, 2]);
      assert(second.player.id !== first.player.id);

      // Jane changes her game, and her host packs it again as it starts: a new release of the same realm.
      await Deno.writeTextFile(join(folder, "index.html"), "<!doctype html><title>Garden</title><p>Now with a pond.");
      await jane.stop();
      jane = await hosting(temp, { port: jane.port, game: folder });
      const newer = /** @type {string} */ (jane.release?.id);
      assert.notEqual(newer, id);
      // Still one entry for the realm, its releases newest first, and the play on the older one counts.
      const [both] = await games(jane.base);
      assert.deepEqual(both.releases.map((/** @type {any} */ one) => [one.release, one.hosts.map((/** @type {any} */ host) => host.id)]), [[newer, [jane.hosts.id]], [id, [other.hosts.id]]]);
      assert.deepEqual([both.realm, both.players, both.records], [realm, 1, 2]);
      // The other host follows the realm to its newest release, at the same name; its players' records stay.
      await other.round();
      assert.deepEqual(other.hosted().map((game) => [game.id, game.base]), [[newer, there]]);
      assert.match(await (await fetch(there)).text(), /Now with a pond/);
      assert.match(other.said.join("\n"), /Garden has a newer release/);
      await assert.rejects(() => Deno.stat(join(temp, "host-" + other.port, "releases", id)), "the older release leaves the store");
      const [followed] = await games(other.base);
      assert.deepEqual([followed.releases.length, followed.players, followed.records], [1, 2, 3]);

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
    // A host with no game of its own: players sign in to a realm it opens under its own ID. It trusts
    // the play signed by Jane's game.
    const plain = await hosting(temp, { hosts: [jane.base], trust: [/** @type {string} */ (jane.realm?.id)], now: () => clock });
    try {
      const [garden, pond] = [jane, john].map((host) => /** @type {string} */ (host.realm?.id));
      const card = await (await fetch(plain.base + "endlessmind-card.json")).json();
      assert.deepEqual([card.signers, card.name], [[plain.hosts.id], new URL(plain.base).host]);
      assert.match(await (await fetch(plain.base)).text(), /href="endlessmind\/board"/);

      // A player with play at Jane's game, and a stranger with none.
      const { player } = await newcomer(jane.base);
      const stranger = await newPlayer();
      const strangerCookie = await signIn(plain.base, stranger);
      assert.equal(await ask(plain.base, garden), 401, "a guest cannot wish");
      const cookie = await signIn(plain.base, player);
      assert.equal(await ask(plain.base, "a".repeat(52), { cookie }), 404, "only a game on the board can be wished for");
      assert.equal(await ask(plain.base, garden, { cookie, origin: jane.base.slice(0, -1) }), 403, "only the board's own page may ask");
      const [record] = await wish(plain.base, cookie, player, garden);
      assert.deepEqual([record.signers, record.text, record.data, record.public], [[plain.hosts.id, player.id], `I want to play Garden (realm ${garden}).`, { wish: garden }, true]);
      assert(await isComplete(record));
      assert.deepEqual((await (await fetch(plain.base + "endlessmind-list.json")).json()).records, [record]);
      await wish(plain.base, strangerCookie, stranger, garden);

      // The host where it was made shows it at once, and any other host once it reads that host's list.
      // The stranger's wish counts for nothing: nobody trusted has signed play with them.
      /** @param {{ base: string }} host */
      const wishes = async (host) => Object.fromEntries((await games(host.base)).map((game) => [game.name, game.wishes]));
      assert.deepEqual(await wishes(plain), { Garden: 1, Pond: 0 });
      assert.deepEqual(await wishes(jane), { Garden: 1, Pond: 0 });
      // A wish is not play.
      assert.deepEqual((await games(jane.base)).map((game) => game.players), [1, 0]);

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

Deno.test("a board counts the public visits of players who count as visitors, a weaker number than play; a visit never makes a player count", async () => {
  await withTemp(async (temp) => {
    let clock = Date.now();
    const jane = await hosting(temp, { game: await gameFolder(temp, "Garden"), now: () => clock });
    const john = await hosting(temp, { game: await gameFolder(temp, "Pond"), hosts: [jane.base] });
    const kim = await hosting(temp, { game: await gameFolder(temp, "Lake"), hosts: [jane.base] });
    try {
      const lake = /** @type {string} */ (kim.realm?.id);
      const garden = /** @type {NonNullable<typeof jane.realm>} */ (jane.realm);
      // A player with play at Jane's game, who signs in there in public, then comes to Pond in public
      // without playing, and wishes for Lake.
      const known = await newcomer(jane.base, undefined, true);
      await signIn(john.base, known.player, true);
      await wish(jane.base, known.cookie, known.player, lake);
      // A second player with play at Jane's game, who comes to Lake without marking it public.
      const quiet = await newcomer(jane.base);
      await signIn(kim.base, quiet.player);
      // A player who only ever comes in public, and wishes: neither makes them count.
      const visitor = await newPlayer();
      await signIn(john.base, visitor, true);
      await wish(jane.base, await signIn(jane.base, visitor, true), visitor, lake);
      // Visits that do not count: one made at another address, one whose proof does not check out, and junk.
      const nonce = () => hex(crypto.getRandomValues(new Uint8Array(16)));
      const elsewhere = await addSignature({ v: 1, type: "enter", player: quiet.player.id, address: "http://elsewhere.test/join/X", time: clock, nonce: nonce(), public: true }, quiet.player);
      const unsure = await addSignature({ v: 1, type: "enter", player: quiet.player.id, address: jane.base + "join/X", time: clock, nonce: nonce() }, quiet.player);
      Object.assign(garden.data.visits, { a: elsewhere, b: { ...unsure, public: true }, c: "junk", d: null });

      /** @param {{ base: string }} host */
      const counts = async (host) => (await games(host.base)).map((game) => [game.name, game.players, game.records, game.visitors, game.wishes]);
      // Pond, with one visitor, comes before Lake, with one wish.
      assert.deepEqual(await counts(jane), [["Garden", 2, 2, 1, 0], ["Pond", 0, 0, 1, 0], ["Lake", 0, 0, 0, 1]]);

      // A burned player's visits count no more.
      garden.data.burned[known.player.id] = {};
      clock += 11 * MINUTE;
      await jane.board.refresh();
      assert.deepEqual((await counts(jane)).map((game) => game[3]), [0, 0, 0]);
      delete garden.data.burned[known.player.id];
      clock += MINUTE;
      assert.deepEqual((await counts(jane)).map((game) => game[3]), [1, 1, 0]);
      // After a week a visit counts no more.
      clock += 7 * 24 * 60 * MINUTE;
      await jane.board.refresh();
      assert.deepEqual((await counts(jane)).map((game) => game[3]), [0, 0, 0]);
    } finally {
      await kim.stop();
      await john.stop();
      await jane.stop();
    }
  });
});

Deno.test("nothing signed by a burned ID counts on a board: not a burned player's play, notes and wishes, nor a burned realm's or host's records", async () => {
  await withTemp(async (temp) => {
    const jane = await hosting(temp, { game: await gameFolder(temp, "Garden") });
    const john = await hosting(temp, { game: await gameFolder(temp, "Pond"), hosts: [jane.base] });
    try {
      const garden = /** @type {NonNullable<typeof jane.realm>} */ (jane.realm);
      const pond = /** @type {string} */ (john.realm?.id);
      const johnId = /** @type {string} */ (john.hosts.id);
      // One player with play at both games, who wishes for Pond, and one with play at Jane's game only.
      const burnt = await newcomer(jane.base, "Lovely.");
      const again = await signIn(john.base, burnt.player);
      await play(john.base, again);
      await claim(john.base, again, burnt.player);
      await wish(jane.base, burnt.cookie, burnt.player, pond);
      const stays = await newcomer(jane.base);

      /** @returns {Promise<any[]>} */
      const counts = async () => (await games(jane.base)).map((game) => [game.name, game.players, game.records, game.wishes, game.notes.length]);
      assert.deepEqual(await counts(), [["Garden", 2, 2, 0, 1], ["Pond", 1, 1, 1, 0]]);

      // Once the first player is burned, their play, notes and wish are gone from the board, history included.
      garden.data.burned[burnt.player.id] = {};
      assert.deepEqual(await counts(), [["Garden", 1, 1, 0, 0], ["Pond", 0, 0, 0, 0]]);
      delete garden.data.burned[burnt.player.id];
      assert.deepEqual(await counts(), [["Garden", 2, 2, 0, 1], ["Pond", 1, 1, 1, 0]]);

      // A burned realm: Pond, everything its ID signed, and every run of it are gone.
      garden.data.burned[pond] = {};
      assert.deepEqual(await counts(), [["Garden", 2, 2, 0, 1]]);
      delete garden.data.burned[pond];
      // A burned host: its card, and so what it runs and the records signed where it says, are gone.
      garden.data.burned[johnId] = {};
      assert.deepEqual(await counts(), [["Garden", 2, 2, 0, 1]]);
      delete garden.data.burned[johnId];
      assert.deepEqual(await counts(), [["Garden", 2, 2, 0, 1], ["Pond", 1, 1, 1, 0]]);
      assert(stays.player.id !== burnt.player.id);
    } finally {
      await john.stop();
      await jane.stop();
    }
  });
});

Deno.test("a host loads the most wished-for game by itself and drops it for one wished for more; wishes without trusted play count for nothing", async () => {
  await withTemp(async (temp) => {
    const jane = await hosting(temp, { game: await gameFolder(temp, "Garden") });
    const john = await hosting(temp, { game: await gameFolder(temp, "Pond"), hosts: [jane.base] });
    const [garden, pond] = [jane, john].map((host) => /** @type {string} */ (host.realm?.id));
    const [gardenRelease, pondRelease] = [jane, john].map((host) => /** @type {string} */ (host.release?.id));
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
      assert.deepEqual(Object.fromEntries((await host.board.games()).map((game) => [game.name, game.wishes])), { Lobby: 0, Garden: 1, Pond: 0 });

      // One wish that counts beats five that do not.
      await host.round();
      assert.deepEqual(host.loaded(), [garden]);
      const [running] = host.hosted();
      assert.deepEqual([running.id, running.realm, running.name], [gardenRelease, garden, "Garden"]);
      assert.match(await (await fetch(running.base)).text(), /Garden/);
      assert.match(host.said.join("\n"), /Loaded Garden \(realm [a-z2-7]{52}\) by itself: 1 wish from players this host counts, and 1 other host runs it\./);
      assert.deepEqual((await host.hosts.card())?.runs.map((run) => run.name), ["Lobby", "Garden"]);
      // The hosts it knows were told, so their boards say who runs the game now.
      assert.deepEqual((await games(jane.base)).find((game) => game.realm === garden).releases[0].hosts.map((/** @type {any} */ one) => one.id), [jane.hosts.id, host.hosts.id]);
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
      assert.match(host.said.join("\n"), /Dropped Garden \(realm [a-z2-7]{52}\): Pond has more wishes per host\./);
      await assert.rejects(() => Deno.stat(join(temp, "host-" + port, "releases", gardenRelease)), "the dropped release leaves the store");
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
      await assert.rejects(() => Deno.stat(join(temp, "host-" + port, "releases", pondRelease)));
    } finally {
      await host.stop();
      await john.stop();
      await jane.stop();
    }
  });
  await assert.rejects(() => runHost({ base: "http://localhost:1/", trust: ["someone"] }), /not the ID/);
  await assert.rejects(() => runHost({ base: "http://localhost:1/", auto: -1 }), /whole number/);
  await assert.rejects(() => runHost({ base: "http://localhost:1/", load: ["0".repeat(64)] }), /not the ID of a realm/);
});
