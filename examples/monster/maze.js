// Mazes for Monster Maze, used unchanged by the game's server and by the browser. A level number
// always makes the same maze, so everyone plays the same level 7. The first part is the same as in
// Endless Maze (the "recursive backtracker": walk to a random unvisited neighbour, knocking down the
// wall between, and back up when stuck), copied because a game server may import only its own folder.

/** How big a level's maze is: 6 by 6 cells at level 1, one more each level, up to 30 by 30. @param {number} level */
export function mazeSize(level) {
  return Math.min(5 + level, 30);
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

const MOVES = [
  { dx: 0, dy: -1, side: UP, back: DOWN },
  { dx: 1, dy: 0, side: RIGHT, back: LEFT },
  { dx: 0, dy: 1, side: DOWN, back: UP },
  { dx: -1, dy: 0, side: LEFT, back: RIGHT },
];

/**
 * @typedef {{ level: number, size: number, open: Uint8Array, start: number, exit: number }} Maze
 * Cells are numbered row by row: cell = row * size + column. The start is the top left corner and
 * the exit the bottom right.
 */

/** The maze for a level. @param {number} level @returns {Maze} */
export function makeMaze(level) {
  const size = mazeSize(level);
  const next = random(level * 104729 + 31);
  const open = new Uint8Array(size * size);
  const seen = new Uint8Array(size * size);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const cell = stack[stack.length - 1];
    const x = cell % size, y = Math.floor(cell / size);
    const choices = MOVES.filter(({ dx, dy }) => {
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
