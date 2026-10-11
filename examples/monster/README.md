# Monster Maze

A fast example game for several players at once, to show whether real-time play feels good through the host program and a relay. It opens looking just like Endless Maze; at the first move the player falls through a trap door into the same maze in 3D, first person, with the other players and a monster. Reach the exit to open a bigger level. Controls are the arrow keys or W A S D, or the buttons over the view on a phone. The small number at the top right is the round trip to the game server in milliseconds.

| File         | What it is                                                                          |
| ------------ | ----------------------------------------------------------------------------------- |
| `game.js`    | The game server: the timer, who may play which level, progress and records          |
| `world.js`   | The rules as plain functions (walls, the monster, eating, the exit), used by both   |
| `maze.js`    | Making mazes, copied from Endless Maze and used by both                             |
| `index.html` | The display: the maze from above, the trap door, and the 3D view (raycasting)       |
| `card.json`  | The realm card's words                                                              |

- **Who owns what.** The game server owns the truth. Each display sends its own position about ten times a second; the server refuses a move through a wall, or one that keeps up more than 4.2 tiles a second (walking is 3), and puts the player back. Messages that arrive late and bunched together are still believed. Every 80 ms, while anyone is in a level, the timer moves the monster, checks for eaten players and exits, and sends each player the monster and the others on their level. With nobody in a level, no timer is set.
- **The monster** sees through walls and heads straight for the nearest player, a little slower than they walk, sliding along walls but never going around them. Reached players start again in another part of the maze with their clock still running, and are safe for a moment.
- **Only progress is saved**, under who is playing, as in Endless Maze: the level reached and best times, with records for levels 3, 10, 20 and every tenth after. A restart puts everyone back at the start of their level; a line that drops and comes back within 30 seconds returns to where it was.

Run it with `deno task monster` and open `http://localhost:8000/`; to play with friends anywhere, `deno task monster --relay https://relay.endlessmind.com/` and send them the link it prints; [the host program](../../host/README.md) lists the options.
