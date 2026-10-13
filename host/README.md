# The host program

Runs a game: serves its display, keeps its game server sealed, and passes messages between the two. A maker uses it to play a game on their own computer while making it, and to let friends anywhere join. On a server it hosts a game for good, and is a relay and an EntryPortal for others. Hosts find each other, so no command needs another computer's address. The formats are in "Game servers", "Relays", "Hosts" and "Releases" in [specs/PROTOCOL.md](../specs/PROTOCOL.md); what is still to come is in [PLAN.md](../PLAN.md).

| File         | What it is                                                                           |
| ------------ | ------------------------------------------------------------------------------------ |
| `main.js`    | The command line                                                                     |
| `host.js`    | `runGame`: the web server, the sealed process, saved data, sign-in and records       |
| `sealed.js`  | Runs inside the seal: turns the host's messages into the calls a game server answers |
| `play.js`    | For the display: its line to the game server, served at `<base>endlessmind/play.js`  |
| `relay.js`   | `openRelay`: a host's relay. `dial`: how a game reaches players through one          |
| `hosting.js` | `runHost`: one web server for a resident game, releases, a relay and an EntryPortal  |
| `release.js` | Releases: packing a game under an ID, checking one, fetching one from a host         |
| `hosts.js`   | `openHosts`: a host's own card, the hosts it knows, and what each of them runs       |
| `Caddyfile`  | For a server: HTTPS for a host's main name and every name under it                   |

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
| `--relay`    |                                   | Be reached through a relay: one found, or the one named  |
| `--hosts`    | `https://relay.endlessmind.com/`  | Where finding hosts starts, with commas between them     |
| `--portal`   | `https://portal.endlessmind.com/` | The EntryPortal its sign-in codes name                   |
| `--data`     | `.data/` in the game's folder     | Where the realm's secret phrase and saved data are kept  |
| `--store`    | `.endlessmind/`                   | Where releases and the known hosts are kept              |
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

## Releases

A release is one exact version of a game that anyone can host. Its ID is all another host needs.

```
deno task pack <folder>
```

It prints the release's ID. The release is signed with the realm's secret phrase from the folder's `.data/`, and packing the same files again gives the same ID. A host packs its resident game by itself, so `pack` is only for seeing the ID beforehand.

To run someone else's game at home, give its ID in place of a folder; with `--relay`, players anywhere can come:

```
deno task run <release ID> --relay
```

The release is fetched from whichever known host runs it. Everything fetched is checked against the ID, so the host it comes from need not be trusted. The realm's secret is not on this computer, so the game runs under an ID of this computer's own, and its link holds that ID.

The host program keeps releases, the data of the games it runs from them, the hosts it knows and its own secret phrase in `.endlessmind/` in the folder it is started from; `--store` names another place.

## Relaying

A game on a computer at home cannot be reached from outside. A relay is a computer that can: the game connects out to it, and the relay gives the game an address of its own and passes players through.

```
deno task run <folder> --relay
```

It uses the first known host that relays and has room; `--relay https://relay.example/` names one instead. The link it prints, `https://<realm ID>.relay.example/`, works for anyone, for as long as this computer stays on and connected. With the same relay it is the same link every time, since it holds the realm's ID, and the relay gives it only to whoever holds the realm's secret phrase. A relay can read and change what passes through it, so name one you trust if that matters.

A game run this way is packed as it starts, and prints its release's ID. While it is running, any host can fetch that release and run it, given only the ID.

Every host is a relay (see "Hosting" below), unless its admin turns that off.

## Finding hosts

Every host signs a card that says its address, the releases it runs and the games it relays, and hands out the cards of the hosts it knows. The host program reads those lists, starting from the addresses in `--hosts`, and a host sends its own card to every host it learns of, again every hour. A host that stops answering is forgotten within a day.

That is how `--relay` finds a relay and how a release is fetched from its ID alone. `--hosts ""` starts nowhere: the program then knows only the hosts that send it their cards. A game at home has no address of its own, so it only reads.

Anyone can read what a host knows: `https://myvps.example/endlessmind/host.json` is its own card, and `https://myvps.example/endlessmind/hosts.json` the cards of the hosts it knows.

## Hosting

On a computer everyone can reach, such as a rented server, one command does every job:

```
deno task host --base https://myvps.example/ --game <folder>
```

| Name                         | What is there                                                     |
| ---------------------------- | ----------------------------------------------------------------- |
| `myvps.example`              | The game in `<folder>`, the resident game                         |
| `eportal.myvps.example`      | An EntryPortal: the published versions in `portal/`, nothing else |
| `<realm ID>.myvps.example`   | Each release given with `--load`                                  |
| `<ID>.myvps.example`         | Each game on another computer that was run with `--relay`         |

| Option        | Default                           | What it sets                                            |
| ------------- | --------------------------------- | ------------------------------------------------------- |
| `--base`      |                                   | The host's main address: a site's root                  |
| `--game`      |                                   | The resident game's folder; without it, a plain page    |
| `--load`      |                                   | IDs of releases to run, with commas between them        |
| `--hosts`     | `https://relay.endlessmind.com/`  | Where finding hosts starts, with commas between them    |
| `--store`     | `.endlessmind/`                   | Releases, their data, known hosts, the host's secret    |
| `--port`      | `8000`                            | The port to listen on                                   |
| `--hostname`  | `127.0.0.1`                       | Who can reach it; the default is this computer only     |
| `--data`      | `.data/` in the game's folder     | Where the resident game's secret phrase and data are    |
| `--portal`    | `https://portal.endlessmind.com/` | The EntryPortal the resident game's sign-in codes name  |
| `--games`     | `20`                              | How many games it relays at once                        |
| `--no-relay`  |                                   | Do not relay                                            |
| `--no-portal` |                                   | Do not serve an EntryPortal                             |

**Names.** The main name and every name under it must lead to the server. With a domain, that is two DNS records: `myvps.example` and `*.myvps.example`. Without one, a free name made from the server's number works with no setup at all: for the server at `203.0.113.7`, use `--base https://203-0-113-7.sslip.io/`.

**HTTPS.** The host program speaks plain HTTP on this computer only, and [Caddy](Caddyfile) in front of it provides HTTPS: it gets a certificate for each name the first time someone asks for it, after checking with the host program that the name is one of its own. Certificate authorities ration certificates by parent name. For a free name that ration is shared with everyone who uses the naming service; with a domain of one's own, a single certificate for `*.myvps.example` avoids it (see [deploy/README.md](../deploy/README.md) for how the relay at relay.endlessmind.com does that).

**Other people's games.** When it starts, the host prints the ID of its resident game's release. Anyone can host that game by giving the ID to their own: `deno task host --base https://other.example/ --load <release ID>`. A host is responsible for what it serves, like anyone who runs a website; the seal protects the computer, not its owner.

To try a host with no setup, use `--base http://localhost:8000/`: browsers treat every name under `localhost` as this computer. A second one started with `--hosts http://localhost:8000/` finds the first.

## The seal

Each game server runs in a process of its own, started with no permissions at all: it cannot open files, use the network, start programs or read anything about the computer. Before it starts, the host checks that every file it imports is inside the game's own folder. It is stopped if it needs more than 64 MB of memory, goes six seconds without answering, or uses more than half of one processor over thirty seconds, and started again when the next player connects. With nobody playing for a minute it rests; the host keeps its timer and starts it again when the timer is due. The processor's use is not measured on Windows. The realm's secret phrase stays with the host, outside the seal. [tests/host_test.js](../tests/host_test.js) tries to break out.

`.data/` holds `realm-secret.txt` (the realm's identity; keep a copy), `realm-data.json` (sign-ins and records) and `game-data.json` (what the game server saved).
