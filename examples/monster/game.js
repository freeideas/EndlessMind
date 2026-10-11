// Monster Maze's game server. Players who have fallen into a level share its maze with a monster; the
// rules are in world.js. This file connects them to the host: who may play which level, the timer that
// keeps the monster moving, and the progress and records earned along the way. It runs sealed (see
// host/README.md), so it knows only what its calls tell it. Only lasting progress is saved: a restart
// puts everyone back at the start of their level, and a line that drops is picked up where it was.

import { createWorld } from "./world.js";

const TICK_MS = 80; // the monster moves and everyone hears about it about 12 times a second

/** The levels whose completion earns a record: 3, 10, 20, 30, ... @param {number} level */
const milestone = (level) => level === 3 || (level >= 10 && level % 10 === 0);

/**
 * @typedef {import("../../host/sealed.js").Game} Game
 * @typedef {import("../../host/sealed.js").Player} Player
 * Progress is saved under who is playing ("player:<ID>" or "guest:<random>"). `reached` is the highest
 * level they may play; `best` their best time on each level, in milliseconds; `earned` the levels
 * whose records have been offered.
 * @typedef {{ reached: number, best: Record<string, number>, earned?: number[] }} Progress
 */

/** @type {ReturnType<typeof createWorld>} */
let world = createWorld();
/** Everyone connected, by connection. @type {Map<number, Player>} */
let players = new Map();
/** True while a timer is set. */
let ticking = false;

/**
 * Offer a signed-in player the records for every milestone they have passed and not yet been offered,
 * including ones passed as a guest before signing in.
 * @param {Game} game
 * @param {Player} player
 * @param {Progress} mine
 */
function award(game, player, mine) {
  for (let level = 1; level < mine.reached; level++) {
    if (!milestone(level) || mine.earned?.includes(level)) continue;
    (mine.earned ??= []).push(level);
    game.offer(player, [{ text: `Finished the first ${level} mazes in Monster Maze.`, data: { level } }]);
  }
}

/**
 * A player's progress. A guest who has played nothing yet is not saved, so passing visitors leave
 * nothing behind.
 * @param {Game} game
 * @param {Player} player
 * @returns {Progress}
 */
function progressOf(game, player) {
  const mine = game.load(player.who);
  if (mine || !player.id) return mine ?? { reached: 1, best: {} };
  // No progress kept here (a new host, or lost data)? The records this realm signed with the player
  // still say how far they got.
  const recorded = player.records.map((record) => Number(record.data?.level) || 0);
  return { reached: Math.max(0, ...recorded) + 1, best: {}, earned: recorded };
}

/** Make sure the timer is set while anyone is in a level, and not otherwise. @param {Game} game */
function keepTime(game) {
  const wanted = world.playing() > 0;
  if (wanted === ticking) return;
  ticking = wanted;
  game.timer(wanted ? TICK_MS : null);
}

/** Put a player on a level and tell their display where they stand. @param {Game} game @param {Player} player @param {number} level @param {Progress} mine */
function putOn(game, player, level, mine) {
  const now = Date.now();
  const rider = world.enter(player.conn, player.who, level, now);
  game.send(player, { type: "level", level, x: rider.x, y: rider.y, a: rider.a, p: rider.place, elapsed: now - rider.since, eaten: rider.eaten, best: mine.best[level] });
  keepTime(game);
}

export default {
  /** A server that starts fresh knows no one is playing. @param {Game} game */
  start(game) {
    world = createWorld();
    players = new Map();
    ticking = false;
    game.timer(null);
  },

  /** @param {Game} game @param {Player} player */
  join(game, player) {
    players.set(player.conn, player);
    const mine = progressOf(game, player);
    /** @type {Progress | undefined} */
    const asGuest = player.id ? game.load(player.guest) : undefined;
    if (asGuest) {
      mine.reached = Math.max(mine.reached, asGuest.reached);
      for (const [level, ms] of Object.entries(asGuest.best)) mine.best[level] = Math.min(mine.best[level] ?? Infinity, ms);
      game.save(player.guest, undefined);
      award(game, player, mine);
      game.save(player.who, mine);
    }
    game.send(player, { type: "state", player: player.id, reached: mine.reached, best: mine.best });
  },

  /** @param {Game} game @param {Player} player */
  leave(game, player) {
    players.delete(player.conn);
    world.leave(player.conn, Date.now());
    keepTime(game);
  },

  /** @param {Game} game @param {Player} player @param {any} asked */
  message(game, player, asked) {
    if (asked?.type === "ping") return game.send(player, { type: "pong", t: asked.t });

    if (asked?.type === "pos") {
      const back = world.move(player.conn, asked.x, asked.y, asked.a, Date.now(), asked.p);
      if (back) game.send(player, { type: "fix", ...back });
      return;
    }

    if (asked?.type === "enter") {
      const mine = progressOf(game, player);
      const { level } = asked;
      if (!Number.isInteger(level) || level < 1 || level > mine.reached) return game.send(player, { type: "error", where: "enter", error: "That level is not open yet." });
      putOn(game, player, level, mine);
    }
  },

  /** The monster moves; players at the exit move on to the next level. @param {Game} game */
  timer(game) {
    ticking = false;
    const { send, done } = world.tick(Date.now());
    for (const [conn, data] of send) {
      const player = players.get(conn);
      if (player) game.send(player, data);
    }
    for (const { conn, level, ms } of done) {
      const player = players.get(conn);
      if (!player) continue;
      const mine = progressOf(game, player);
      mine.best[level] = Math.min(mine.best[level] ?? Infinity, ms);
      if (level === mine.reached) mine.reached++;
      if (player.id) award(game, player, mine);
      game.save(player.who, mine);
      game.send(player, { type: "done", level, ms, reached: mine.reached, best: mine.best });
      putOn(game, player, level + 1, mine);
    }
    keepTime(game);
  },
};
