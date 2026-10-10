// Endless Maze's game server: who may play which level, checking each finished run, and the records
// earned along the way. It runs sealed (see host/README.md), so it knows nothing but what its calls
// tell it. Guests can play right away; signing in keeps their progress and carries over what they did
// as a guest.

import { makeMaze, solves } from "./maze.js";

const RUN_MS = 2 * 60 * 60 * 1000; // a run left unfinished this long is forgotten
const FASTEST_MS = 10; // no person moves faster than one step per 10 ms, even holding a key down

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

/** Runs in play, by a random ID: who started which level, and when. Kept in memory only. */
/** @type {Map<string, { who: string, level: number, started: number }>} */
const runs = new Map();

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
    game.offer(player, [{ text: `Finished the first ${level} mazes in Endless Maze.`, data: { level } }]);
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

export default {
  /** @param {Game} game @param {Player} player */
  join(game, player) {
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

  /** @param {Game} game @param {Player} player @param {any} asked */
  message(game, player, asked) {
    const mine = progressOf(game, player);
    const now = Date.now();

    if (asked?.type === "start") {
      const { level, n } = asked;
      if (!Number.isInteger(level) || level < 1 || level > mine.reached) return game.send(player, { type: "run", n, error: "That level is not open yet." });
      for (const [id, run] of runs) if (now - run.started > RUN_MS) runs.delete(id);
      const run = crypto.randomUUID();
      runs.set(run, { who: player.who, level, started: now });
      return game.send(player, { type: "run", n, run });
    }

    if (asked?.type === "finish") {
      const { run: id, moves } = asked;
      const run = runs.get(id);
      /** @param {string} error */
      const refuse = (error) => game.send(player, { type: "error", error });
      if (!run || run.who !== player.who) return refuse("That run is unknown here. Start the level again.");
      const ms = now - run.started;
      if (typeof moves !== "string" || !solves(makeMaze(run.level), moves)) return refuse("Those moves do not reach the exit.");
      if (ms < moves.length * FASTEST_MS) return refuse("That was faster than anyone can move.");
      runs.delete(id);
      mine.best[run.level] = Math.min(mine.best[run.level] ?? Infinity, ms);
      if (run.level === mine.reached) mine.reached++;
      if (player.id) award(game, player, mine);
      game.save(player.who, mine);
      return game.send(player, { type: "done", level: run.level, ms, reached: mine.reached, best: mine.best });
    }
  },
};
