# The host program

Runs a game: serves its display, keeps its game server sealed, and passes messages between the two. A maker uses it to play a game on their own computer while making it. The formats are in "Game servers" in [specs/PROTOCOL.md](../specs/PROTOCOL.md); what is still to come is in [PLAN.md](../PLAN.md).

| File        | What it is                                                                            |
| ----------- | ------------------------------------------------------------------------------------- |
| `main.js`   | The command line                                                                      |
| `host.js`   | `runGame`: the web server, the sealed process, saved data, sign-in and records        |
| `sealed.js` | Runs inside the seal: turns the host's messages into the calls a game server answers  |
| `play.js`   | For the display: its line to the game server, served at `<base>endlessmind/play.js`   |

## Use

```
deno task run <folder>
```

It prints the address to open, and starts the game server again whenever a file in the folder changes, so a maker sees each change by reloading the page. [examples/maze/](../examples/maze/) is a game to try it with: `deno task maze`.

| Option       | Default                           | What it sets                                             |
| ------------ | --------------------------------- | -------------------------------------------------------- |
| `--port`     | `8000`                            | The port to listen on                                    |
| `--hostname` | `127.0.0.1`                       | Who can reach it; the default is this computer only      |
| `--base`     | `http://localhost:<port>/`        | The address players use                                  |
| `--portal`   | `https://portal.endlessmind.com/` | The EntryPortal its sign-in codes name                   |
| `--data`     | `.data/` in the game's folder     | Where the realm's secret phrase and saved data are kept  |
| `--no-watch` |                                   | Do not restart when files change                         |

## A game's folder

| File          | What it is                                                             |
| ------------- | ---------------------------------------------------------------------- |
| `game.js`     | The game server. It may import other files in the folder               |
| `card.json`   | The realm card's words: `name`, `description`, and optionally `tags`   |
| `index.html`  | Where the display starts. Every other file in the folder is served too |
| `.data/`      | Made by the host; never served, and the game server cannot read it     |

A file or folder whose name starts with a dot is never served and never loaded.

The display imports two files the host serves: `./endlessmind/play.js` for its line to the game server, and `./endlessmind/signin.js` for the sign-in box (see [realm/README.md](../realm/README.md)).

## The seal

Each game server runs in a process of its own, started with no permissions at all: it cannot open files, use the network, start programs or read anything about the computer. Before it starts, the host checks that every file it imports is inside the game's own folder. It is stopped if it needs more than 64 MB of memory or goes six seconds without answering, and started again when the next player connects. The realm's secret phrase stays with the host, outside the seal. [tests/host_test.js](../tests/host_test.js) tries to break out.

`.data/` holds `realm-secret.txt` (the realm's identity; keep a copy), `realm-data.json` (sign-ins and records) and `game-data.json` (what the game server saved).
