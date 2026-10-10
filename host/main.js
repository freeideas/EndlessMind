// The host program's command line.
//
//   deno run -A host/main.js run <folder> [--port 8000] [--hostname 127.0.0.1] [--base <address>]
//                                         [--relay <address>] [--portal <address>] [--data <folder>]
//                                         [--no-watch]
//   deno run -A host/main.js relay --base <address> [--port 8100] [--hostname 127.0.0.1] [--games 20]
//
// `run` plays one game on this computer: it prints the address to open, and starts the game server
// again whenever a file in the folder changes. With `--relay`, players anywhere can join it. `relay`
// is the other end of that: it passes players to games on other computers. See host/README.md.

import { runGame } from "./host.js";
import { runRelay } from "./relay.js";

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
} else if (command === "relay" && names.length === 0 && flags.base) {
  const relay = runRelay({ base: flags.base, port, hostname: flags.hostname || undefined, games: flags.games ? Number(flags.games) : undefined });
  console.log(`Relaying for games at ${relay.base}`);
} else {
  console.error("Usage: run <folder> [--port 8000] [--hostname 127.0.0.1] [--base <address>] [--relay <address>] [--portal <address>] [--data <folder>] [--no-watch]");
  console.error("       relay --base <address> [--port 8100] [--hostname 127.0.0.1] [--games 20]");
  Deno.exit(2);
}
