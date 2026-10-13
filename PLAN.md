# Plan

The parts of the design in [specs/DESIGN.md](specs/DESIGN.md) that are not built yet. A step is deleted from this file once it is done. When no steps are left, delete this file and the mentions of it in `README.md` and `AGENTS.md`.

## The goal

Jane, who cannot code, describes a game to her AI coding agent and points it at this repository. The agent writes the game and runs it on her computer, and her friends anywhere join by a link, through a relay. She likes the game, so she rents a cheap server and runs the same program there: it hosts her game with no relay, and without being told it is also a relay and an EntryPortal for others. Someone else likes her game and gives its ID to the same program on their own server, or on their computer at home through a relay. People all over the world play it while Jane sleeps with every device switched off. Players only ever need a browser.

## What works today

- `deno task run <folder>` runs a game on its maker's computer with its game server sealed; with `--relay <address>` friends anywhere join by a link.
- `deno task host --base <address> --game <folder>` on a server keeps that game at the main address, relays for games on other computers, and serves an EntryPortal at `eportal.<name>`. It needs no domain name.
- Identity, signing in, records and the EntryPortal, as in [specs/PROTOCOL.md](specs/PROTOCOL.md).

## Working rules

- **Nobody uses this yet but us.** Nothing needs to stay compatible with what came before: change formats, names and commands freely, and say what is so now in the documents. The example games and the sites on ordinarydata need not keep running while work is under way.
- **Simplify and delete as you go.** One way to do each thing. A file, command, option or document that a step makes unnecessary is removed in that step.
- **Several agents may work from this file at once.** Before starting a step, pull, write your claim on its "Taken by" line, commit and push. Keep to the files the step names where you can, and pull and push often. A step with no claim is free.
- **Every step ends the same way.** `deno task check`, `deno task test` and `deno task browser` pass. The documents describe only what is so now: `specs/PROTOCOL.md` has the exact formats the step introduced, `specs/DESIGN.md` has what it taught and loses each "Not decided yet" question it settled, `README.md` says what a person can now do, and each folder's README matches its files. Then the step is deleted from this file.

## Steps

Steps 1 and 2 are in order. The others do not wait on each other unless they say so.

### 1. Releases

Taken by: the session that wrote this plan (started 2026-10-13).

A game is packed into a release with an ID, and the host program runs a game given only that ID.

- **Packing.** `deno task pack <folder>` makes a release from a game's folder: every file that is not hidden, plus a release note signed by the realm that names each file with its size and fingerprint, the version of the game server's calls, and the realm card's words. The release is described by a torrent file, and its ID is that torrent's ID, so any torrent program can fetch and share it.
- **Fetching.** A host that runs a release serves its files to other hosts, who check every piece against the ID. Fetching from the torrent network itself belongs to step 3.
- **Hosting by ID.** `deno task host` takes release IDs from its admin and runs each at `<realm ID>.<the host's name>`; `deno task run <ID> --relay <address>` does the same at home. The admin gives the IDs; nothing is loaded without being asked.
- **Records.** A host does not have the realm's secret, so it signs under an ID of its own, and its records and the card it shows name the release and the realm (see "Hosts" in the design).

Files: `host/`, `realm/realm.js` (and its copy in `realm-py/`), `specs/`, tests.

### 2. Running strangers' games safely

Taken by:

Needs step 1. A host that runs games it did not write needs: a limit on each game's share of the processor, since today a game is stopped only when it stops answering or takes too much memory; stopping a game that nobody is playing, which needs the host to keep its timer; and the plain statement to the admin, before the first stranger's game loads, that a host is responsible for what it serves.

Files: `host/host.js`, `host/sealed.js`.

### 3. Finding each other

Taken by:

Needs step 1. Hosts find other hosts, a maker at home finds a relay, and a host fetches a release, all without being told an address, in the way torrent programs find each other. Each host publishes a signed card of its own (its ID, its address, what it runs) and the list of hosts it knows. Players in browsers ask any host they know. The suggested design is under "Not decided yet" in the design.

### 4. Loading by demand

Taken by:

Needs step 3. A host loads the most wanted games that too few hosts run, by rules its admin sets once, and removes them when others are wanted more. The suggested design, wishes signed by players, is under "Not decided yet" in the design.

### 5. Notes and boards

Taken by:

A player's own words on a record (a review, a boast), covered only by the player's proof. Then a board that adds up play per release across hosts and shows which hosts run a game. The board needs steps 1 and 3; notes need neither.

Files for notes: the EntryPortal (`deploy/entryportal.js`, a new version in `portal/`), `realm/realm.js` and its copy in `realm-py/`.

### 6. The EntryPortal's messages

Taken by:

The reminder on the screen that takes a phrase, and the "being asked is rare" rule at setup. It also accepts plain `http` for names under `localhost`, as it does for `localhost` itself; `tests/browser/` then runs the whole loop a second time through `deno task host` with a relayed game. Published as a new version.

Files: `deploy/entryportal.js`, `portal/`, `tests/browser/`.

### 7. The package

Taken by:

One download for Mac, Windows and Linux, installable with brew, apt, winget and pacman, so that nobody needs Deno installed first. On a server it asks for the web address and the resident game, and sets up HTTPS, which today means installing Caddy and giving it `host/Caddyfile`. Try it from nothing on a freshly rented server.

### 8. Other languages

Taken by:

Game servers compiled to WebAssembly, under the same seal and the same calls.

### 9. Tidying

Taken by:

Each of these removes something; none waits on another step.

- **One program on ordinarydata.** Replace the `endless-maze` and `endless-relay` units, and the separate certificate and Caddy arrangements in `deploy/`, with one `deno task host`, or stop running them.
- **Drop the `relay` command.** `deno task host` with no game is a relay; remove `runRelay` and the `relay` task once nothing uses them.
- **Old EntryPortal versions.** `portal/` keeps every version ever published. With no players yet, keep only the newest.
- **`realm-py/`.** A second copy of the realm library for tied realms in Python. Decide with the owner whether it earns its upkeep; every change to `realm/realm.js` is made twice.

## Questions to settle first

Each is described under "Not decided yet" in [specs/DESIGN.md](specs/DESIGN.md).

| Question                           | Needed for |
| ---------------------------------- | ---------- |
| How hosts and players find hosts   | Step 3     |
| Which games a host loads by itself | Step 4     |
