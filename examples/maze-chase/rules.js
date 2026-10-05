// Lantern Maze: the realm's rules. Runs in a sandbox on the referee's device
// (or anywhere: it is plain JavaScript with no outside dependencies).
// The shape of this module is the runtime interface in specs/RUNTIME.md.

const W = 21;
const H = 15;
const SPAWNS = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]];
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const SAFE_TICKS = 14;
const SPIRITS = 3;

// Doors to other mazes of the same game (see "Doors between realms" in specs/RUNTIME.md). Each is a
// realm link, "emind:<address>?via=<server>": the first opens in the right-hand wall, the second in the
// left. Leave the list empty for a maze with no doors. A runner who walks through takes their seeds along
// in a travel note this maze signs. The mazes listed in FRIENDS, by address, are trusted to say how many.
/** @type {string[]} */
const DOORS = [];
/** @type {string[]} */
const FRIENDS = [];
const DOOR_CELLS = [[W - 1, H >> 1], [0, H >> 1]];
/** The address a realm link names. @param {string} link */
const addressIn = (link) => link.slice("emind:".length).split("?")[0];

/** @typedef {{ name: string, color: string, x: number, y: number, dir: string | null, next: string | null, score: number, safe: number, spawn: number, door: number, near: number }} Actor */
/** @typedef {{ grid: string[][], actors: Record<string, Actor>, spirits: number[][], tick: number, round: number, seed: number, joined: number, used: string[] }} State */

/** Set in init: open a door for an actor, and say an actor is near one (see specs/RUNTIME.md). */
let openDoor = (/** @type {string} */ _actor, /** @type {string} */ _link, /** @type {unknown} */ _carry) => {};
let nearDoor = (/** @type {string} */ _actor, /** @type {string} */ _link) => {};

/** Small seeded random numbers, so a maze can be rebuilt from its seed. @param {State} s */
function random(s) {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Carve a maze, then knock out some extra walls so there are loops to escape through. @param {State} s */
function buildMaze(s) {
  const grid = Array.from({ length: H }, () => Array(W).fill("#"));
  const stack = [[1, 1]];
  grid[1][1] = " ";
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = Object.values(DIRS)
      .map(([dx, dy]) => [x + dx * 2, y + dy * 2, x + dx, y + dy])
      .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && grid[ny][nx] === "#");
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, wx, wy] = options[Math.floor(random(s) * options.length)];
    grid[wy][wx] = " ";
    grid[ny][nx] = " ";
    stack.push([nx, ny]);
  }
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const between = (grid[y][x - 1] === " " && grid[y][x + 1] === " ") ||
        (grid[y - 1][x] === " " && grid[y + 1][x] === " ");
      if (grid[y][x] === "#" && between && random(s) < 0.18) grid[y][x] = " ";
    }
  }
  s.grid = grid;
  DOORS.slice(0, 2).forEach((_, i) => {
    const [x, y] = DOOR_CELLS[i];
    grid[y][x] = "D";
  });
  sowSeeds(s);
}

/** Put a seed on every open cell except spawns and the spirits' home. @param {State} s */
function sowSeeds(s) {
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (s.grid[y][x] !== "#") s.grid[y][x] = ".";
    }
  }
  for (const [x, y] of SPAWNS) s.grid[y][x] = " ";
  const [cx, cy] = home(s);
  s.grid[cy][cx] = " ";
}

/** The open cell nearest the middle, where spirits start. @param {State} s */
function home(s) {
  let best = [1, 1];
  let bestDist = Infinity;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const d = Math.abs(x - (W >> 1)) + Math.abs(y - (H >> 1));
      if (s.grid[y][x] !== "#" && d < bestDist) (best = [x, y]), (bestDist = d);
    }
  }
  return best;
}

/** @param {State} s @param {number} x @param {number} y */
function open(s, x, y) {
  return x >= 0 && y >= 0 && x < W && y < H && s.grid[y][x] !== "#";
}

/** Where a spirit may go: open floor, but never a door. @param {State} s @param {number} x @param {number} y */
function haunted(s, x, y) {
  return open(s, x, y) && s.grid[y][x] !== "D";
}

/** First step from (x, y) along a shortest path to any target, or null. @param {State} s @param {number} x @param {number} y @param {Set<string>} targets */
function stepToward(s, x, y, targets) {
  const seen = new Set([`${x},${y}`]);
  /** @type {[number, number, number[] | null][]} */
  const queue = [[x, y, null]];
  while (queue.length) {
    const [cx, cy, first] = /** @type {[number, number, number[] | null]} */ (queue.shift());
    if (first && targets.has(`${cx},${cy}`)) return first;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (!haunted(s, nx, ny) || seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny, first ?? [nx, ny]]);
    }
  }
  return null;
}

/** @param {State} s @param {Actor} p */
function respawn(s, p) {
  const [x, y] = SPAWNS[p.spawn % SPAWNS.length];
  p.x = x;
  p.y = y;
  p.dir = null;
  p.next = null;
  p.safe = SAFE_TICKS;
}

/** @param {State} s */
function catches(s) {
  for (const p of Object.values(s.actors)) {
    if (p.safe > 0) continue;
    if (s.spirits.some(([x, y]) => x === p.x && y === p.y)) {
      p.score = Math.floor(p.score / 2);
      respawn(s, p);
    }
  }
}

export default {
  ticksPerSecond: 7,
  // The same moves in the same order always give the same maze (its random numbers come from the seed
  // kept in the state), and nothing in the state is secret, so every actor's portal can check the referee.
  repeatable: true,

  /** @param {{ seed: number, go?: typeof openDoor, near?: typeof nearDoor }} options @returns {State} */
  init(options) {
    if (options.go) openDoor = options.go;
    if (options.near) nearDoor = options.near;
    /** @type {State} */
    const s = { grid: [], actors: {}, spirits: [], tick: 0, round: 1, seed: options.seed, joined: 0, used: [] };
    buildMaze(s);
    const [hx, hy] = home(s);
    for (let i = 0; i < SPIRITS; i++) s.spirits.push([hx, hy]);
    return s;
  },

  /**
   * Make an in-realm form from the character's general description. A runner who came through a door from a
   * friendly maze keeps their seeds and arrives beside the door they came through.
   * @param {State} s @param {string} who @param {any} character @param {any[]} [claims]
   */
  enter(s, who, character, claims = []) {
    if (Object.keys(s.actors).length >= 12) return "This maze is full (12 actors).";
    const name = String(character?.name ?? "Visitor").slice(0, 24);
    const color = /^[#\w(),.%\s-]{1,40}$/.test(String(character?.color)) ? String(character.color) : "#9cf";
    /** @type {Actor} */
    const p = { name, color, x: 1, y: 1, dir: null, next: null, score: 0, safe: 0, spawn: s.joined++, door: -1, near: -1 };
    respawn(s, p);
    // A travel note counts once: the same one shown again (within its ten minutes) brings nothing.
    const ticket = claims.find((c) => c?.says?.travel && FRIENDS.includes(c.issuer) && !s.used.includes(`${c.issuer} ${c.time}`));
    if (ticket) {
      s.used = [...s.used, `${ticket.issuer} ${ticket.time}`].slice(-200);
      p.score = Math.max(0, Math.min(10_000, Math.floor(Number(ticket.says.travel.carry?.seeds) || 0)));
      const i = DOORS.slice(0, 2).findIndex((link) => addressIn(link) === ticket.issuer);
      if (i >= 0) [p.x, p.y, p.door] = [i === 0 ? W - 2 : 1, H >> 1, i];
    }
    s.actors[who] = p;
    return true;
  },

  /** @param {State} s @param {string} who @param {any} action */
  act(s, who, action) {
    const p = s.actors[who];
    if (p && action && Object.hasOwn(DIRS, action.dir)) p.next = action.dir;
  },

  /** @param {State} s @param {string} who */
  leave(s, who) {
    delete s.actors[who];
  },

  /** @param {State} s */
  tick(s) {
    s.tick++;
    for (const [who, p] of Object.entries(s.actors)) {
      if (p.safe > 0) p.safe--;
      const want = p.next && DIRS[/** @type {keyof DIRS} */ (p.next)];
      if (want && open(s, p.x + want[0], p.y + want[1])) p.dir = p.next;
      const go = p.dir && DIRS[/** @type {keyof DIRS} */ (p.dir)];
      if (go && open(s, p.x + go[0], p.y + go[1])) {
        p.x += go[0];
        p.y += go[1];
      }
      if (s.grid[p.y][p.x] === ".") {
        s.grid[p.y][p.x] = " ";
        p.score++;
      }
      // Near a door, the runner's portal fetches the maze beyond it; on the door, the runner goes through.
      const i = DOOR_CELLS.findIndex(([x, y], i) => i < DOORS.length && Math.abs(x - p.x) + Math.abs(y - p.y) <= 3);
      if (i !== p.near) {
        p.near = i;
        if (i >= 0) nearDoor(who, DOORS[i]);
      }
      const on = s.grid[p.y][p.x] === "D" ? DOOR_CELLS.findIndex(([x, y]) => x === p.x && y === p.y) : -1;
      if (on !== p.door) {
        p.door = on;
        if (on >= 0) openDoor(who, DOORS[on], { seeds: p.score });
      }
    }
    catches(s);

    // Spirits move on two ticks out of three, so a careful runner can escape.
    if (s.tick % 3 !== 0) {
      const targets = new Set(Object.values(s.actors).filter((p) => p.safe === 0).map((p) => `${p.x},${p.y}`));
      s.spirits = s.spirits.map(([x, y]) => {
        const moves = Object.values(DIRS).map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => haunted(s, nx, ny));
        const wander = moves[Math.floor(random(s) * moves.length)] ?? [x, y];
        if (!targets.size || random(s) < 0.2) return wander;
        return stepToward(s, x, y, targets) ?? wander;
      });
      catches(s);
    }

    if (!s.grid.some((row) => row.includes("."))) {
      s.round++;
      sowSeeds(s);
    }
  },

  /**
   * What one actor is sent: everything here is public, so the whole board. Any renderer can draw it:
   *   grid     rows of text, top to bottom: "#" wall, "." seed, " " open floor, "D" a door to another maze
   *   actors   each { name, color, x, y, score, safe, me }; `me` marks the actor this view is for
   *   spirits  each [x, y]
   *   round    which maze this is, counting from 1
   *   tick     counts up on every tick
   * @param {State} s @param {string} who
   */
  view(s, who) {
    return {
      grid: s.grid.map((row) => row.join("")),
      actors: Object.entries(s.actors).map(([id, p]) => ({
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y,
        score: p.score,
        safe: p.safe > 0,
        me: id === who,
      })),
      spirits: s.spirits,
      round: s.round,
      tick: s.tick,
    };
  },
};
