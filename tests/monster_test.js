// Monster Maze: its rules run with a made-up clock, its game server is driven by hand, and the whole
// game plays through the host program with real displays.

import assert from "node:assert/strict";
import { join } from "node:path";
import { runGame } from "../host/host.js";
import game from "../examples/monster/game.js";
import { blocked, createWorld, ENTRY_GRACE_MS, makeGrid, MAX_SPEED, monsterSpeed } from "../examples/monster/world.js";

/** A room with no walls inside, 9 by 9 tiles (4 by 4 cells), the exit in the far corner. @returns {import("../examples/monster/world.js").Grid} */
function room(level = 1) {
  const size = 9;
  const tiles = new Uint8Array(size * size);
  for (let i = 0; i < size; i++) tiles[i] = tiles[(size - 1) * size + i] = tiles[i * size] = tiles[i * size + size - 1] = 1;
  return { level, cells: 4, size, tiles, open: new Uint8Array(16).fill(15), start: { x: 1.5, y: 1.5, a: 0 }, exit: { x: 7.5, y: 7.5 }, monster: { x: 7.5, y: 1.5 } };
}

Deno.test("a maze has a way from the start to the exit, and a wall around it", () => {
  for (const level of [1, 2, 7, 30]) {
    const grid = makeGrid(level);
    assert.equal(grid.size, 2 * grid.cells + 1);
    assert.equal(blocked(grid, 0.5, 0.5, 0.1), true);
    assert.equal(blocked(grid, grid.start.x, grid.start.y, 0.22), false);
    assert.equal(blocked(grid, grid.exit.x, grid.exit.y, 0.22), false);
    assert.equal(blocked(grid, grid.monster.x, grid.monster.y, 0.3), false);
    assert.equal(route(grid, grid.start, grid.exit) !== null, true);
  }
});

Deno.test("a move through a wall, or faster than anyone walks, is put back", () => {
  const world = createWorld({ gridOf: makeGrid });
  const rider = world.enter(1, "guest:a", 1, 0);
  assert.deepEqual([rider.x, rider.y], [1.5, 1.5]);
  /** Where a refused move puts the player back. @param {{ x: number, y: number } | undefined} back */
  const put = (back) => back && [back.x, back.y];
  const stay = [1.5, 1.5];
  assert.deepEqual(put(world.move(1, 1.5, 1.0, 0, 100)), stay, "into the wall above");
  assert.deepEqual(put(world.move(1, 1.5, 6.5, 0, 5000)), stay, "five tiles in a second");
  assert.deepEqual(put(world.move(1, NaN, 1.5, 0, 5200)), stay);
  assert.deepEqual(put(world.move(1, 1.5, 1.5, "up", 5300)), stay, "an angle that is not a number");
  // A display that has not yet heard it was put back is still sending from where it was: not answered.
  const back = world.move(1, 1.5, 1.0, 0, 5350, rider.place);
  assert.equal(world.move(1, 1.5, 1.6, 0, 5360, (back?.p ?? 0) - 1), undefined);
  assert.deepEqual([rider.x, rider.y], stay);
  // Positions arrive rounded, so one that rounds onto the very edge of a wall is believed.
  assert.equal(world.move(1, 1.78, 1.5, 0, 5380, back?.p), undefined);
  assert.equal(world.move(1, 1.5, 1.5, 0, 5390), undefined);
  assert.equal(world.move(1, 1.5, 1.5, 1, 5400), undefined, "staying put is fine");
  assert.equal(rider.a, 1);
  assert.equal(world.move(1, 1.7, 1.6, 1, 5500), undefined, "a short lawful step is believed");
  assert.deepEqual([rider.x, rider.y], [1.7, 1.6]);
  assert(MAX_SPEED * 0.1 + 0.3 > 3 * 0.1, "walking speed is well inside what is believed");
});

Deno.test("the monster goes straight for the nearest player, and eating starts a player again elsewhere", () => {
  const world = createWorld({ gridOf: room, random: () => 0 });
  world.enter(1, "guest:a", 1, 0);
  world.enter(2, "guest:b", 1, 0);
  const lv = world.level(1);
  assert(lv);
  const before = Math.hypot(lv.monster.x - 1.5, lv.monster.y - 1.5);
  let now = 0;
  for (let i = 0; i < 10; i++) world.tick((now += 80));
  const after = Math.hypot(lv.monster.x - 1.5, lv.monster.y - 1.5);
  assert(before - after > 10 * 0.08 * monsterSpeed(1) * 0.9, "it came closer by about its speed");
  assert.equal(lv.monster.y, 1.5, "straight along the room's top");
  // A player who has just arrived is safe for a while; then the monster eats everyone it reaches.
  /** @type {any[]} */
  let eaten = [];
  while (!eaten.length) {
    assert(now < 30000);
    eaten = world.tick((now += 80)).send.filter(([, m]) => m.type === "eaten");
  }
  assert(now >= ENTRY_GRACE_MS, "not before the grace ran out");
  assert.equal(eaten.length, 2, "both were reached");
  const again = world.rider(1);
  assert(again && again.eaten === 1);
  assert(Math.hypot(again.x - lv.monster.x, again.y - lv.monster.y) >= 3.6, "started again far from the monster");
  assert.equal(again.since, 0, "the clock keeps running");
  // The monster is not smart: it cannot get around a wall.
  const walled = room();
  for (let y = 1; y < 8; y++) walled.tiles[y * 9 + 4] = 1;
  const stuck = createWorld({ gridOf: () => walled });
  stuck.enter(1, "guest:a", 1, 0);
  for (let t = 80; t < 20000; t += 80) stuck.tick(t);
  const m = stuck.level(1)?.monster;
  assert(m && m.x > 4.9, "it is still on its side of the wall");
});

Deno.test("reaching the exit finishes the level, and a player who left comes back where they were", () => {
  const world = createWorld({ gridOf: room });
  const rider = world.enter(1, "guest:a", 1, 1000);
  rider.x = 7.4;
  rider.y = 7.4;
  const out = world.tick(4000);
  assert.deepEqual(out.done, [{ conn: 1, level: 1, ms: 3000 }]);
  assert.equal(world.playing(), 0);
  assert.equal(world.level(1), undefined, "an empty level is forgotten");

  world.enter(2, "guest:b", 1, 10000);
  world.move(2, 1.5, 1.5, 2, 10100);
  world.leave(2, 12000);
  const back = world.enter(3, "guest:b", 1, 20000);
  assert.deepEqual([back.since, back.a], [10000, 2], "same clock and heading");
  const stranger = world.enter(4, "guest:c", 1, 20000);
  assert.equal(stranger.since, 20000);
  world.leave(3, 20000);
  assert.equal(world.enter(5, "guest:b", 1, 20000 + 31000).since, 51000, "forgotten after a while");
});

/** A fake host for the game server: what it sent, saved, offered and asked of the timer. */
function fakeHost() {
  /** @type {[number, any][]} */
  const sent = [];
  /** @type {Map<string, any>} */
  const saved = new Map();
  /** @type {(number | null)[]} */
  const timers = [];
  /** @type {Map<number, any>} */
  const here = new Map();
  /** @type {any} */
  const host = {
    send: (/** @type {any} */ player, /** @type {any} */ data) => sent.push([player.conn, JSON.parse(JSON.stringify(data))]),
    load: (/** @type {string} */ key) => (saved.has(key) ? structuredClone(saved.get(key)) : undefined),
    save: (/** @type {string} */ key, /** @type {any} */ value) => (value === undefined ? saved.delete(key) : saved.set(key, structuredClone(value))),
    timer: (/** @type {number | null} */ ms) => timers.push(ms),
    offer: () => {},
    players: () => [...here.values()],
  };
  /** @param {number} conn */
  const player = (conn) => {
    const guest = `guest:${String(conn).padStart(32, "0")}`;
    const p = { conn, who: guest, id: null, name: "Guest", guest, records: [] };
    here.set(conn, p);
    return p;
  };
  return { host, sent, saved, timers, player, here };
}

Deno.test("the game server sets its timer only while someone is in a level", async () => {
  const fake = fakeHost();
  await game.start?.(fake.host);
  const one = fake.player(1), two = fake.player(2);
  await game.join?.(fake.host, one);
  await game.join?.(fake.host, two);
  assert.deepEqual(fake.timers.filter((t) => t !== null), [], "nobody is in a level: no timer");
  await game.message?.(fake.host, one, { type: "enter", level: 2 });
  assert.equal(fake.sent.at(-1)?.[1].error, "That level is not open yet.");
  assert.deepEqual(fake.timers.filter((t) => t !== null), []);
  await game.message?.(fake.host, one, { type: "enter", level: 1 });
  assert.equal(fake.sent.at(-1)?.[1].type, "level");
  assert.deepEqual(fake.timers.at(-1), 80);
  await game.message?.(fake.host, two, { type: "enter", level: 1 });
  await game.timer?.(fake.host);
  assert.equal(fake.timers.at(-1), 80, "set again after each tick while someone plays");
  const tickFor = (/** @type {number} */ conn) => fake.sent.filter(([c, m]) => c === conn && m.type === "t").at(-1)?.[1];
  assert.equal(tickFor(1).o.length, 1, "each sees the other");
  assert(JSON.stringify(tickFor(1)).length < 200);
  await game.leave?.(fake.host, one);
  assert.equal(fake.timers.at(-1), 80, "one still plays");
  await game.leave?.(fake.host, two);
  assert.equal(fake.timers.at(-1), null, "nobody plays: no timer");
  const count = fake.timers.length;
  await game.timer?.(fake.host);
  assert.equal(fake.timers.length, count, "a late tick sets nothing");
  await game.message?.(fake.host, one, { type: "ping", t: 7 });
  assert.deepEqual(fake.sent.at(-1), [1, { type: "pong", t: 7 }]);
});

// ---- the whole game, through the host program ----

let nextPort = 18800 + Math.floor(Math.random() * 500);

/** @param {string} [data] */
async function running(data) {
  const temp = data ?? await Deno.makeTempDir();
  const port = nextPort++;
  /** @type {string[]} */
  const said = [];
  const host = await runGame({ folder: "examples/monster", port, data: join(temp, "data"), log: (text) => said.push(text) });
  return { host, said, port, temp, async stop() { await host.stop(); await Deno.remove(temp, { recursive: true }); } };
}

/** A display's line to the game server, keeping everything it hears in `log`. @param {number} port @param {string} [guest] */
async function display(port, guest = "0123456789abcdef0123456789abcdef") {
  const socket = new WebSocket(`ws://localhost:${port}/endlessmind/play?guest=${guest}`);
  /** @type {any[]} */
  const log = [];
  socket.onmessage = (event) => log.push(JSON.parse(event.data));
  await new Promise((done, failed) => {
    socket.onopen = () => done(null);
    socket.onerror = () => failed(new Error("could not connect"));
  });
  const line = {
    log,
    /** @param {unknown} data */
    send: (data) => socket.send(JSON.stringify(data)),
    /** The first message not yet looked at that fits, waiting for it. @param {(m: any) => boolean} fits */
    async hear(fits, ms = 10000) {
      for (const end = Date.now() + ms; ; await new Promise((wake) => setTimeout(wake, 20))) {
        const at = log.findIndex(fits);
        if (at >= 0) return log.splice(at, 1)[0];
        assert(Date.now() < end, "waited too long for a message");
      }
    },
    close: () => new Promise((done) => ((socket.onclose = () => done(null)), socket.close())),
  };
  return line;
}

/** The tiles of the shortest way between two places, as centres, or null. @param {import("../examples/monster/world.js").Grid} grid @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to */
function route(grid, from, to) {
  const size = grid.size;
  const start = Math.floor(from.y) * size + Math.floor(from.x), end = Math.floor(to.y) * size + Math.floor(to.x);
  const came = new Map([[start, -1]]);
  for (const queue = [start]; queue.length;) {
    const at = /** @type {number} */ (queue.shift());
    if (at === end) break;
    for (const next of [at - 1, at + 1, at - size, at + size]) {
      if (next < 0 || next >= size * size || grid.tiles[next] || came.has(next)) continue;
      came.set(next, at);
      queue.push(next);
    }
  }
  if (!came.has(end)) return null;
  /** @type {{ x: number, y: number }[]} */
  const way = [];
  for (let at = end; at !== -1; at = /** @type {number} */ (came.get(at))) way.unshift({ x: (at % size) + 0.5, y: Math.floor(at / size) + 0.5 });
  return way;
}

/**
 * Walk a display's player toward a place that may move, as a display would: positions sent about ten
 * times a second at walking speed. Stops when `stop` says so. Follows where the game server puts the
 * player (when eaten or put back).
 * @param {Awaited<ReturnType<typeof display>>} line
 * @param {{ x: number, y: number, a: number }} me
 * @param {import("../examples/monster/world.js").Grid} grid
 * @param {() => { x: number, y: number }} target
 * @param {() => boolean} stop
 */
async function walk(line, me, grid, target, stop) {
  for (let last = Date.now(), end = last + 60000; !stop(); ) {
    assert(Date.now() < end, "walked too long");
    await new Promise((wake) => setTimeout(wake, 100));
    const now = Date.now(), seconds = (now - last) / 1000;
    last = now;
    for (const m of line.log.splice(0)) {
      if (m.type === "eaten" || m.type === "fix") Object.assign(me, { x: m.x, y: m.y });
      if (m.type === "t") latest.t = m;
      else if (m.type === "eaten") latest.eaten = m;
      else if (m.type === "level" || m.type === "done") latest[m.type] = m;
    }
    const way = route(grid, me, target());
    if (!way) continue;
    // Keep to the middle of the corridor, so as not to clip corners: line up across it, then go along it.
    const [here, next] = [way[0], way[1] ?? target()];
    const along = Math.abs(next.x - here.x) > Math.abs(next.y - here.y);
    const goal = along && Math.abs(me.y - here.y) > 0.05 ? { x: me.x, y: here.y } : !along && Math.abs(me.x - here.x) > 0.05 ? { x: here.x, y: me.y } : next;
    const dx = goal.x - me.x, dy = goal.y - me.y, d = Math.hypot(dx, dy);
    const step = Math.min(3 * seconds, d);
    if (d > 0) {
      me.a = Math.atan2(dy, dx);
      me.x += (dx / d) * step;
      me.y += (dy / d) * step;
    }
    line.send({ type: "pos", x: me.x, y: me.y, a: me.a });
  }
}
/** What a walking display last heard, by type. @type {Record<string, any>} */
let latest = {};

Deno.test("Monster Maze plays through the host: players see each other, walls hold, and the monster comes", async () => {
  const play = await running();
  try {
    const page = await fetch(`http://localhost:${play.port}/`);
    assert.match(await page.text(), /Endless Maze/);
    const a = await display(play.port), b = await display(play.port, "f".repeat(32));
    assert.deepEqual(await a.hear((m) => m.type === "state"), { type: "state", player: null, reached: 1, best: {} });
    await b.hear((m) => m.type === "state");

    a.send({ type: "ping", t: 12345 });
    assert.deepEqual(await a.hear((m) => m.type === "pong"), { type: "pong", t: 12345 });

    a.send({ type: "enter", level: 1 });
    b.send({ type: "enter", level: 1 });
    const start = await a.hear((m) => m.type === "level");
    assert.deepEqual([start.level, start.x, start.y], [1, 1.5, 1.5]);
    await b.hear((m) => m.type === "level");

    // A move through a wall is refused.
    const grid = makeGrid(1);
    await new Promise((wake) => setTimeout(wake, 200));
    a.send({ type: "pos", x: 1.5, y: 1.0, a: 0 });
    const fix = await a.hear((m) => m.type === "fix");
    assert.deepEqual([fix.x, fix.y], [1.5, 1.5]);

    // A lawful step is accepted, and the other display sees it at its next update.
    const open = { x: 1.7, y: 1.5 };
    await new Promise((wake) => setTimeout(wake, 200));
    a.send({ type: "pos", x: open.x, y: open.y, a: 0.5 });
    const seen = await b.hear((m) => m.type === "t" && m.o.length === 1 && m.o[0][1] === open.x && m.o[0][2] === open.y);
    assert.equal(seen.o[0][3], 0.5);
    assert(JSON.stringify(seen).length < 200, "a tick is small");

    // The monster moves, toward the nearest player.
    const first = (await a.hear((m) => m.type === "t")).m;
    const later = (await a.hear((m) => m.type === "t" && Math.hypot(m.m[0] - first[0], m.m[1] - first[1]) > 0.3, 15000)).m;
    const near = (/** @type {number[]} */ p) => Math.hypot(p[0] - open.x, p[1] - open.y);
    assert(near(later) < near(first), "it came closer");
    await a.close();
    await b.close();
  } finally {
    await play.stop();
  }
  assert.equal(play.said.join("\n"), "");
});

Deno.test("when the monster reaches a player, they start again elsewhere with their clock running", async () => {
  const play = await running();
  try {
    const grid = makeGrid(1);
    const line = await display(play.port);
    line.send({ type: "enter", level: 1 });
    await line.hear((m) => m.type === "level");
    latest = {};
    const me = { x: 1.5, y: 1.5, a: 0 };
    const monster = () => (latest.t ? { x: latest.t.m[0], y: latest.t.m[1] } : { x: grid.monster.x, y: grid.monster.y });
    await walk(line, me, grid, monster, () => latest.eaten);
    const { x, y } = latest.eaten;
    assert(Math.hypot(x - monster().x, y - monster().y) >= grid.size * 0.4 - 1e-6, "far from the monster");
    // A new line for the same player finds the same clock and the count of times eaten.
    await line.close();
    const again = await display(play.port);
    again.send({ type: "enter", level: 1 });
    const back = await again.hear((m) => m.type === "level");
    assert(back.elapsed > ENTRY_GRACE_MS, "the clock kept running");
    assert.equal(back.eaten, 1);
    assert(Math.hypot(back.x - x, back.y - y) < 1, "back where they were");
    await again.close();
  } finally {
    await play.stop();
  }
});

Deno.test("reaching the exit opens the next level, and the progress is kept", async () => {
  const play = await running();
  try {
    const grid = makeGrid(1);
    const line = await display(play.port);
    line.send({ type: "enter", level: 1 });
    await line.hear((m) => m.type === "level");
    latest = {};
    await walk(line, { x: 1.5, y: 1.5, a: 0 }, grid, () => grid.exit, () => latest.done);
    assert.equal(latest.done.level, 1);
    assert.equal(latest.done.reached, 2);
    assert(latest.done.ms > 0);
    if (latest.level?.level !== 2) await line.hear((m) => m.type === "level" && m.level === 2);
    await line.close();
    const again = await display(play.port);
    assert.equal((await again.hear((m) => m.type === "state")).reached, 2, "the same guest comes back to their progress");
    again.send({ type: "enter", level: 3 });
    assert.equal((await again.hear((m) => m.type === "error")).error, "That level is not open yet.");
    await again.close();
  } finally {
    await play.stop();
  }
});
