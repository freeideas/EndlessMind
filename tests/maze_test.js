// Endless Maze: the same level makes the same maze, every cell is reachable, and runs are checked.

import assert from "node:assert/strict";
import { makeMaze, mazeSize, solution, solves, step } from "../examples/maze/maze.js";

Deno.test("a level always makes the same maze, growing to 40 by 40", () => {
  assert.deepEqual(makeMaze(7).open, makeMaze(7).open);
  assert.notDeepEqual(makeMaze(7).open, makeMaze(8).open);
  assert.equal(mazeSize(1), 6);
  assert.equal(mazeSize(100), 40);
});

Deno.test("every cell can be reached from the start", () => {
  for (const level of [1, 5, 18]) {
    const maze = makeMaze(level);
    const seen = new Set([maze.start]);
    const todo = [maze.start];
    while (todo.length) {
      const cell = /** @type {number} */ (todo.pop());
      for (const letter of "URDL") {
        const to = step(maze, cell, letter);
        if (!seen.has(to)) {
          seen.add(to);
          todo.push(to);
        }
      }
    }
    assert.equal(seen.size, maze.size * maze.size);
  }
});

Deno.test("a run counts only if its moves reach the exit", () => {
  const maze = makeMaze(4);
  const moves = solution(maze);
  assert.ok(solves(maze, moves));
  assert.ok(!solves(maze, moves.slice(0, -1)));
  assert.ok(!solves(maze, "RRRRRRRRRRDDDDDDDDDD"), "walls stop a straight dash");
});
