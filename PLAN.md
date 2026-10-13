# Plan

The parts of the design in [specs/DESIGN.md](specs/DESIGN.md) that are not built yet, in the order to build them. A step is deleted from this file once it is done. When no steps are left, delete this file and the mentions of it in `README.md` and `AGENTS.md`.

## The goal

Jane, who cannot code, describes a game to her AI coding agent and points it at this repository. The agent writes the game and runs it on her computer, and her friends anywhere join by a link, through a relay. She likes the game, so she rents a cheap server and runs the same program there: it hosts her game with no relay, and without being told it is also a relay and an EntryPortal for others. Someone else likes her game and gives its ID to the same program on their own server, or on their computer at home through a relay. People all over the world play it while Jane sleeps with every device switched off. Players only ever need a browser.

## Every step ends the same way

The documents are brought up to date so that they describe only what is so now:

- `specs/PROTOCOL.md` gets the exact formats the step introduced.
- `specs/DESIGN.md` gets anything the step taught, and loses each "Not decided yet" question the step settled.
- `README.md` says what a person can now do, in "Making realms" and, once hosting works, in a part for hosts.
- The README of each folder the step touched matches its files.

## Steps

### 1. Is a relay fast enough?

Everything between a player and a game on its maker's computer passes through the relay, so each message crosses the internet twice. [Monster Maze](examples/monster/README.md) is the game to judge that with: it shows the round trip to the game server while it is played. People playing it through a relay decide whether it feels good enough. If it does not, add direct connections between the players and the maker's computer, with the relay making the introduction.

### 2. Releases

A game is packed into a release with an ID, and the host program runs a game given only that ID: on a server, at a name made from its realm's ID, or at home through a relay. This covers signing a release, making the torrent, fetching and checking it, and loading games by the admin's rules. A release names the version of the calls its game server was written for.

Running strangers' games also needs: a limit on each game's share of the processor, since today a game is stopped only when it stops answering or takes too much memory; and stopping a game that nobody is playing, which needs the host to keep its timer.

### 3. Finding each other

Hosts find other hosts, and a maker at home finds a relay, without being told an address, in the way torrent programs find each other. Players in browsers ask any host they know.

### 4. Records, notes and boards

Records signed by hosts, players' notes on them, then a board that adds up play per release across hosts and shows which hosts run a game.

### 5. The package

One download for Mac, Windows and Linux, installable with brew, apt, winget and pacman, so that nobody needs Deno installed first. For a host it asks three questions: the web address, the resident game, the rules for loading. On a server it also sets up HTTPS, which today means installing Caddy and giving it `host/Caddyfile`.

### 6. The EntryPortal's messages

The reminder on the screen that takes a phrase, and the "being asked is rare" rule at setup. It also accepts plain `http` for names under `localhost`, as it does for `localhost` itself, so that `tests/browser/` can run the whole loop through a relay. Published as a new version.

### 7. Other languages

Game servers compiled to WebAssembly, under the same seal and the same calls.

## Questions to settle first

Each is described under "Not decided yet" in [specs/DESIGN.md](specs/DESIGN.md).

| Question                                          | Needed for |
| ------------------------------------------------- | ---------- |
| Which games a host loads                          | Step 2     |
| How hosts and players find hosts                  | Step 3     |
