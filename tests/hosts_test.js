// Finding each other: hosts learn of one another, a host fetches a release without being told where
// it is, and a game at home finds a relay. Every host here is on this computer; nothing asks the web.

import assert from "node:assert/strict";
import { join } from "node:path";
import { runGame } from "../host/host.js";
import { runHost } from "../host/hosting.js";
import { hostAddress, openHosts } from "../host/hosts.js";
import { relayedBase } from "../host/relay.js";
import { newWords, signerFromWords } from "../shared/keys.js";
import { addSignature, isComplete } from "../shared/signed.js";

let nextPort = 20600 + Math.floor(Math.random() * 400);

/** A folder for one test, removed once `work` ends. @param {(temp: string) => Promise<void>} work */
async function withTemp(work) {
  const temp = await Deno.makeTempDir();
  try {
    await work(temp);
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
}

/** A host on this computer, keeping its store in a folder of its own under `temp`. @param {string} temp @param {Partial<Parameters<typeof runHost>[0]>} [options] */
function hosting(temp, options = {}) {
  const port = nextPort++;
  return runHost({ base: `http://localhost:${port}/`, port, store: join(temp, "host-" + port), log() {}, ...options });
}

/** A small game's folder. @param {string} temp */
async function gameFolder(temp) {
  const folder = join(temp, "game");
  await Deno.mkdir(folder);
  await Deno.writeTextFile(join(folder, "card.json"), JSON.stringify({ name: "Found", description: "A game for tests." }));
  await Deno.writeTextFile(join(folder, "game.js"), `export default { message(game, player, data) { game.send(player, "found " + data); } };`);
  await Deno.writeTextFile(join(folder, "index.html"), "<!doctype html><title>Found</title>");
  return folder;
}

/** @param {{ hosts: { known(): { signers: string[] }[] } }} host */
const knows = (host) => host.hosts.known().map((card) => card.signers[0]).sort();

/** Send a card to a host, and return the status of its answer. @param {string} base @param {unknown} card */
async function send(base, card) {
  const answer = await fetch(base + "endlessmind/hosts", { method: "POST", body: JSON.stringify(card) });
  await answer.body?.cancel();
  return answer.status;
}

Deno.test("hosts find each other from one starting address, and each publishes a signed card", async () => {
  await withTemp(async (temp) => {
    const first = await hosting(temp, { game: "examples/maze", data: join(temp, "maze") });
    const second = await hosting(temp, { hosts: [first.base] });
    const third = await hosting(temp, { hosts: [first.base], relay: false, entryPortal: false });
    try {
      const [a, b, c] = [first, second, third].map((host) => /** @type {string} */ (host.hosts.id));
      assert.equal(new Set([a, b, c]).size, 3);
      // The second told the first of itself. The third read of the second in the first's list, and told both.
      assert.deepEqual(knows(first), [b, c].sort());
      assert.deepEqual(knows(second), [a, c].sort());
      assert.deepEqual(knows(third), [a, b].sort());

      // A host's card: signed by the host alone, and readable by any web page.
      const answer = await fetch(first.base + "endlessmind/host.json");
      assert.equal(answer.headers.get("access-control-allow-origin"), "*");
      const { sigs, time, ...card } = await answer.json();
      assert.deepEqual(card, {
        v: 1,
        type: "host",
        signers: [a],
        address: first.base,
        relay: true,
        portal: first.entryPortal,
        runs: [{ realm: first.realm?.id, release: first.release?.id, name: "Endless Maze", play: first.base }],
      });
      assert(await isComplete({ ...card, time, sigs }));
      assert(Math.abs(Date.now() - time) < 60000);
      // A host that neither relays nor serves an EntryPortal says neither.
      assert.deepEqual(Object.keys(await third.hosts.card() ?? {}).sort(), ["address", "runs", "signers", "sigs", "time", "type", "v"]);

      // The hosts it knows: its own card first.
      const list = await fetch(second.base + "endlessmind/hosts.json");
      assert.equal(list.headers.get("access-control-allow-origin"), "*");
      const { hosts, ...rest } = await list.json();
      assert.deepEqual(rest, { v: 1, type: "hosts" });
      assert.equal(hosts[0].signers[0], b);
      assert.deepEqual(hosts.slice(1).map((/** @type {any} */ card) => card.signers[0]).sort(), [a, c].sort());
    } finally {
      await third.stop();
      await second.stop();
      await first.stop();
    }
  });
});

Deno.test("a card is kept only if its address answers with a card by the same ID", async () => {
  await withTemp(async (temp) => {
    const here = await hosting(temp);
    const there = await hosting(temp);
    const stranger = await signerFromWords(await newWords());
    const port = nextPort++;
    /** What the stranger's own server answers with. @type {(request: Request) => Response} */
    let answers = () => new Response("Not found", { status: 404 });
    const theirs = Deno.serve({ port, onListen() {} }, (request) => answers(request));
    /** @param {Record<string, unknown>} [changes] */
    const signed = (changes = {}) => addSignature({ v: 1, type: "host", signers: [stranger.id], time: Date.now(), address: `http://localhost:${port}/`, runs: [], ...changes }, stranger);
    try {
      assert.deepEqual(knows(here), []);
      // A card that is well signed, for an address that is someone else's.
      assert.equal(await send(here.base, await signed({ address: there.base })), 400);
      // For an address of the stranger's own that does not answer, or answers with another card.
      assert.equal(await send(here.base, await signed()), 400);
      answers = () => Response.json({ hosts: [] });
      assert.equal(await send(here.base, await signed()), 400);
      // For one that sends whoever asks on to a real host's card.
      answers = () => Response.redirect(there.base + "endlessmind/host.json", 302);
      assert.equal(await send(here.base, await signed({ address: `http://localhost:${port}/` })), 400);
      // Changed after signing, signed by nobody, too old, or dated ahead.
      assert.equal(await send(here.base, { ...(await signed()), relay: true }), 400);
      assert.equal(await send(here.base, { v: 1, type: "host", signers: [stranger.id], time: Date.now(), address: `http://localhost:${port}/`, runs: [] }), 400);
      assert.equal(await send(here.base, await signed({ time: Date.now() - 25 * 60 * 60 * 1000 })), 400);
      assert.equal(await send(here.base, await signed({ time: Date.now() + 60 * 60 * 1000 })), 400);
      // For an address that is not a public one, or not a site's root.
      for (const address of ["http://127.0.0.1:" + port + "/", "https://10.0.0.7/", "http://host.example/", "https://host.example/games/", "https://router.local/", "file:///etc/passwd"]) {
        assert.equal(await send(here.base, await signed({ address })), 400, address);
      }
      // Far too long, or not JSON at all.
      assert.equal(await send(here.base, await signed({ runs: Array.from({ length: 300 }, () => ({ realm: stranger.id, release: "0".repeat(40), name: "x".repeat(80), play: "https://host.example/" })) })), 400);
      assert.equal(await send(here.base, "x".repeat(100000)), 400);
      assert.deepEqual(knows(here), []);

      // Once the stranger's address answers with the stranger's card, it is kept, and passed on.
      const card = await signed({ time: Date.now() + 1 });
      answers = () => Response.json(card);
      assert.equal(await send(here.base, card), 200);
      assert.deepEqual(knows(here), [stranger.id]);
      const { hosts } = await (await fetch(here.base + "endlessmind/hosts.json")).json();
      assert.deepEqual(hosts[1], card);
    } finally {
      await theirs.shutdown();
      await there.stop();
      await here.stop();
    }
  });
});

Deno.test("only public https addresses, and names under localhost at home, can be a host's", () => {
  assert.equal(hostAddress("https://host.example"), "https://host.example/");
  assert.equal(hostAddress("https://203-0-113-7.sslip.io/"), "https://203-0-113-7.sslip.io/");
  assert.equal(hostAddress("http://localhost:8000/", true), "http://localhost:8000/");
  assert.equal(hostAddress("http://abc.localhost:8000/", true), "http://abc.localhost:8000/");
  for (const bad of ["http://localhost:8000/", "http://host.example/", "https://203.0.113.7/", "https://[::1]/", "https://localhost/", "https://host/", "https://printer.lan/", "https://user:pass@host.example/", "https://host.example/a", "https://host.example/?a=1", "ftp://host.example/", "not an address", null]) {
    assert.equal(hostAddress(bad), null, String(bad));
  }
  assert.equal(hostAddress("http://host.example/", true), null);
});

Deno.test("a game on its maker's computer is found by its release's ID and fetched by a host", async () => {
  await withTemp(async (temp) => {
    const relay = await hosting(temp);
    const folder = await gameFolder(temp);
    // The maker runs the game at home, through a relay found among the known hosts.
    const home = await runGame({ folder, relay: true, hosts: await openHosts({ store: join(temp, "home"), start: [relay.base] }), store: join(temp, "home"), port: nextPort++, log() {} });
    const id = /** @type {string} */ (home.release?.id);
    /** @type {Awaited<ReturnType<typeof runHost>> | null} */
    let other = null;
    try {
      assert.equal(home.base, relayedBase(relay.base, home.realm.id));
      // The game's card names its release, and the relay's card names the game.
      assert.equal((await (await fetch(home.base + "endlessmind-card.json")).json()).release, id);
      const card = await (await fetch(relay.base + "endlessmind/host.json")).json();
      assert.deepEqual(card.relays, [{ id: home.realm.id, play: home.base }]);
      assert.deepEqual(card.runs, []);
      assert(await isComplete(card));

      // Another host is given the ID and nothing else but the relay's address to start from.
      other = await hosting(temp, { load: [id], hosts: [relay.base] });
      const [hosted] = other.hosted();
      assert.deepEqual(hosted, { id, realm: home.realm.id, name: "Found", base: `http://${home.realm.id}.${new URL(other.base).host}/` });
      assert.match(await (await fetch(hosted.base)).text(), /Found/);
      // From now on its own card says it runs that release, so the maker's computer is not needed.
      assert.deepEqual((await other.hosts.card())?.runs, [{ realm: home.realm.id, release: id, name: "Found", play: hosted.base }]);
      await home.stop();
      const reader = await openHosts({ store: join(temp, "reader"), start: [relay.base] });
      assert.deepEqual(await reader.sources(id), [other.base]);
      // Once the game has left, the relay's card no longer names it.
      assert.equal((await (await fetch(relay.base + "endlessmind/host.json")).json()).relays, undefined);
      assert.deepEqual(await reader.sources("0".repeat(40)), []);
    } finally {
      await home.stop();
      await other?.stop();
      await relay.stop();
    }
  });
});

Deno.test("a game at home finds a relay among the known hosts, passing over one that is full or gone", async () => {
  await withTemp(async (temp) => {
    const full = await hosting(temp, { games: 0 });
    const gone = await hosting(temp, { hosts: [full.base] });
    const free = await hosting(temp, { hosts: [full.base] });
    const none = await hosting(temp, { relay: false });
    const folder = await gameFolder(temp);
    /** @type {Awaited<ReturnType<typeof runGame>> | null} */
    let home = null;
    try {
      // It is told of one host only, which is full; that host's list names the others.
      const known = await openHosts({ store: join(temp, "home"), start: [full.base] });
      assert.deepEqual(await known.relays(), [full.base, gone.base, free.base]);
      assert.equal(await known.card(), null, "a game at home has no address, so it has no card");
      await gone.stop();
      home = await runGame({ folder, relay: true, hosts: known, store: join(temp, "home"), port: nextPort++, log() {} });
      assert.equal(home.base, relayedBase(free.base, home.realm.id));
      assert.deepEqual(free.games(), [home.realm.id]);
      assert.match(await (await fetch(home.base)).text(), /Found/);
      // None of the hosts was told of the game at home: it only reads.
      for (const host of [full, free]) assert(!knows(host).includes(home.realm.id));

      // With no host that relays, the game says so instead of starting where nobody can reach it.
      const alone = await openHosts({ store: join(temp, "alone"), start: [none.base] });
      assert.deepEqual(await alone.relays(), []);
      await assert.rejects(() => runGame({ folder, relay: true, hosts: alone, data: join(temp, "alone-data"), port: nextPort++, log() {} }), /No known host has room/);
    } finally {
      await home?.stop();
      await none.stop();
      await gone.stop();
      await free.stop();
      await full.stop();
    }
  });
});

Deno.test("known hosts are remembered across a restart, and forgotten a day after their cards were signed", async () => {
  await withTemp(async (temp) => {
    const host = await hosting(temp);
    const store = join(temp, "reader");
    let now = Date.now();
    try {
      const first = await openHosts({ store, start: [host.base], now: () => now });
      assert.deepEqual(await first.relays(), [host.base]);
      await first.stop();
      // Started again, it knows what it kept before asking anyone.
      const again = await openHosts({ store, start: [host.base], now: () => now });
      assert.deepEqual(again.known().map((card) => card.signers[0]), [host.hosts.id]);
      now += 23 * 60 * 60 * 1000;
      assert.equal(again.known().length, 1);
      now += 2 * 60 * 60 * 1000;
      assert.deepEqual(again.known(), []);
      const late = await openHosts({ store, start: [host.base], now: () => now });
      assert.deepEqual(late.known(), []);
    } finally {
      await host.stop();
    }
  });
});
