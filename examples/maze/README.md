# Endless Maze

A small example realm: run mazes that grow with each level, using the arrow keys, W A S D, the arrow buttons on screen, or swipes. Finishing levels 3, 10, 20 and every tenth after earns a record. It shows guest play, sign-in by QR code, "sign in on this computer", changing your name, claiming records and the public list, using [the realm library](../../realm/README.md).

- **Same maze for everyone.** A level number always makes the same maze ([maze.js](maze.js), the "recursive backtracker"), so the server checks a finished run by replaying its moves, and refuses runs faster than anyone can move.
- **Progress follows the player.** It is kept by player ID, so signing in on any device starts at the first unfinished level, and a guest's progress carries over at sign-in. If the server has no progress for a player, the records it signed with them say how far they got.

Run it with `deno task maze` and open `http://localhost:8000/`. Its files (the realm's secret phrase, its data and everyone's progress) go in `data/` here, which Git ignores. On endlessmind.com it runs as [deploy/endless-maze.service](../../deploy/endless-maze.service) at `https://maze.endlessmind.com/`.

| Setting         | Default                                      |
| --------------- | -------------------------------------------- |
| `MAZE_PORT`     | `8000`                                       |
| `MAZE_HOSTNAME` | `127.0.0.1`: only this computer can reach it |
| `MAZE_BASE`     | `http://localhost:<port>/`                   |
| `MAZE_PORTAL`   | `https://portal.endlessmind.com/`            |
| `MAZE_DATA`     | `data/` in this folder                       |

To try it with a local EntryPortal, serve `portal/` (for example `deno run -A jsr:@std/http/file-server --port 8001 portal`) and set `MAZE_PORTAL=http://127.0.0.1:8001/`. The EntryPortal accepts plain `http` only for `localhost` and `127.0.0.1`.
