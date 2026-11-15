// The host program's command line.
//
//   deno run -A host/main.js run <folder> [--port 8000] [--hostname 127.0.0.1] [--base <address>]
//                                         [--relay [<address>]] [--hosts <address>,...] [--portal <address>]
//                                         [--data <folder>] [--store <folder>] [--no-watch]
//   deno run -A host/main.js run <realm ID> [--relay [<address>]] [--hosts <address>,...] [--store <folder>]
//                                           [--port 8000] [--hostname 127.0.0.1] [--base <address>]
//                                           [--portal <address>]
//   deno run -A host/main.js pack <folder> [--store <folder>] [--data <folder>]
//   deno run -A host/main.js host --base <address> [--game <folder>] [--load <realm ID>,...]
//                                 [--auto <n>] [--trust <ID>,...] [--hosts <address>,...]
//                                 [--store <folder>] [--port 8000] [--hostname 127.0.0.1]
//                                 [--data <folder>] [--portal <address>] [--games 20]
//                                 [--relay-only <ID>,... | --no-relay] [--no-portal]
//   deno run -A host/main.js refuse <ID> [--store <folder>]
//
//   deno run -A host/main.js setup [--base <address>] [--game <folder>] [--yes]
//
// `run` plays one game on this computer: it prints the address to open, and starts the game server
// again whenever a file in the folder changes. With `--relay`, players anywhere can join it, through
// the relay named or one found among the known hosts. Given a realm's ID instead of a folder, it runs
// someone else's game: the newest release of it in the store, or else the newest a known host offers.
// `pack` makes a release from a game's folder and prints its ID. `host` is for a computer everyone can
// reach: it keeps a resident game, runs the newest release of each realm named with `--load`, relays
// for games on other computers, serves a spare EntryPortal and a board of the games the known hosts
// run, counting only players with play on record with it, its resident game, or an ID in `--trust`.
// With `--auto <n>` it also loads the `n` most wished-for games by itself. It relays any game that
// asks, up to `--games` at once, unless `--relay-only` names the only IDs to relay or `--no-relay`
// turns relaying off. `refuse` makes a host on that store never relay an ID again, and drop it at
// once. `--hosts` lists where
// finding other hosts starts; `--hosts ""` means nowhere. `setup` turns a Linux server into such a
// host. See host/README.md.

import { runGame } from "./host.js";
import { runHost } from "./hosting.js";
import { openHosts, STARTING_HOSTS } from "./hosts.js";
import { refuse } from "./relay.js";
import { findRelease, pack } from "./release.js";
import { isId } from "../shared/keys.js";
import { join } from "node:path";

const [command, ...rest] = Deno.args;
/** @type {Record<string, string>} */
const flags = {};
/** @type {string[]} */
const names = [];
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith("--")) {
    names.push(rest[i]);
    continue;
  }
  const next = rest[i + 1];
  flags[rest[i].slice(2)] = next === undefined || next.startsWith("--") ? "" : rest[++i];
}
const port = flags.port ? Number(flags.port) : undefined;
const store = flags.store || ".endlessmind";
/** @param {string | undefined} list */
const listed = (list) => (list ? list.split(",").filter(Boolean) : []);
const start = "hosts" in flags ? listed(flags.hosts) : STARTING_HOSTS;
// `--relay` alone finds a relay among the known hosts.
const relay = "relay" in flags ? flags.relay || true : undefined;

if (command === "run" && names.length === 1 && isId(names[0])) {
  const hosts = await openHosts({ store, start });
  const release = await findRelease({ store, realm: names[0], hosts });
  const running = await runGame({
    release,
    secretFile: join(store, "host-secret.txt"),
    data: join(store, "games", release.realm),
    port,
    hostname: flags.hostname || undefined,
    base: flags.base || undefined,
    relay,
    hosts,
    store: relay ? store : undefined,
    portal: flags.portal || undefined,
  });
  console.log(`Play ${release.note.card.name} at ${running.base} (release ${release.id} of realm ${release.realm}, hosted under ID ${running.realm.id})`);
} else if (command === "pack" && names.length === 1) {
  const release = await pack({ folder: names[0], store, data: flags.data || undefined });
  console.log(`Release ${release.id} of ${release.note.card.name} (realm ID ${release.realm})`);
} else if (command === "run" && names.length === 1) {
  const running = await runGame({
    folder: names[0],
    port,
    hostname: flags.hostname || undefined,
    base: flags.base || undefined,
    relay,
    hosts: await openHosts({ store, start }),
    // A game that players anywhere can reach is packed, so that any host can fetch it and run it.
    store: relay ? store : undefined,
    portal: flags.portal || undefined,
    data: flags.data || undefined,
    watch: !("no-watch" in flags),
  });
  console.log(`Play at ${running.base} (realm ID ${running.realm.id})`);
  if (running.release) console.log(`Others can host it by its realm ID; this is release ${running.release.id}`);
  else if (!relay) console.log("Only this computer can open that address. To let friends anywhere play, run it with --relay and send them the link it prints.");
} else if (command === "refuse" && names.length === 1) {
  await refuse(store, names[0]);
  console.log(`A host using ${store} never relays ${names[0]} again, and drops it within seconds if it relays it now.`);
} else if (command === "host" && names.length === 0 && flags.base) {
  const relaying = !("no-relay" in flags);
  if (listed(flags.load).length || Number(flags.auto) || relaying) {
    console.log("You are responsible for what this host serves, like anyone who runs a website. Other people's games are sealed, which protects this computer, not its owner.");
  }
  if (relaying) {
    console.log(
      `Relaying serves pages from ${"relay-only" in flags ? "the games you named" : "anyone's game"} under your name, unchecked. One page made to trick people, such as a fake sign-in page, could get browsers to block every name of this host. ` +
        "Limit it with --relay-only <ID>,... or --no-relay, and refuse a game for good with `endlessmind refuse <ID>`.",
    );
  }
  const host = await runHost({
    base: flags.base,
    game: flags.game || undefined,
    port,
    hostname: flags.hostname || undefined,
    data: flags.data || undefined,
    portal: flags.portal || undefined,
    games: flags.games ? Number(flags.games) : undefined,
    store,
    load: listed(flags.load),
    auto: flags.auto ? Number(flags.auto) : undefined,
    trust: listed(flags.trust),
    hosts: start,
    relay: !relaying ? false : "relay-only" in flags ? listed(flags["relay-only"]) : true,
    entryPortal: !("no-portal" in flags),
  });
  console.log(`Hosting at ${host.base}`);
  if (host.realm) console.log(`  The game here: ${host.realm.card.name} (realm ID ${host.realm.id}); others can host it by that ID; this is release ${host.release?.id}`);
  for (const game of host.hosted()) console.log(`  ${game.name}: ${game.base} (release ${game.id})`);
  console.log(`  Board: ${host.base}endlessmind/board`);
  if (relaying) console.log(`  Relaying: a game on another computer joins with --relay ${host.base}`);
  if (host.entryPortal) console.log(`  EntryPortal: ${host.entryPortal}`);
  console.log(`  Host ID ${host.hosts.id}; it knows ${host.hosts.known().length} other hosts`);
} else if (command === "setup" && names.length === 0) {
  await (await import("./setup.js")).setup(flags);
} else {
  // Asked for (no command, or help) the usage is the answer; after a mistake it is an error.
  const asked = command === undefined || command === "help" || "help" in flags || command === "--help";
  (asked ? console.log : console.error)([
    "Usage: endlessmind run <folder> [--port 8000] [--hostname 127.0.0.1] [--base <address>] [--relay [<address>]] [--hosts <address>,...] [--portal <address>] [--data <folder>] [--store <folder>] [--no-watch]",
    "       endlessmind run <realm ID> [--relay [<address>]] [--hosts <address>,...] [--store <folder>] [--port 8000] [--hostname 127.0.0.1] [--base <address>] [--portal <address>]",
    "       endlessmind pack <folder> [--store <folder>] [--data <folder>]",
    "       endlessmind host --base <address> [--game <folder>] [--load <realm ID>,...] [--auto <n>] [--trust <ID>,...] [--hosts <address>,...] [--store <folder>] [--port 8000] [--hostname 127.0.0.1] [--data <folder>] [--portal <address>] [--games 20] [--relay-only <ID>,... | --no-relay] [--no-portal]",
    "       endlessmind refuse <ID> [--store <folder>]    (never relay that game again)",
    "       endlessmind setup [--base <address>] [--game <folder>] [--yes]    (a Linux server, as root)",
  ].join("\n"));
  Deno.exit(asked ? 0 : 2);
}
