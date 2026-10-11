// The rules of Monster Maze as plain functions, with no clock, no randomness and no calls to the host
// of their own, so the game server can use them and tests can run them without waiting. The display
// imports this file too, to draw the same walls and to walk into them in the same way.
//
// Space is measured in tiles. A maze of N by N cells is drawn on a grid of (2N+1) by (2N+1) tiles, wall
// tiles and floor tiles alike one unit wide, so a corridor is one unit wide and a wall one unit thick.
// A position is (x, y) in tiles, x to the right and y down, and an angle `a` in radians: 0 faces right,
// and turning right makes it bigger.

import { DOWN, LEFT, makeMaze, RIGHT, UP } from "./maze.js";

export const PLAYER_R = 0.22; // how far from a wall a player's centre must stay
export const CHECK_R = 0.19; // the game server asks a little less, since positions reach it rounded
export const MONSTER_R = 0.3;
export const WALK = 3; // tiles per second a player walks forward; the display moves at this speed
export const BACK = 2; // and backward
export const TURN = 2.4; // radians per second a player turns
export const MAX_SPEED = 4.2; // the fastest the game server believes a player: walking, plus room for lag
export const SLACK = 1.5; // tiles of unused movement a player may hold, since messages arrive late and in bunches
export const EAT_DIST = 0.55; // the monster is this close to a player: eaten
export const EXIT_DIST = 0.6; // a player is this close to the exit's centre: finished
export const ENTRY_GRACE_MS = 4000; // after falling in, the monster cannot eat a player
export const RESPAWN_GRACE_MS = 2500; // and after being eaten and started again elsewhere
export const REJOIN_GRACE_MS = 1500; // and after a dropped line comes back
export const GHOST_MS = 30000; // how long a player who left is remembered, to rejoin where they were

/** How fast the monster goes on a level, in tiles per second: a little slower than any player. @param {number} level */
export const monsterSpeed = (level) => Math.min(1.8 + 0.12 * level, 2.8);

/**
 * @typedef {{
 *   level: number, cells: number, size: number, tiles: Uint8Array, open: Uint8Array,
 *   start: { x: number, y: number, a: number }, exit: { x: number, y: number }, monster: { x: number, y: number },
 * }} Grid
 * `tiles` holds 1 for a wall tile and 0 for a floor tile, row by row; `open` is the cell form from maze.js.
 */

/** The tile grid for a level, made from its maze. @param {number} level @returns {Grid} */
export function makeGrid(level) {
  const maze = makeMaze(level);
  const cells = maze.size;
  const size = 2 * cells + 1;
  const tiles = new Uint8Array(size * size).fill(1);
  for (let cell = 0; cell < cells * cells; cell++) {
    const tx = 2 * (cell % cells) + 1, ty = 2 * Math.floor(cell / cells) + 1;
    tiles[ty * size + tx] = 0;
    if (maze.open[cell] & RIGHT) tiles[ty * size + tx + 1] = 0;
    if (maze.open[cell] & DOWN) tiles[(ty + 1) * size + tx] = 0;
  }
  const middle = 2 * (cells >> 1) + 1.5;
  return {
    level,
    cells,
    size,
    tiles,
    open: maze.open,
    start: { x: 1.5, y: 1.5, a: facing(maze.open[0]) },
    exit: { x: size - 1.5, y: size - 1.5 },
    monster: { x: middle, y: middle },
  };
}

/** An angle that looks down an open side of a cell. @param {number} open */
function facing(open) {
  return open & RIGHT ? 0 : open & DOWN ? Math.PI / 2 : open & LEFT ? Math.PI : open & UP ? -Math.PI / 2 : 0;
}

/** True if a disc of radius `r` at (x, y) touches a wall or the edge. @param {Grid} grid @param {number} x @param {number} y @param {number} r */
export function blocked(grid, x, y, r) {
  const size = grid.size;
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (tx < 0 || ty < 0 || tx >= size || ty >= size || grid.tiles[ty * size + tx]) return true;
    }
  }
  return false;
}

/** True if a disc can go in a straight line from one place to another without touching a wall. @param {Grid} grid @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} r */
export function clear(grid, ax, ay, bx, by, r = PLAYER_R) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.15));
  for (let i = 1; i <= steps; i++) {
    if (blocked(grid, ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps, r)) return false;
  }
  return true;
}

/**
 * Where a disc ends up after trying to move by (dx, dy): all of it, or if a wall is in the way, the
 * part along one axis. Changes `at` in place. @param {Grid} grid @param {{ x: number, y: number }} at @param {number} dx @param {number} dy @param {number} r
 */
export function slide(grid, at, dx, dy, r = PLAYER_R) {
  if (!blocked(grid, at.x + dx, at.y + dy, r)) {
    at.x += dx;
    at.y += dy;
  } else if (!blocked(grid, at.x + dx, at.y, r)) at.x += dx;
  else if (!blocked(grid, at.x, at.y + dy, r)) at.y += dy;
}

/**
 * The monster's move: straight toward a point, as far as `dist`, with no idea where the walls are.
 * Where a wall is in the way it slides along it, and if it cannot, it stays. Changes `m` in place.
 * @param {Grid} grid @param {{ x: number, y: number }} m @param {number} tx @param {number} ty @param {number} dist
 */
export function chase(grid, m, tx, ty, dist) {
  const dx = tx - m.x, dy = ty - m.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return;
  const ux = dx / length, uy = dy / length;
  for (let left = Math.min(dist, length); left > 1e-6;) {
    const s = Math.min(left, 0.15);
    left -= s;
    if (!blocked(grid, m.x + ux * s, m.y + uy * s, MONSTER_R)) {
      m.x += ux * s;
      m.y += uy * s;
      continue;
    }
    const alongX = !blocked(grid, m.x + Math.sign(ux) * s * Math.abs(ux), m.y, MONSTER_R);
    const alongY = !blocked(grid, m.x, m.y + Math.sign(uy) * s * Math.abs(uy), MONSTER_R);
    if (alongX && (Math.abs(ux) >= Math.abs(uy) || !alongY)) m.x += Math.sign(ux) * s * Math.abs(ux);
    else if (alongY) m.y += Math.sign(uy) * s * Math.abs(uy);
    else break;
  }
}

/**
 * @typedef {{
 *   conn: number, who: string, level: number, x: number, y: number, a: number, since: number,
 *   safeUntil: number, last: number, room: number, place: number, eaten: number,
 * }} Rider
 * One player on one level. `since` is when their clock started; `last` when their position last came in.
 * @typedef {{ grid: Grid, monster: { x: number, y: number }, riders: Map<number, Rider>, last: number }} Level
 * @typedef {{ done: { conn: number, level: number, ms: number }[], send: [number, any][] }} Ticked
 */

const round = (/** @type {number} */ n) => Math.round(n * 100) / 100;

/**
 * Everything in play: a monster and some players on each level that has players. Time comes in as an
 * argument (milliseconds), and so does chance, so a test can run a minute of play in an instant.
 * @param {{ gridOf?: (level: number) => Grid, random?: () => number }} [options]
 */
export function createWorld({ gridOf = makeGrid, random = Math.random } = {}) {
  /** @type {Map<number, Level>} */
  const levels = new Map();
  /** @type {Map<number, Rider>} */
  const riders = new Map();
  /** Players who left a level, remembered for a while by who they are. @type {Map<string, Rider & { until: number }>} */
  const ghosts = new Map();
  /** Counts every time a player is put somewhere: on entering a level, and after being eaten. */
  let places = 0;

  /** Put a player on a level: where they were if they just left it, otherwise at its start. @param {number} conn @param {string} who @param {number} level @param {number} now */
  function enter(conn, who, level, now) {
    leave(conn, now, false);
    // A phone's old line can linger after its new one is up: the newer line takes over where it was.
    for (const old of riders.values()) if (old.who === who && old.level === level) leave(old.conn, now);
    for (const [name, ghost] of ghosts) if (ghost.until < now) ghosts.delete(name);
    let lv = levels.get(level);
    if (!lv) {
      const grid = gridOf(level);
      levels.set(level, (lv = { grid, monster: { ...grid.monster }, riders: new Map(), last: now }));
    }
    const ghost = ghosts.get(who);
    ghosts.delete(who);
    /** @type {Rider} */
    const rider = ghost && ghost.level === level
      ? { ...ghost, conn, last: now, room: SLACK, place: ++places, safeUntil: now + REJOIN_GRACE_MS }
      : { conn, who, level, ...lv.grid.start, since: now, safeUntil: now + ENTRY_GRACE_MS, last: now, room: SLACK, place: ++places, eaten: 0 };
    lv.riders.set(conn, rider);
    riders.set(conn, rider);
    return rider;
  }

  /** Take a player off their level, remembering them for a while unless they finished. @param {number} conn @param {number} now */
  function leave(conn, now, remember = true) {
    const rider = riders.get(conn);
    if (!rider) return;
    riders.delete(conn);
    const lv = levels.get(rider.level);
    lv?.riders.delete(conn);
    if (lv && !lv.riders.size) levels.delete(rider.level);
    if (remember) ghosts.set(rider.who, { ...rider, until: now + GHOST_MS });
  }

  /**
   * A player says where they now are. Returns nothing if that is believed, or the place to put them
   * back: the move was too fast, or went through a wall, or made no sense.
   * `place` is the number of the placing the display had heard of when it sent this. A display that has
   * not yet heard it was put somewhere new is still sending from where it was, and is not answered.
   * @param {number} conn @param {any} x @param {any} y @param {any} a @param {number} now @param {unknown} [place]
   * @returns {{ x: number, y: number, p: number } | undefined}
   */
  function move(conn, x, y, a, now, place) {
    const rider = riders.get(conn);
    const lv = rider && levels.get(rider.level);
    if (!rider || !lv) return;
    if (place !== undefined && place !== rider.place) return;
    // Movement is earned as time passes and spent by moving, so a message that arrives late, with the
    // next close behind it, is still believed, and nobody keeps up more than MAX_SPEED for long.
    rider.room = Math.min(rider.room + (MAX_SPEED * Math.max(0, now - rider.last)) / 1000, SLACK);
    rider.last = now;
    // Being put back is a placing too: what the display sends before it hears of it is not answered.
    const refused = () => ({ x: round(rider.x), y: round(rider.y), p: (rider.place = ++places) });
    if (![x, y, a].every((n) => typeof n === "number" && Number.isFinite(n))) return refused();
    const far = Math.hypot(x - rider.x, y - rider.y);
    if (far > rider.room) return refused();
    rider.room -= far;
    if (!clear(lv.grid, rider.x, rider.y, x, y, CHECK_R)) return refused();
    rider.x = x;
    rider.y = y;
    rider.a = a % (2 * Math.PI);
  }

  /** Start a player again somewhere far from the monster, with their clock still running. @param {Level} lv @param {Rider} rider @param {number} now */
  function respawn(lv, rider, now) {
    const { grid, monster } = lv;
    const far = grid.size * 0.4;
    /** @type {{ x: number, y: number, open: number, away: number }[]} */
    const spots = [];
    for (let cell = 0; cell < grid.cells * grid.cells - 1; cell++) {
      const x = 2 * (cell % grid.cells) + 1.5, y = 2 * Math.floor(cell / grid.cells) + 1.5;
      spots.push({ x, y, open: grid.open[cell], away: Math.hypot(x - monster.x, y - monster.y) });
    }
    const farEnough = spots.filter((spot) => spot.away >= far);
    const spot = farEnough.length ? farEnough[Math.floor(random() * farEnough.length)] : spots.sort((p, q) => q.away - p.away)[0];
    rider.x = spot.x;
    rider.y = spot.y;
    rider.a = facing(spot.open);
    rider.safeUntil = now + RESPAWN_GRACE_MS;
    rider.last = now;
    rider.place = ++places;
    rider.eaten++;
  }

  /**
   * Move time on to `now`: each monster goes toward its nearest player, players at the exit are
   * finished (and taken off the level), players the monster reaches are started again elsewhere, and
   * everyone left is told where the monster and the other players are.
   * @param {number} now @returns {Ticked}
   */
  function tick(now) {
    /** @type {Ticked} */
    const out = { done: [], send: [] };
    for (const lv of [...levels.values()]) {
      const seconds = Math.min((now - lv.last) / 1000, 0.25);
      lv.last = now;
      const { grid, monster } = lv;
      let nearest = null;
      for (const rider of lv.riders.values()) {
        const d = Math.hypot(rider.x - monster.x, rider.y - monster.y);
        if (!nearest || d < nearest.d) nearest = { d, rider };
      }
      if (nearest) chase(grid, monster, nearest.rider.x, nearest.rider.y, monsterSpeed(grid.level) * seconds);
      for (const rider of [...lv.riders.values()]) {
        if (Math.hypot(rider.x - grid.exit.x, rider.y - grid.exit.y) < EXIT_DIST) {
          out.done.push({ conn: rider.conn, level: grid.level, ms: now - rider.since });
          leave(rider.conn, now, false);
        } else if (now >= rider.safeUntil && Math.hypot(rider.x - monster.x, rider.y - monster.y) < EAT_DIST) {
          respawn(lv, rider, now);
          out.send.push([rider.conn, { type: "eaten", x: round(rider.x), y: round(rider.y), a: round(rider.a), p: rider.place }]);
        }
      }
      for (const rider of lv.riders.values()) {
        const others = [...lv.riders.values()].filter((other) => other !== rider).map((o) => [o.conn, round(o.x), round(o.y), round(o.a)]);
        out.send.push([rider.conn, { type: "t", m: [round(monster.x), round(monster.y)], o: others }]);
      }
    }
    return out;
  }

  return {
    enter,
    leave,
    move,
    tick,
    /** How many players are on a level now. */
    playing: () => riders.size,
    /** @param {number} conn */
    rider: (conn) => riders.get(conn),
    /** @param {number} level */
    level: (level) => levels.get(level),
  };
}
