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

### 1. The server calls, in a browser tab

Define the game server's calls in `specs/PROTOCOL.md`. Move Endless Maze's server onto them and run it in a browser tab, with a page that shows how it is doing and a "Play" link that opens the game in another tab.

Suggested: shape the calls like Durable Objects (a small named server with its own storage, live connections and a timer, that sleeps when nobody is connected). AI coding agents already know that shape well, and a sleeping game costs a host almost nothing. The project depends on no Durable Objects product: celld, the open one, says plainly that it is not safe for running strangers' code, and serves one owner's machines sharing one store.

### 2. The relay

Friends anywhere join a game running in its maker's tab. Direct browser-to-browser connections where possible, with the relay making the introduction.

The game to prove it with is Monster Maze, a fast game for several players at once:

- It starts out looking just like Endless Maze.
- As soon as the player makes one move, the screen vanishes and says "You just fell through a trap door!" Then the game is in 3D.
- Each level holds several players and a monster.
- When the monster eats a player, the player starts again in another part of the maze, with the clock still ticking.
- The monster sees through walls and moves straight toward players, but it is not smart.

### 3. The host program

Runs the same game server file sealed off, with a site of its own for each game and a resident game at the main address. Fetches its own HTTPS certificates. Includes the relay.

### 4. Releases

Signing a release, making the torrent, fetching and checking it on a host, and loading games by the admin's rules.

### 5. Records, notes and boards

Records signed by hosts, players' notes on them, then a board that adds up play per release across hosts and shows which hosts run a game.

### 6. The package

Installable with brew, apt, winget and pacman. Asks three questions: the web address, the resident game, the rules for loading. Serves the spare EntryPortal.

### 7. The EntryPortal's messages

The reminder on the screen that takes a phrase, and the "being asked is rare" rule at setup. Published as a new version.

## Questions to settle first

Each is described under "Not decided yet" in [specs/DESIGN.md](specs/DESIGN.md).

| Question                                          | Needed for |
| ------------------------------------------------- | ---------- |
| The web address of a game in its maker's tab      | Step 2     |
| Whether a host needs a domain name                | Step 3     |
| Which games a host loads                          | Step 4     |
| How hosts and players find hosts                  | Step 4     |
