# Endless Maze

A small example game: run mazes that grow with each level, using the arrow keys, W A S D, the arrow buttons on screen, or swipes. Finishing levels 3, 10, 20 and every tenth after earns a record. It shows a sealed game server, guest play, sign-in by QR code, "sign in on this computer", changing your name, claiming records and the public list.

| File         | What it is                                                                        |
| ------------ | --------------------------------------------------------------------------------- |
| `game.js`    | The game server: which levels are open, checking finished runs, offering records  |
| `index.html` | The display                                                                       |
| `maze.js`    | Making and solving mazes, used by both                                            |
| `card.json`  | The realm card's words                                                            |

- **Same maze for everyone.** A level number always makes the same maze (the "recursive backtracker"), so the game server checks a finished run by replaying its moves, and refuses runs faster than anyone can move.
- **Progress follows the player.** It is saved by player ID, so signing in on any device starts at the first unfinished level, and a guest's progress carries over at sign-in. If nothing is saved for a player, the records signed with them say how far they got.

Run it with `deno task maze` and open `http://localhost:8000/`; [the host program](../../host/README.md) lists the options. On endlessmind.com it runs as [deploy/endless-maze.service](../../deploy/endless-maze.service) at `https://maze.endlessmind.com/`.

To try it with a local EntryPortal, serve `portal/` (for example `deno run -A jsr:@std/http/file-server --port 8001 portal`) and add `--portal http://127.0.0.1:8001/`. The EntryPortal accepts plain `http` only for `localhost` and `127.0.0.1`.
