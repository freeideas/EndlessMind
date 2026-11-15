// A tied realm for the browser test: a game on its maker's own server, using the realm library on Deno
// directly, with no host program. It asks for the number from the phone at sign-in.
//
//   deno run --allow-read --allow-write --allow-net tests/browser/tied_realm.js <port> <EntryPortal> <data folder>

import { join } from "node:path";
import { openRealm } from "../../realm/realm.js";

const [port, portal, data] = Deno.args;
const base = `http://localhost:${port}/`;
const realm = await openRealm({
  base,
  portal,
  card: { name: "Tied Garden", description: "A realm on its maker's own server, for tests." },
  secretFile: join(data, "realm-secret.txt"),
  dataFile: join(data, "realm-data.json"),
  confirmSignIn: true,
});

const page = `<!doctype html>
<meta charset="utf-8">
<title>Tied Garden</title>
<h1>Tied Garden</h1>
<div id="signin"></div>
<script type="module">
  import { mountSignIn } from "./endlessmind/signin.js";
  mountSignIn(document.querySelector("#signin"));
</script>
`;

Deno.serve({ port: Number(port), onListen: () => console.log(`Play at ${base}`) }, async (request) => {
  const answer = await realm.handle(request);
  if (answer) return answer;
  if (new URL(request.url).pathname === "/") return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
  return new Response("Not found", { status: 404 });
});
