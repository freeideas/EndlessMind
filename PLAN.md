# Plan

What is being built next, and in what order. This file is temporary: when a step is done, its lasting facts move into [specs/DESIGN.md](specs/DESIGN.md) or [specs/PROTOCOL.md](specs/PROTOCOL.md) and the step is deleted from here.

## The goal

Someone who cannot code, but has an AI coding agent, has an idea for a game. They describe it, play it alone, play it with friends, and release it. After that, people all over the world play it while its maker is asleep with every device switched off. The maker never rents a server.

## The design in short

- **A game server is one sealed file.** It can do nothing except through a small fixed set of calls: player joined, player left, message in, message out, tick, save, load. It is JavaScript, or another language compiled to WebAssembly.
- **Two kinds of realm.** An open realm is a sealed file that any host can run. A tied realm has private server code, or a world too large to lose, and is run by whoever controls its server; it signs its own records with the realm's secret. `realm/` and `realm-py/` are the libraries for tied realms.
- **The same file runs everywhere.** In a tab of the maker's browser, and on any host, unchanged.
- **Making happens in the browser.** One tab runs the server and shows its status, with a link that opens the game in another tab. Friends join by the same link, through a relay. This works while the maker's computer is on.
- **A release is a torrent.** It holds the server file, the display files and the realm card. The maker's realm signs the release's fingerprint once, and the realm's secret can then stay offline.
- **Hosts run releases.** A host fetches the torrent, checks the fingerprint and the maker's proof, and runs the server file with no network, no files, and capped memory and time. Each game gets its own subdomain. The host shares the torrent onward.
- **Hosts sign play records under their own ID,** naming the release. Boards add up play across every host of a release, so the realm earns reputation without its secret being present. A record says who signed and for which realm, so a later version can let a maker permit a trusted host to sign as the realm itself without changing old records.
- **What lasts is what players carry.** An open realm that keeps its lasting progress in players' records moves between hosts freely: a player shows their records and carries on. An open realm with a world of its own (save and load) has a separate world on each host, starting from the beginning. A realm that cannot accept that is a tied realm.
- **The host package gives people a reason to host.** It installs with a package manager, keeps one resident game of the admin's own at the main address, and loads other games on request under rules the admin sets once. It is also a relay, and carries a spare copy of the EntryPortal on a subdomain of its own.
- **A loading request is a record signed by a player.** Hosts accept requests only from players with enough play on record in realms they trust, with limits per player and per game. Games nobody plays are removed.
- **Friends are a new game's first evidence.** Records from play in the maker's browser are what lead others to find the game and ask a host to load it.
- **A review is a note on a play record.** When a player approves a record, they may add any words they like. The note is covered by the player's proof only, so a host cannot change it, and it sits on proof that the player really played. The maker's description is the realm card, which travels in the torrent.
- **Players pick one EntryPortal and stay with it.** The screen that asks for a secret phrase tells the player to check the page with their AI helper first. Setup teaches the rule that matters: being asked for the phrase is rare, and a player who did not start it themselves should stop.
- **Phones play anything; making and hosting need a computer.** Phones pause background tabs, so a server in a phone's tab would stop.

## Steps

### 1. Refurbish the documentation

Rewrite every document so the design above is the only design it mentions, in as few words as it takes. No history, no leanings, no "previously", no alternatives that were dropped. Git keeps the history.

| File                          | What changes                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `specs/DESIGN.md`             | Making, hosting, releases, hosts and reviews become decisions; trim the rest    |
| `specs/PROTOCOL.md`           | Add the server calls, releases, host-signed records, loading requests, reviews  |
| `README.md`                   | "Making realms" tells the story in "The goal"; add a short part for hosts       |
| `AGENTS.md`                   | Layout and conventions match the new folders                                    |
| `realm/`, `realm-py/` READMEs | Say plainly that these are for tied realms                                      |
| `examples/maze/README.md`     | Endless Maze as a sealed server file                                            |
| `portal/README.md`            | The phrase screen's message and the setup rule                                  |
| `deploy/`, `site/` READMEs    | Match whatever is published after the steps below                               |
| `CONTRIBUTING.md`             | Check it still matches                                                          |
| `tmp/monster-game.md`         | Move into the right place or delete                                             |

The specs describe the whole design from the start. The README describes only what a person can do today, and grows as each step below works.

### 2. The server calls, in a browser tab

Define the calls in `specs/PROTOCOL.md`. Move Endless Maze's server onto them and run it in a browser tab, with the status page and the "Play" link. This proves the core idea at the lowest cost.

### 3. The relay

Friends anywhere join a game running in the maker's tab. Direct browser-to-browser connections where possible, with the relay making the introduction.

### 4. The host program

Runs the same server file sealed off, one subdomain per game, with a resident game at the main address. Fetches its own HTTPS certificates. Includes the relay.

### 5. Releases

Signing a release, making the torrent, fetching and checking it on a host, loading on signed request with the admin's rules.

### 6. Records, reviews and boards

Host-signed records and players' notes on them, then a board that counts play per release across hosts and shows which hosts run a game.

### 7. The package

Installable with brew, apt, winget and pacman. Asks three questions: the web address (the admin's own domain, or a free name made from the server's number, such as sslip.io gives), the resident game, the loading rules. Serves the spare EntryPortal.

### 8. The EntryPortal's messages

The check-first message on the phrase screen, and the "being asked is rare" rule at setup. Published as a new version.

## Open questions

Each needs an answer before the step that depends on it.

1. **Which games does a host load?** Suggested: the one with the most wishes per host already running it, so a wanted game with no host comes first. A wish is a record signed by a player ("I want to play release X"), one at a time per player, lasting a week. Hosts pass wishes to each other and count only those from players with play on record in realms they trust, so a crowd of made-up players counts for nothing. The admin sets the number of places and the caps, and can remove or block anything. A game leaves when another has more wishes per host. Needed for step 5.
2. **How do hosts and players find hosts?** Suggested: a host running a release already shares its torrent, so the torrent network's own lookup answers "who has release X?". Each host found that way is asked for its host card (its ID, web address and what it runs, signed by the host), since the lookup itself proves nothing. Hosts also announce themselves under one agreed fingerprint, so a new host finds the others, and each host publishes the list of hosts it knows. Browsers cannot use the torrent lookup, so a player asks any host or board. Needed for step 5.
3. **Do free names made from a server's number work well enough?** To test: whether certificates can be had reliably for such names when many hosts share one naming service, and whether games on one host stay fully apart. Needed for step 4.
