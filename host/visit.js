// Visit a realm from a terminal, as a new actor, to check that it works.
//
// Prints each view that differs from the last as one line of JSON. Moves given
// with --act are sent one per second once the first view arrives; with no
// --act and --seconds 0, each line typed on standard input is sent as a move.
//
// Usage: deno task visit "<realm link>" [--name Tester] [--act '{"dir":"up"}']... [--seconds 10]

import { checkAnnouncement, releaseOf } from "../shared/announce.js";
import { generateKeyPair } from "../shared/crypto.js";
import { visit } from "../shared/visitor.js";
import { parseLink } from "../shared/link.js";

export { parseLink };

if (import.meta.main) {
  const link = Deno.args.find((a, i) => !a.startsWith("--") && !Deno.args[i - 1]?.startsWith("--"));
  /** @type {unknown[]} */
  const acts = [];
  let name = "Tester", seconds = 10;
  for (let i = 0; i < Deno.args.length; i++) {
    if (Deno.args[i] === "--name") name = Deno.args[++i];
    else if (Deno.args[i] === "--seconds") seconds = Number(Deno.args[++i]);
    else if (Deno.args[i] === "--act") acts.push(JSON.parse(Deno.args[++i]));
  }
  if (!link) {
    console.error(`Usage: deno task visit "<realm link>" [--name Tester] [--act '{"dir":"up"}']... [--seconds 10]`);
    Deno.exit(2);
  }
  const { address, servers } = parseLink(link);
  const response = await fetch(new URL(`/announce/${address}`, servers[0]));
  const announcement = response.ok ? (await response.json()).announcement : undefined;
  const found = await checkAnnouncement(announcement);
  if (!found) {
    console.error(`${servers[0]} has no current announcement for this realm: nobody is hosting it there.`);
    Deno.exit(1);
  }
  let last = "", started = false;
  const session = await visit({
    servers,
    address: found.referee,
    keys: await generateKeyPair(),
    release: await releaseOf(announcement.body.manifest),
    enterKey: announcement.body.key,
    character: { name, color: "teal" },
    status: (text) => console.error(text),
    onGo: ({ link }) => console.error(`The realm opened a door to ${link}`),
    onView: (view) => {
      const line = JSON.stringify(view);
      if (line !== last) console.log((last = line));
      if (!started) {
        started = true;
        acts.forEach((action, i) => setTimeout(() => session.act(action), 1000 * (i + 1)));
      }
    },
  });
  console.error(`Visiting ${found.manifest.name} as ${name}.`);
  if (seconds === 0 && !acts.length) {
    for await (const chunk of Deno.stdin.readable.pipeThrough(new TextDecoderStream())) {
      for (const line of chunk.split("\n").filter((l) => l.trim())) session.act(JSON.parse(line));
    }
  } else {
    await new Promise((r) => setTimeout(r, 1000 * Math.max(seconds, acts.length + 2)));
  }
  session.stop();
  if (!started) {
    console.error("No view arrived. Is the realm's referee (a hosting tab or the host program) running?");
    Deno.exit(1);
  }
  Deno.exit(0);
}
