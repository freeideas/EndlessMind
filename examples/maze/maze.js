// Mazes for Endless Maze, used unchanged by the game's server and by the browser. A level number
// always makes the same maze, so everyone plays the same level 7, and the server can check a finished
// run by replaying its moves.
//
// The mazes are made with the "recursive backtracker" (a depth-first search): start in a corner,
// keep stepping to a random neighbour not yet visited, knocking down the wall between, and back up
// when stuck. Every cell ends up reachable by exactly one path, with long winding corridors.

/** How big a level's maze is: 6 by 6 at level 1, two more each level, up to 40 by 40. @param {number} level */
export function mazeSize(level) {
  return Math.min(4 + 2 * level, 40);
}

/** A small, fast random number source that always gives the same numbers for the same seed. @param {number} seed */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each cell records which of its sides are open, as bits.
export const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;

/** The moves a player can make: letter, column change, row change, side opened, opposite side. */
export const MOVES = {
  U: { dx: 0, dy: -1, side: UP, back: DOWN },
  R: { dx: 1, dy: 0, side: RIGHT, back: LEFT },
  D: { dx: 0, dy: 1, side: DOWN, back: UP },
  L: { dx: -1, dy: 0, side: LEFT, back: RIGHT },
};

/**
 * @typedef {{ level: number, size: number, open: Uint8Array, start: number, exit: number }} Maze
 * Cells are numbered row by row: cell = row * size + column. The start is the top left corner and
 * the exit the bottom right.
 */

/** The maze for a level. @param {number} level @returns {Maze} */
export function makeMaze(level) {
  const size = mazeSize(level);
  const next = random(level * 7919 + 17);
  const open = new Uint8Array(size * size);
  const seen = new Uint8Array(size * size);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const cell = stack[stack.length - 1];
    const x = cell % size, y = Math.floor(cell / size);
    const choices = Object.values(MOVES).filter(({ dx, dy }) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < size && ny < size && !seen[ny * size + nx];
    });
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const move = choices[Math.floor(next() * choices.length)];
    const to = (y + move.dy) * size + x + move.dx;
    open[cell] |= move.side;
    open[to] |= move.back;
    seen[to] = 1;
    stack.push(to);
  }
  return { level, size, open, start: 0, exit: size * size - 1 };
}

/** Where a move leads: the next cell, or the same cell if a wall is in the way. @param {Maze} maze @param {number} cell @param {string} letter */
export function step(maze, cell, letter) {
  const move = MOVES[/** @type {keyof typeof MOVES} */ (letter)];
  if (!move || !(maze.open[cell] & move.side)) return cell;
  return cell + move.dy * maze.size + move.dx;
}

/** True if these moves ("RRDL...") take a player from the start to the exit. @param {Maze} maze @param {string} moves */
export function solves(maze, moves) {
  let cell = maze.start;
  for (const letter of moves) {
    cell = step(maze, cell, letter);
    if (cell === maze.exit) return true;
  }
  return false;
}

/** The shortest moves from start to exit, found by searching outward from the start. @param {Maze} maze */
export function solution(maze) {
  /** @type {(string | null)[]} */
  const how = new Array(maze.open.length).fill(null);
  const from = new Int32Array(maze.open.length).fill(-1);
  const queue = [maze.start];
  from[maze.start] = maze.start;
  while (queue.length) {
    const cell = /** @type {number} */ (queue.shift());
    if (cell === maze.exit) break;
    for (const letter of Object.keys(MOVES)) {
      const to = step(maze, cell, letter);
      if (to !== cell && from[to] < 0) {
        from[to] = cell;
        how[to] = letter;
        queue.push(to);
      }
    }
  }
  let moves = "";
  for (let cell = maze.exit; cell !== maze.start; cell = from[cell]) moves = how[cell] + moves;
  return moves;
}
