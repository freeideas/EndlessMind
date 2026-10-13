// The host program's command line.
//
//   deno run -A host/main.js run <folder> [--port 8000] [--hostname 127.0.0.1] [--base <address>]
//                                         [--relay <address>] [--portal <address>] [--data <folder>]
//                                         [--no-watch]
//   deno run -A host/main.js host --base <address> [--game <folder>] [--port 8000] [--hostname 127.0.0.1]
//                                 [--data <folder>] [--portal <address>] [--games 20] [--no-relay]
//                                 [--no-portal]
//   deno run -A host/main.js relay --base <address> [--port 8100] [--hostname 127.0.0.1] [--games 20]
//
// `run` plays one game on this computer: it prints the address to open, and starts the game server
// again whenever a file in the folder changes. With `--relay`, players anywhere can join it. `host`
// is for a computer everyone can reach: it keeps a resident game, relays for games on other computers
// and serves a spare EntryPortal. `relay` only relays. See host/README.md.

import { runGame } from "./host.js";
import { runRelay } from "./relay.js";
import { runHost } from "./hosting.js";

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

if (command === "run" && names.length === 1) {
  const running = await runGame({
    folder: names[0],
    port,
    hostname: flags.hostname || undefined,
    base: flags.base || undefined,
    relay: flags.relay || undefined,
    portal: flags.portal || undefined,
    data: flags.data || undefined,
    watch: !("no-watch" in flags),
  });
  console.log(`Play at ${running.base} (realm ID ${running.realm.id})`);
} else if (command === "host" && names.length === 0 && flags.base) {
  const host = await runHost({
    base: flags.base,
    game: flags.game || undefined,
    port,
    hostname: flags.hostname || undefined,
    data: flags.data || undefined,
    portal: flags.portal || undefined,
    games: flags.games ? Number(flags.games) : undefined,
    relay: !("no-relay" in flags),
    entryPortal: !("no-portal" in flags),
  });
  console.log(`Hosting at ${host.base}`);
  if (host.realm) console.log(`  The game here: ${host.realm.card.name} (realm ID ${host.realm.id})`);
  if (!("no-relay" in flags)) console.log(`  Relaying: a game on another computer joins with --relay ${host.base}`);
  if (host.entryPortal) console.log(`  EntryPortal: ${host.entryPortal}`);
} else if (command === "relay" && names.length === 0 && flags.base) {
  const relay = runRelay({ base: flags.base, port, hostname: flags.hostname || undefined, games: flags.games ? Number(flags.games) : undefined });
  console.log(`Relaying for games at ${relay.base}`);
} else {
  console.error("Usage: run <folder> [--port 8000] [--hostname 127.0.0.1] [--base <address>] [--relay <address>] [--portal <address>] [--data <folder>] [--no-watch]");
  console.error("       host --base <address> [--game <folder>] [--port 8000] [--hostname 127.0.0.1] [--data <folder>] [--portal <address>] [--games 20] [--no-relay] [--no-portal]");
  console.error("       relay --base <address> [--port 8100] [--hostname 127.0.0.1] [--games 20]");
  Deno.exit(2);
}
