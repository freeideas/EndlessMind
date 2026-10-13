// The host program's command line.
//
//   deno run -A host/main.js run <folder> [--port 8000] [--hostname 127.0.0.1] [--base <address>]
//                                         [--relay [<address>]] [--hosts <address>,...] [--portal <address>]
//                                         [--data <folder>] [--store <folder>] [--no-watch]
//   deno run -A host/main.js run <release ID> [--relay [<address>]] [--hosts <address>,...] [--store <folder>]
//                                             [--port 8000] [--hostname 127.0.0.1] [--base <address>]
//                                             [--portal <address>]
//   deno run -A host/main.js pack <folder> [--store <folder>] [--data <folder>]
//   deno run -A host/main.js host --base <address> [--game <folder>] [--load <release ID>,...]
//                                 [--auto <n>] [--trust <ID>,...] [--hosts <address>,...]
//                                 [--store <folder>] [--port 8000] [--hostname 127.0.0.1]
//                                 [--data <folder>] [--portal <address>] [--games 20] [--no-relay]
//                                 [--no-portal]
//
//   deno run -A host/main.js setup [--base <address>] [--game <folder>] [--yes]
//
// `run` plays one game on this computer: it prints the address to open, and starts the game server
// again whenever a file in the folder changes. With `--relay`, players anywhere can join it, through
// the relay named or one found among the known hosts. Given a release's ID instead of a folder, it runs
// someone else's game, fetched from whichever known host runs it. `pack` makes a release from a game's
// folder and prints its ID. `host` is for a computer everyone can reach: it keeps a resident game, runs
// releases, relays for games on other computers, serves a spare EntryPortal and a board of the games
// the known hosts run. With `--auto <n>` it also loads the `n` most wished-for games by itself, counting
// the wishes of players with play on record with it, its resident game, or an ID in `--trust`. `--hosts`
// lists where finding other hosts starts; `--hosts ""` means nowhere. `setup` turns a Linux server into
// such a host. See host/README.md.

import { runGame } from "./host.js";
import { runHost } from "./hosting.js";
import { openHosts, STARTING_HOSTS } from "./hosts.js";
import { findRelease, isReleaseId, pack } from "./release.js";
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

if (command === "run" && names.length === 1 && isReleaseId(names[0])) {
  const hosts = await openHosts({ store, start });
  const release = await findRelease({ store, id: names[0], hosts });
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
  if (running.release) console.log(`Others can host it as release ${running.release.id}`);
} else if (command === "host" && names.length === 0 && flags.base) {
  if (listed(flags.load).length || Number(flags.auto) || !("no-relay" in flags)) {
    console.log("You are responsible for what this host serves, like anyone who runs a website. Other people's games are sealed, which protects this computer, not its owner.");
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
    relay: !("no-relay" in flags),
    entryPortal: !("no-portal" in flags),
  });
  console.log(`Hosting at ${host.base}`);
  if (host.realm) console.log(`  The game here: ${host.realm.card.name} (realm ID ${host.realm.id}); others can host it as release ${host.release?.id}`);
  for (const game of host.hosted()) console.log(`  ${game.name}: ${game.base} (release ${game.id})`);
  console.log(`  Board: ${host.base}endlessmind/board`);
  if (!("no-relay" in flags)) console.log("  Relaying: a game on another computer joins with --relay");
  if (host.entryPortal) console.log(`  EntryPortal: ${host.entryPortal}`);
  console.log(`  Host ID ${host.hosts.id}; it knows ${host.hosts.known().length} other hosts`);
} else if (command === "setup" && names.length === 0) {
  await (await import("./setup.js")).setup(flags);
} else {
  console.error("Usage: run <folder> [--port 8000] [--hostname 127.0.0.1] [--base <address>] [--relay [<address>]] [--hosts <address>,...] [--portal <address>] [--data <folder>] [--store <folder>] [--no-watch]");
  console.error("       run <release ID> [--relay [<address>]] [--hosts <address>,...] [--store <folder>] [--port 8000] [--hostname 127.0.0.1] [--base <address>] [--portal <address>]");
  console.error("       pack <folder> [--store <folder>] [--data <folder>]");
  console.error("       host --base <address> [--game <folder>] [--load <release ID>,...] [--auto <n>] [--trust <ID>,...] [--hosts <address>,...] [--store <folder>] [--port 8000] [--hostname 127.0.0.1] [--data <folder>] [--portal <address>] [--games 20] [--no-relay] [--no-portal]");
  console.error("       setup [--base <address>] [--game <folder>] [--yes]    (a Linux server, as root)");
  Deno.exit(2);
}
