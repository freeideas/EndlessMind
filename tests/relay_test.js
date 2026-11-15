// The relay: a game on one computer is played at an address of its own on another.

import assert from "node:assert/strict";
import { join } from "node:path";
import { runGame } from "../host/host.js";
import { runHost } from "../host/hosting.js";
import { refuse, relayedBase } from "../host/relay.js";
import { newWords, signerFromWords } from "../shared/keys.js";
import { addSignature } from "../shared/signed.js";
import { makeMaze, solution } from "../examples/maze/maze.js";

let nextPort = 18900 + Math.floor(Math.random() * 500);

/** A host that only relays, on this computer. Names under `localhost` all lead here, so each game gets a site of its own. */
async function relaying(games = 20) {
  const port = nextPort++;
  /** @type {string[]} */
  const said = [];
  const store = await Deno.makeTempDir();
  const host = await runHost({ base: `http://localhost:${port}/`, port, games, entryPortal: false, store, log: (text) => said.push(text) });
  const relay = {
    games: host.games,
    async stop() {
      await host.stop();
      await Deno.remove(store, { recursive: true });
    },
  };
  return { relay, said, port, store, base: host.base };
}

/**
 * A game reached through `relay`, made here unless `folder` names one.
 * @param {string} relay @param {{ folder?: string, server?: string, data?: string }} [game]
 */
async function relayed(relay, game = {}) {
  const temp = await Deno.makeTempDir();
  let folder = game.folder;
  if (!folder) {
    folder = join(temp, "game");
    await Deno.mkdir(folder);
    await Deno.writeTextFile(join(folder, "card.json"), JSON.stringify({ name: "Test", description: "A test game." }));
    await Deno.writeTextFile(join(folder, "game.js"), game.server ?? `export default { message(game, player, data) { game.send(player, data === "who" ? player.who : data); } };`);
    await Deno.writeTextFile(join(folder, "index.html"), "<!doctype html><title>Test</title>");
    await Deno.writeFile(join(folder, "big.bin"), Uint8Array.from({ length: 300000 }, (_, i) => (i * 7) % 251));
  }
  const port = nextPort++;
  /** @type {string[]} */
  const said = [];
  const data = game.data ?? join(temp, "data");
  /** @type {Awaited<ReturnType<typeof runGame>>} */
  let host;
  try {
    host = await runGame({ folder, port, relay, data, log: (text) => said.push(text) });
  } catch (error) {
    // A relay that refuses the game, or none at all: nothing is left behind.
    await Deno.remove(temp, { recursive: true });
    throw error;
  }
  return {
    host,
    said,
    port,
    data,
    base: host.base,
    async stop() {
      await host.stop();
      // A folder given for the game's data is the caller's to remove.
      await Deno.remove(temp, { recursive: true });
    },
  };
}

/** A display's line to the game server. @param {string} base the game's address @param {string} [guest] @param {Record<string, string>} [headers] */
async function display(base, guest = "0123456789abcdef0123456789abcdef", headers = {}) {
  // Deno's WebSocket takes headers, which a browser's does not; a browser sends its own cookies.
  const socket = new WebSocket(base.replace(/^http/, "ws") + "endlessmind/play?guest=" + guest, /** @type {any} */ ({ headers }));
  /** @type {any[]} */
  const heard = [];
  /** @type {(() => void)[]} */
  const waiting = [];
  socket.onmessage = (event) => {
    heard.push(JSON.parse(event.data));
    waiting.splice(0).forEach((wake) => wake());
  };
  const closed = new Promise((done) => (socket.onclose = () => done(null)));
  closed.then(() => waiting.splice(0).forEach((wake) => wake()));
  await new Promise((done, failed) => {
    socket.onopen = () => done(null);
    socket.onerror = () => failed(new Error("could not connect"));
  });
  return {
    closed,
    /** @param {unknown} data */
    send: (data) => socket.send(JSON.stringify(data)),
    /** The next message, or null if the line closed first. */
    async next() {
      while (!heard.length && socket.readyState === WebSocket.OPEN) await new Promise((wake) => waiting.push(() => wake(null)));
      return heard.shift() ?? null;
    },
    async close() {
      socket.close();
      await closed;
    },
  };
}

/** @param {() => boolean | Promise<boolean>} done */
async function until(done, ms = 15000) {
  for (const end = Date.now() + ms; !(await done());) {
    assert(Date.now() < end, "waited too long");
    await new Promise((wake) => setTimeout(wake, 50));
  }
}

/** @param {string} address */
const status = (address) => fetch(address).then((answer) => (answer.body?.cancel(), answer.status));

Deno.test("Endless Maze on one computer is played at an address of its own on a relay", async () => {
  const { relay, base } = await relaying();
  const game = await relayed(base, { folder: "examples/maze" });
  try {
    assert.equal(game.base, relayedBase(base, game.host.realm.id));
    assert.deepEqual(relay.games(), [game.host.realm.id]);
    assert.match(await (await fetch(game.base)).text(), /Endless Maze/);
    assert.equal(await (await fetch(game.base + "maze.js")).text(), await Deno.readTextFile("examples/maze/maze.js"));
    assert.equal(await status(game.base + ".data/realm-secret.txt"), 404);
    assert.equal(await status(game.base + "endlessmind/play.js"), 200);

    // The realm names the relayed address as its own, so sign-in notes made for it are accepted.
    const card = await (await fetch(game.base + "endlessmind-card.json")).json();
    assert.deepEqual(card.play, [game.base]);
    const start = await (await fetch(game.base + "endlessmind/start", { method: "POST" })).json();
    assert(JSON.stringify(start).includes(game.base + "join/"), "the join address is on the relay");

    let line = await display(game.base);
    assert.deepEqual(await line.next(), { type: "state", player: null, reached: 1, best: {} });
    line.send({ type: "start", n: 1, level: 1 });
    const { run } = await line.next();
    const moves = solution(makeMaze(1));
    await new Promise((wake) => setTimeout(wake, moves.length * 10 + 20));
    line.send({ type: "finish", run, moves });
    assert.equal((await line.next()).reached, 2);
    await line.close();

    // The maker, on the game's own computer, is the same guest with the same progress.
    line = await display(`http://localhost:${game.port}/`);
    assert.equal((await line.next()).reached, 2);
    await line.close();
  } finally {
    await game.stop();
    await relay.stop();
  }
  assert.equal(game.said.join("\n"), "");
});

Deno.test("a relay passes big files, posted bodies and refusals unchanged", async () => {
  const { relay, base } = await relaying();
  const game = await relayed(base);
  try {
    const big = new Uint8Array(await (await fetch(game.base + "big.bin")).arrayBuffer());
    assert.equal(big.length, 300000);
    assert(big.every((byte, i) => byte === (i * 7) % 251));

    const posted = await fetch(game.base + "join/NOSUCHCODE", { method: "POST", body: JSON.stringify({ any: "thing" }) });
    const direct = await fetch(`http://localhost:${game.port}/join/NOSUCHCODE`, { method: "POST", body: JSON.stringify({ any: "thing" }) });
    assert.equal(posted.status, direct.status);
    assert.equal(await posted.text(), await direct.text());
    assert.equal(await status(game.base + "missing.html"), 404);

    // A line the game refuses is closed, and one it accepts carries messages both ways.
    const refused = new WebSocket(game.base.replace(/^http/, "ws") + "endlessmind/play?guest=short");
    refused.onerror = () => {};
    await new Promise((done) => (refused.onclose = done));
    let line = await display(game.base);
    line.send({ hello: "there" });
    assert.deepEqual(await line.next(), { hello: "there" });
    await line.close();

    // A display asking whether its line still works hears from the host itself, through the relay
    // and straight; the game server never sees the question.
    for (const where of [game.base, `http://localhost:${game.port}/`]) {
      const asking = new WebSocket(where.replace(/^http/, "ws") + "endlessmind/play?guest=0123456789abcdef0123456789abcdef");
      await new Promise((done) => (asking.onopen = done));
      asking.send("ping");
      assert.equal(await new Promise((done) => (asking.onmessage = (event) => done(event.data))), "pong");
      asking.close();
      await new Promise((done) => (asking.onclose = done));
    }

    // The browser's session travels both ways, so the game knows a signed-in player through a relay.
    const out = await fetch(game.base + "endlessmind/signout", { method: "POST" });
    await out.body?.cancel();
    assert.match(out.headers.get("set-cookie") ?? "", /Max-Age=0/);
    const [cookie] = (out.headers.get("set-cookie") ?? "").split("=");
    const player = (await signerFromWords(await newWords())).id;
    game.host.realm.data.sessions["a".repeat(48)] = { player, created: Date.now() };
    line = await display(game.base, "0123456789abcdef0123456789abcdef", { cookie: `${cookie}=${"a".repeat(48)}` });
    line.send("who");
    assert.equal(await line.next(), "player:" + player);
    await line.close();
  } finally {
    await game.stop();
    await relay.stop();
  }
});

Deno.test("a relay gives a realm's address only to whoever proves they are that realm", async () => {
  const { relay, base, port } = await relaying();
  const realm = await signerFromWords(await newWords());
  const thief = await signerFromWords(await newWords());
  /** Dial the relay and answer its hello with whatever `note` makes. @param {(nonce: string) => Promise<any>} note */
  async function dialing(note) {
    const socket = new WebSocket(`ws://localhost:${port}/endlessmind/relay`);
    /** @type {any[]} */
    const heard = [];
    socket.onmessage = async (event) => {
      const m = JSON.parse(event.data);
      heard.push(m);
      if (m.t === "hello") socket.send(JSON.stringify({ t: "note", note: await note(m.nonce) }));
    };
    return { socket, heard, closed: new Promise((done) => (socket.onclose = done)) };
  }
  /** @param {string} nonce */
  const honest = (nonce) => ({ v: 1, type: "relay", signers: [realm.id], time: Date.now(), relay: base, nonce });
  try {
    const attempts = [
      async (/** @type {string} */ nonce) => addSignature(honest(nonce), thief),
      async (/** @type {string} */ nonce) => addSignature({ ...honest(nonce), nonce: "0".repeat(32) }, realm),
      async (/** @type {string} */ nonce) => addSignature({ ...honest(nonce), relay: "http://another.example/" }, realm),
      async (/** @type {string} */ nonce) => ({ ...(await addSignature(honest(nonce), realm)), time: 1 }),
    ];
    for (const attempt of attempts) {
      const tried = await dialing(attempt);
      await tried.closed;
      assert.deepEqual(tried.heard.map((m) => m.t), ["hello"]);
      assert.deepEqual(relay.games(), []);
    }
    assert.equal(await status(relayedBase(base, realm.id)), 503);

    const real = await dialing(async (nonce) => addSignature(honest(nonce), realm));
    await until(() => real.heard.length === 2);
    assert.deepEqual(real.heard[1], { t: "ready", base: relayedBase(base, realm.id) });
    assert.deepEqual(relay.games(), [realm.id]);
    real.socket.close();
    await real.closed;
    await until(() => relay.games().length === 0);
  } finally {
    await relay.stop();
  }
});

Deno.test("a relay's admin chooses who is relayed, and can refuse an ID for good, at once", async () => {
  const temp = await Deno.makeTempDir();
  const port = nextPort++;
  const store = join(temp, "store");
  const words = await newWords();
  const chosen = (await signerFromWords(words)).id;
  await Deno.mkdir(join(temp, "chosen"));
  await Deno.writeTextFile(join(temp, "chosen", "realm-secret.txt"), words + "\n");
  /** @type {string[]} */
  const said = [];
  const host = await runHost({ base: `http://localhost:${port}/`, port, relay: [chosen], entryPortal: false, store, hosts: [], log: (text) => said.push(text) });
  const base = host.base;
  /** @type {Awaited<ReturnType<typeof relayed>>[]} */
  const games = [];
  try {
    // Only the IDs the admin named are relayed, and the host's card does not invite anyone else.
    assert.equal((await host.hosts.card())?.relay, undefined);
    await assert.rejects(() => relayed(base), /does not relay this game/);
    const game = await relayed(base, { data: join(temp, "chosen") });
    games.push(game);
    assert.deepEqual(host.games(), [chosen]);
    assert.equal(await status(game.base), 200);

    // Refused for good: dropped at once, and told so.
    await host.refuse(chosen);
    assert.deepEqual(host.games(), []);
    assert.equal(await status(game.base), 503);
    await until(() => game.said.some((line) => /does not relay this game/.test(line)));
    assert.match(await Deno.readTextFile(join(store, "refused.txt")), new RegExp(chosen));
  } finally {
    for (const game of games) await game.stop();
    await host.stop();
    await Deno.remove(temp, { recursive: true });
  }

  // A host that relays anyone drops a game its admin refuses from another program (`endlessmind refuse`).
  const open = await relaying();
  const game = await relayed(open.base);
  try {
    assert.deepEqual(open.relay.games(), [game.host.realm.id]);
    await refuse(open.store, game.host.realm.id);
    await until(() => open.relay.games().length === 0);
    assert.equal(await status(game.base), 503);
    await assert.rejects(() => relayed(open.base, { data: game.data }), /does not relay this game/);
  } finally {
    await game.stop();
    await open.relay.stop();
  }
});

Deno.test("a relayed game is gone while its computer is off, and back at the same address afterwards", async () => {
  const { relay, base } = await relaying(1);
  const data = await Deno.makeTempDir();
  let game = await relayed(base, { data });
  const address = game.base;
  try {
    const line = await display(address);
    await game.stop();
    await line.closed;
    await until(async () => (await status(address)) === 503);

    // The relay has room for one game, so another realm waits its turn.
    const first = await relayed(base);
    game = await relayed(base, { data });
    assert.match(game.said.join("\n"), /no room/);
    assert.equal(await status(address), 503);
    await first.stop();
    await until(async () => (await status(address)) === 200);
    assert.equal(game.base, address);
    const again = await display(address);
    again.send(1);
    assert.equal(await again.next(), 1);
    await again.close();
  } finally {
    await game.stop();
    await relay.stop();
    await Deno.remove(data, { recursive: true });
  }
});
