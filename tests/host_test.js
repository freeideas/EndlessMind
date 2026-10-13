// The host program: a game server plays through the seal, and the seal holds.

import assert from "node:assert/strict";
import { join } from "node:path";
import { runGame } from "../host/host.js";
import { signerFromWords, wordsFromEntropy } from "../shared/keys.js";
import { addNote, addSignature } from "../shared/signed.js";
import { makeMaze, solution } from "../examples/maze/maze.js";

let nextPort = 18300 + Math.floor(Math.random() * 500);

/**
 * Run a game from `folder`, or one made here from the text of its game server.
 * @param {{ folder?: string, server?: string, wasm?: Uint8Array, files?: Record<string, string>, memory?: number, idle?: number, share?: { part: number, over: number, every: number } }} game
 */
async function running(game) {
  const temp = await Deno.makeTempDir();
  let folder = game.folder;
  if (!folder) {
    folder = join(temp, "game");
    await Deno.mkdir(folder);
    await Deno.writeTextFile(join(folder, "card.json"), JSON.stringify({ name: "Test", description: "A test game." }));
    if (game.wasm) await Deno.writeFile(join(folder, "game.wasm"), game.wasm);
    if (game.server || !game.wasm) await Deno.writeTextFile(join(folder, "game.js"), game.server ?? "export default {};");
    await Deno.writeTextFile(join(folder, "index.html"), "<!doctype html><title>Test</title>");
  }
  for (const [name, text] of Object.entries(game.files ?? {})) await Deno.writeTextFile(join(temp, name), text);
  const port = nextPort++;
  /** @type {string[]} */
  const said = [];
  const host = await runGame({ folder, port, data: join(temp, "data"), memory: game.memory, idle: game.idle, share: game.share, log: (text) => said.push(text) });
  return {
    host,
    said,
    port,
    folder,
    data: join(temp, "data"),
    async stop() {
      await host.stop();
      await Deno.remove(temp, { recursive: true });
    },
  };
}

/** A display's line to the game server. @param {number} port @param {string} [guest] @param {string} [cookie] a signed-in player's session */
async function display(port, guest = "0123456789abcdef0123456789abcdef", cookie = "") {
  // Deno's WebSocket takes headers, which the browser types this project checks against do not know.
  const socket = new WebSocket(`ws://localhost:${port}/endlessmind/play?guest=${guest}`, cookie ? /** @type {any} */ ({ headers: { cookie } }) : undefined);
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

Deno.test("Endless Maze plays through the seal, and keeps a guest's progress", async () => {
  const game = await running({ folder: "examples/maze" });
  try {
    const page = await fetch(`http://localhost:${game.port}/`);
    assert.match(await page.text(), /Endless Maze/);
    assert.equal((await fetch(`http://localhost:${game.port}/.data/realm-secret.txt`).then((r) => (r.body?.cancel(), r))).status, 404);
    assert.equal((await fetch(`http://localhost:${game.port}/endlessmind/play.js`).then((r) => (r.body?.cancel(), r))).status, 200);

    let line = await display(game.port);
    assert.deepEqual(await line.next(), { type: "state", player: null, reached: 1, best: {} });
    line.send({ type: "start", n: 1, level: 2 });
    assert.equal((await line.next()).error, "That level is not open yet.");
    line.send({ type: "start", n: 2, level: 1 });
    const { run } = await line.next();
    const moves = solution(makeMaze(1));
    line.send({ type: "finish", run, moves: moves.slice(1) });
    assert.equal((await line.next()).error, "Those moves do not reach the exit.");
    await new Promise((wake) => setTimeout(wake, moves.length * 10 + 20));
    line.send({ type: "finish", run, moves });
    const done = await line.next();
    assert.equal(done.type, "done");
    assert.equal(done.reached, 2);
    await line.close();

    line = await display(game.port);
    assert.equal((await line.next()).reached, 2, "the same guest comes back to their progress");
    await line.close();
    line = await display(game.port, "f".repeat(32));
    assert.equal((await line.next()).reached, 1, "another guest starts at the beginning");
    await line.close();
  } finally {
    await game.stop();
  }
  assert.equal(game.said.join("\n"), "");
});

Deno.test("a sealed game server cannot reach files, the network, other programs or its surroundings", async () => {
  const game = await running({
    server: `
      const tries = {
        network: () => fetch("http://localhost:1/"),
        read: () => Deno.readTextFile("card.json"),
        write: () => Deno.writeTextFile("made-by-the-game.txt", "x"),
        program: () => new Deno.Command("ls").output(),
        listen: () => Deno.listen({ port: 0 }),
        surroundings: () => Deno.env.get("HOME"),
        nodeFiles: async () => (await import("node:" + "fs")).readFileSync("card.json", "utf8"),
        laterImport: () => import("./card" + ".json", { with: { type: "json" } }),
      };
      export default {
        async join(game, player) {
          const refused = {};
          for (const [name, attempt] of Object.entries(tries)) {
            try { await attempt(); refused[name] = false; } catch { refused[name] = true; }
          }
          game.send(player, refused);
        },
      };`,
  });
  try {
    const line = await display(game.port);
    const refused = await line.next();
    assert.deepEqual(refused, { network: true, read: true, write: true, program: true, listen: true, surroundings: true, nodeFiles: true, laterImport: true });
    await line.close();
  } finally {
    await game.stop();
  }
});

Deno.test("a game server that loads a file from outside its folder is not started", async () => {
  for (const loads of [`import secret from "../outside.json" with { type: "json" };`, `import "https://example.com/code.js";`, `import "node:fs";`]) {
    const game = await running({ server: `${loads}\nexport default {};`, files: { "outside.json": "{}" } });
    try {
      assert.equal(game.host.awake, false, loads);
      assert.match(game.said.join("\n"), /did not start/);
    } finally {
      await game.stop();
    }
  }
});

Deno.test("a game server that stops answering, or takes too much memory, is stopped", async () => {
  const stuck = await running({ server: `export default { message() { for (;;); } };` });
  const greedy = await running({ memory: 32, server: `export default { message() { const all = []; for (;;) all.push(new Array(1e6).fill(1)); } };` });
  try {
    for (const game of [stuck, greedy]) {
      const line = await display(game.port);
      line.send("go");
      await line.closed;
      await until(() => !game.host.awake);
    }
    assert.match(stuck.said.join("\n"), /stopped answering/);
    assert.match(greedy.said.join("\n"), /The game server stopped/);

    // The next player wakes it again.
    const line = await display(stuck.port);
    await until(() => stuck.host.awake);
    await line.close();
  } finally {
    await stuck.stop();
    await greedy.stop();
  }
});

Deno.test("a game server keeps what it saves, has one timer, and offers records only to players", async () => {
  const server = `
    export default {
      start(game) { game.save("starts", (game.load("starts") ?? 0) + 1); },
      join(game, player) {
        game.offer(player, [{ text: "A guest cannot be offered this." }]);
        game.timer(5000);
        game.timer(10);
      },
      timer(game) { for (const player of game.players()) game.send(player, { starts: game.load("starts"), who: player.who, name: player.name }); },
    };`;
  const game = await running({ server });
  try {
    const line = await display(game.port);
    assert.deepEqual(await line.next(), { starts: 1, who: "guest:0123456789abcdef0123456789abcdef", name: "Guest" });
    await line.close();
    await game.host.stop();
    assert.deepEqual(JSON.parse(await Deno.readTextFile(join(game.data, "game-data.json"))), { starts: 1 });
    assert.deepEqual(game.host.realm.data.offers, {});
  } finally {
    await game.stop();
  }
});

Deno.test("a game server is told a player's records, each with the words the player added", async () => {
  const game = await running({ server: "export default { join(game, player) { game.send(player, player.records); } };" });
  try {
    const realm = game.host.realm;
    const player = await signerFromWords(await wordsFromEntropy(new Uint8Array(32).fill(7)));
    const plain = await addSignature({ v: 1, type: "record", signers: [realm.id, player.id], time: 1, text: "Opened the gate." }, player);
    const noted = await addNote(await addSignature({ ...plain, time: 2, text: "Crossed the bridge.", sigs: {} }, player), player, "Hard won.");
    realm.data.records.push(plain, noted);
    realm.data.sessions.s1 = { player: player.id, created: Date.now() };
    const line = await display(game.port, undefined, "endlessmind=s1");
    assert.deepEqual(await line.next(), [{ text: "Opened the gate.", time: 1 }, { text: "Crossed the bridge.", time: 2, note: "Hard won." }]);
    await line.close();
  } finally {
    await game.stop();
  }
});

Deno.test("a game server with nobody playing rests, and its timer still rings", async () => {
  const server = `
    export default {
      start(game) { game.save("starts", (game.load("starts") ?? 0) + 1); },
      leave(game) { game.timer(2500); },
      timer(game) { game.save("rang", game.load("starts")); },
    };`;
  const game = await running({ server, idle: 300 });
  try {
    const line = await display(game.port);
    await line.close();
    await until(() => !game.host.awake);
    assert.equal(game.said.join("\n"), "", "resting is not a fault, so nothing is said");

    // The host kept the timer: it starts the game server again when the time comes.
    const saved = () => Deno.readTextFile(join(game.data, "game-data.json")).then(JSON.parse, () => ({}));
    await until(async () => (await saved()).rang === 2);
    await until(() => !game.host.awake);

    // And the next player wakes it.
    const again = await display(game.port);
    await until(() => game.host.awake);
    await again.close();
    await until(async () => (await saved()).starts === 3);
  } finally {
    await game.stop();
  }
});

Deno.test("a game server that keeps answering but uses too much of the processor is stopped", async () => {
  // Busy four fifths of the time, in bursts short enough that it never seems to have stopped answering.
  const server = `
    export default {
      join(game) { game.timer(0); },
      timer(game) { for (const end = Date.now() + 80; Date.now() < end;); game.timer(20); },
    };`;
  const greedy = await running({ server, share: { part: 0.5, over: 1500, every: 500 } });
  const modest = await running({ server: server.replace("+ 80", "+ 5"), share: { part: 0.5, over: 1500, every: 500 } });
  try {
    const lines = [await display(greedy.port), await display(modest.port)];
    await until(() => !greedy.host.awake);
    assert.match(greedy.said.join("\n"), /more than its share of the processor/);
    assert.equal(modest.host.awake, true);
    assert.equal(modest.said.join("\n"), "");
    for (const line of lines) await line.close();
  } finally {
    await greedy.stop();
    await modest.stop();
  }
});

/** @param {number} n a number as WebAssembly writes it */
const leb = (n) => {
  /** @type {number[]} */
  const bytes = [];
  do {
    bytes.push((n & 127) | (n > 127 ? 128 : 0));
    n = Math.floor(n / 128);
  } while (n > 0);
  return bytes;
};
/** @param {string} text */
const label = (text) => [...leb(text.length), ...new TextEncoder().encode(text)];
/** @param {number} id @param {number[][]} items */
const section = (id, items) => {
  const body = [...leb(items.length), ...items.flat()];
  return [id, ...leb(body.length), ...body];
};

/**
 * A small WebAssembly module made by hand: it does nothing, but has everything a game server module needs.
 * @param {{ imports?: [string, string][], memory?: number[], exports?: string[] }} [shape]
 */
function module(shape = {}) {
  const imports = shape.imports ?? [["host", "ask"]];
  const exports = shape.exports ?? ["memory", "alloc", "call"];
  /** @type {Record<string, number[]>} */
  const kinds = { memory: [2, 0], alloc: [0, imports.length], call: [0, imports.length + 1] };
  return new Uint8Array([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, [[0x60, 1, 0x7f, 1, 0x7f], [0x60, 2, 0x7f, 0x7f, 0]]),
    ...section(2, imports.map(([from, name]) => [...label(from), ...label(name), 0, 1])),
    ...section(3, [[0], [1]]),
    ...section(5, [shape.memory ?? [1, 1, 16]]),
    ...section(7, exports.map((name) => [...label(name), ...kinds[name]])),
    // alloc returns 1024; call does nothing.
    ...section(10, [[5, 0, 0x41, 0x80, 0x08, 0x0b], [2, 0, 0x0b]]),
  ]);
}

Deno.test("a game server compiled to WebAssembly plays through the same seal, and keeps what it saves", async () => {
  const wasm = await Deno.readFile("examples/counter/game.wasm");
  const game = await running({ wasm, idle: 300 });
  try {
    assert.equal(game.host.awake, true);
    const saved = () => Deno.readTextFile(join(game.data, "game-data.json")).then(JSON.parse, () => ({}));
    const first = await display(game.port);
    const second = await display(game.port, "f".repeat(32));
    assert.deepEqual(await first.next(), { count: 0 });
    assert.deepEqual(await second.next(), { count: 0 });
    first.send("press");
    first.send("something else");
    second.send("press");
    // The module's timer rings, and it tells everyone connected.
    assert.deepEqual(await first.next(), { count: 2 });
    assert.deepEqual(await second.next(), { count: 2 });
    await until(async () => (await saved()).count === 2);
    await first.close();
    second.send("press");
    assert.deepEqual(await second.next(), { count: 3 });
    await second.close();

    // With nobody playing it rests, and starts again from what it saved.
    await until(() => !game.host.awake);
    const again = await display(game.port);
    assert.deepEqual(await again.next(), { count: 3 });
    await again.close();
  } finally {
    await game.stop();
  }
  assert.equal(game.said.join("\n"), "");
});

Deno.test("a WebAssembly module that asks for more than the seal gives is refused", async () => {
  /** @type {[string, Parameters<typeof module>[0], RegExp][]} */
  const refusals = [
    ["imports something else", { imports: [["env", "abort"]] }, /imports env.abort/],
    ["imports more than host.ask", { imports: [["host", "ask"], ["host", "more"]] }, /imports host.more/],
    ["lacks an export", { exports: ["memory", "call"] }, /must export alloc/],
    ["does not say its largest memory", { memory: [0, 1] }, /must declare the most memory/],
    ["may grow past the memory limit", { memory: [1, 1, 255, 255, 3] }, /more than the 1024 allowed/],
    ["has memory that several threads share", { memory: [3, 1, 16] }, /shared or 64-bit/],
  ];
  for (const [why, shape, said] of refusals) {
    const game = await running({ wasm: module(shape) });
    try {
      assert.equal(game.host.awake, false, why);
      assert.match(game.said.join("\n"), said, why);
      assert.match(game.said.join("\n"), /did not start/, why);
    } finally {
      await game.stop();
    }
  }
  const garbage = await running({ wasm: new Uint8Array([1, 2, 3]) });
  try {
    assert.match(garbage.said.join("\n"), /not a WebAssembly module/);
  } finally {
    await garbage.stop();
  }
});

Deno.test("the memory limit holds for a WebAssembly module, and a game holds one kind of server", async () => {
  // 16 pages of 64 KB are 1 MB: a module that may use 17 is too much for a host that allows 1 MB.
  const tight = await running({ wasm: module({ memory: [1, 1, 17] }), memory: 1 });
  const fits = await running({ wasm: module({ memory: [1, 1, 16] }), memory: 1 });
  const both = await running({ wasm: module(), server: "export default {};" });
  try {
    assert.equal(tight.host.awake, false);
    assert.match(tight.said.join("\n"), /17 pages of memory.*more than the 16 allowed/);
    assert.equal(fits.host.awake, true);
    assert.equal(fits.said.join("\n"), "");
    assert.equal(both.host.awake, false);
    assert.match(both.said.join("\n"), /game\.js or game\.wasm, one of them/);
  } finally {
    await tight.stop();
    await fits.stop();
    await both.stop();
  }
});
