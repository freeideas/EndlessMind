// The host program's command line.
//
//   deno run -A host/main.js run <folder> [--port 8000] [--hostname 127.0.0.1] [--base <address>]
//                                         [--portal <address>] [--data <folder>] [--no-watch]
//
// `run` plays one game on this computer: it prints the address to open, and starts the game server
// again whenever a file in the folder changes. See host/README.md.

import { runGame } from "./host.js";

const [command, folder, ...rest] = Deno.args;
/** @type {Record<string, string>} */
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith("--")) continue;
  const next = rest[i + 1];
  flags[rest[i].slice(2)] = next === undefined || next.startsWith("--") ? "" : rest[++i];
}

if (command !== "run" || !folder) {
  console.error("Usage: run <folder> [--port 8000] [--hostname 127.0.0.1] [--base <address>] [--portal <address>] [--data <folder>] [--no-watch]");
  Deno.exit(2);
}

const running = await runGame({
  folder,
  port: flags.port ? Number(flags.port) : undefined,
  hostname: flags.hostname || undefined,
  base: flags.base || undefined,
  portal: flags.portal || undefined,
  data: flags.data || undefined,
  watch: !("no-watch" in flags),
});
console.log(`Play at ${running.base} (realm ID ${running.realm.id})`);
