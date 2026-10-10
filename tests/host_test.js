// The host program: a game server plays through the seal, and the seal holds.

import assert from "node:assert/strict";
import { join } from "node:path";
import { runGame } from "../host/host.js";
import { makeMaze, solution } from "../examples/maze/maze.js";

let nextPort = 18300 + Math.floor(Math.random() * 500);

/**
 * Run a game from `folder`, or one made here from the text of its game server.
 * @param {{ folder?: string, server?: string, files?: Record<string, string>, memory?: number }} game
 */
async function running(game) {
  const temp = await Deno.makeTempDir();
  let folder = game.folder;
  if (!folder) {
    folder = join(temp, "game");
    await Deno.mkdir(folder);
    await Deno.writeTextFile(join(folder, "card.json"), JSON.stringify({ name: "Test", description: "A test game." }));
    await Deno.writeTextFile(join(folder, "game.js"), game.server ?? "export default {};");
    await Deno.writeTextFile(join(folder, "index.html"), "<!doctype html><title>Test</title>");
  }
  for (const [name, text] of Object.entries(game.files ?? {})) await Deno.writeTextFile(join(temp, name), text);
  const port = nextPort++;
  /** @type {string[]} */
  const said = [];
  const host = await runGame({ folder, port, data: join(temp, "data"), memory: game.memory, log: (text) => said.push(text) });
  return {
    host,
    said,
    port,
    data: join(temp, "data"),
    async stop() {
      await host.stop();
      await Deno.remove(temp, { recursive: true });
    },
  };
}

/** A display's line to the game server. @param {number} port */
async function display(port, guest = "0123456789abcdef0123456789abcdef") {
  const socket = new WebSocket(`ws://localhost:${port}/endlessmind/play?guest=${guest}`);
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

/** @param {() => boolean} done */
async function until(done, ms = 15000) {
  for (const end = Date.now() + ms; !done();) {
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
