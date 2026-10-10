# Plan

The parts of the design in [specs/DESIGN.md](specs/DESIGN.md) that are not built yet, in the order to build them. A step is deleted from this file once it is done. When no steps are left, delete this file and the mentions of it in `README.md` and `AGENTS.md`.

## The goal

Someone who cannot code, but has an AI coding agent, has an idea for a game. They describe it, play it alone, play it with friends, and release it. After that, people all over the world play it while its maker is asleep with every device switched off. The maker never rents a server.

## Every step ends the same way

The documents are brought up to date so that they describe only what is so now:

- `specs/PROTOCOL.md` gets the exact formats the step introduced.
- `specs/DESIGN.md` gets anything the step taught, and loses each "Not decided yet" question the step settled.
- `README.md` says what a person can now do, in "Making realms" and, once hosting works, in a part for hosts.
- The README of each folder the step touched matches its files.

## Steps

### 1. The relay

Friends anywhere join a game running on its maker's computer. Direct connections between the players and that computer where possible, with the relay making the introduction.

The game to prove it with is Monster Maze, a fast game for several players at once:

- It starts out looking just like Endless Maze.
- As soon as the player makes one move, the screen vanishes and says "You just fell through a trap door!" Then the game is in 3D.
- Each level holds several players and a monster.
- When the monster eats a player, the player starts again in another part of the maze, with the clock still ticking.
- The monster sees through walls and moves straight toward players, but it is not smart.

### 2. Hosting many games

The host program runs one game today. To host for others it needs: several games at once, each on a site of its own; a resident game at the main address; its own HTTPS certificates; a limit on each game's share of the processor, since today a game is stopped only when it stops answering or takes too much memory; and stopping a game that nobody is playing, which needs the host to keep its timer. It also includes the relay.

### 3. Releases

Signing a release, making the torrent, fetching and checking it on a host, and loading games by the admin's rules. A release names the version of the calls its game server was written for.

### 4. Records, notes and boards

Records signed by hosts, players' notes on them, then a board that adds up play per release across hosts and shows which hosts run a game.

### 5. The package

One download for Mac, Windows and Linux, installable with brew, apt, winget and pacman, so that nobody needs Deno installed first. For a host it asks three questions: the web address, the resident game, the rules for loading. Serves the spare EntryPortal.

### 6. The EntryPortal's messages

The reminder on the screen that takes a phrase, and the "being asked is rare" rule at setup. Published as a new version.

### 7. Other languages

Game servers compiled to WebAssembly, under the same seal and the same calls.

## Questions to settle first

Each is described under "Not decided yet" in [specs/DESIGN.md](specs/DESIGN.md).

| Question                                          | Needed for |
| ------------------------------------------------- | ---------- |
| How far a relay must be trusted                   | Step 1     |
| Whether a host needs a domain name                | Step 2     |
| Which games a host loads                          | Step 3     |
| How hosts and players find hosts                  | Step 3     |
