# The host program

Runs a game: serves its display, keeps its game server sealed, and passes messages between the two. A maker uses it to play a game on their own computer while making it, and to let friends anywhere join. It is also the relay those friends come through. The formats are in "Game servers" and "Relays" in [specs/PROTOCOL.md](../specs/PROTOCOL.md); what is still to come is in [PLAN.md](../PLAN.md).

| File        | What it is                                                                            |
| ----------- | ------------------------------------------------------------------------------------- |
| `main.js`   | The command line                                                                      |
| `host.js`   | `runGame`: the web server, the sealed process, saved data, sign-in and records        |
| `sealed.js` | Runs inside the seal: turns the host's messages into the calls a game server answers  |
| `play.js`   | For the display: its line to the game server, served at `<base>endlessmind/play.js`   |
| `relay.js`  | `runRelay`: a relay. `dial`: how a game reaches players through one                   |

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
| `--relay`    |                                   | A relay to be reached through; it sets the address       |
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

## Relaying

A game on a computer at home cannot be reached from outside. A relay is a computer that can: the game connects out to it, and the relay gives the game an address of its own and passes players through.

```
deno task run <folder> --relay https://relay.example/
```

A relay for trying this out runs at `https://relay.endlessmind.com/`. The link it prints, `https://<realm ID>.relay.example/`, works for anyone, for as long as this computer stays on and connected. It is the same link every time, since it holds the realm's ID, and the relay gives it only to whoever holds the realm's secret phrase. A relay can read and change what passes through it, so use one you would trust to host the game.

To be a relay:

```
deno task relay --base https://relay.example/
```

| Option       | Default     | What it sets                                         |
| ------------ | ----------- | ---------------------------------------------------- |
| `--base`     |             | The relay's own address: a site's root               |
| `--port`     | `8100`      | The port to listen on                                |
| `--hostname` | `127.0.0.1` | Who can reach it; the default is this computer only  |
| `--games`    | `20`        | How many games it passes at once                     |

The relay speaks plain HTTP, so a web server in front of it must provide HTTPS for the relay's name and for every name under it (`*.relay.example`), and pass both on with the name the player asked for. To try one with no setup, use `--base http://localhost:8100/`: browsers treat every name under `localhost` as this computer. Signing in does not work that way, since an EntryPortal accepts plain `http` only for `localhost` itself.

## The seal

Each game server runs in a process of its own, started with no permissions at all: it cannot open files, use the network, start programs or read anything about the computer. Before it starts, the host checks that every file it imports is inside the game's own folder. It is stopped if it needs more than 64 MB of memory or goes six seconds without answering, and started again when the next player connects. The realm's secret phrase stays with the host, outside the seal. [tests/host_test.js](../tests/host_test.js) tries to break out.

`.data/` holds `realm-secret.txt` (the realm's identity; keep a copy), `realm-data.json` (sign-ins and records) and `game-data.json` (what the game server saved).
