// A host: one web server that does every job. At its main address it keeps a resident game; it is a
// relay for games on other computers, each at a name of its own under the main one; and it serves a
// spare EntryPortal at a name that serves nothing else. See host/README.md.
//
//   const host = await runHost({ base: "https://myvps.example/", game: "examples/maze" });
//
//   https://myvps.example/              the resident game
//   https://eportal.myvps.example/      the EntryPortal
//   https://<realm ID>.myvps.example/   each relayed game

import { openGame } from "./host.js";
import { openRelay, page } from "./relay.js";

const PORTAL_NAME = "eportal"; // the EntryPortal's name under the host's own
const PORTAL_FILES = new URL("../portal/", import.meta.url);

/**
 * The EntryPortal's published files, exactly as they are in portal/: the page that forwards to the
 * newest version, and each version with its fingerprints. Nothing else is ever served at its name,
 * since any other page there could use the keys players keep with it.
 * @param {Request} request
 */
async function portalFile(request) {
  const m = new URL(request.url).pathname.match(/^\/(v[0-9]+\.[0-9]+)?(\/?)(index\.html|SHA256SUMS)?$/);
  const get = request.method === "GET" || request.method === "HEAD";
  if (!m || !get || (m[1] && !m[2])) return new Response("Not found", { status: 404 });
  const name = (m[1] ? m[1] + "/" : "") + (m[3] ?? "index.html");
  try {
    return new Response(await Deno.readFile(new URL(name, PORTAL_FILES)), {
      headers: {
        "content-type": name.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
        "cache-control": "no-cache",
        // No other page may show this one inside itself.
        "content-security-policy": "frame-ancestors 'none'",
        "x-frame-options": "DENY",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

/**
 * @param {{
 *   base: string,
 *   game?: string,
 *   port?: number,
 *   hostname?: string,
 *   data?: string,
 *   portal?: string,
 *   relay?: boolean,
 *   entryPortal?: boolean,
 *   games?: number,
 *   log?: (text: string) => void,
 * }} options
 * `base` is the host's main address, a site's root; every name under it must lead here too. `game` is
 * the resident game's folder, and `data` and `portal` are that game's, as in runGame. `relay` and
 * `entryPortal` are on unless false. `games` is how many games are relayed at once.
 */
export async function runHost(options) {
  const own = new URL(options.base);
  if (own.pathname !== "/" || own.search || own.hash) throw new Error("A host's address is a site's root, such as https://myvps.example/");
  const log = options.log ?? ((text) => console.log(text));
  const portalHost = `${PORTAL_NAME}.${own.host}`;
  const entryPortal = options.entryPortal === false ? null : `${own.protocol}//${portalHost}/`;
  const relay = options.relay === false ? null : openRelay({ base: own.href, games: options.games, log });
  const resident = options.game ? await openGame({ folder: options.game, base: own.href, data: options.data, portal: options.portal, log }) : null;

  const games = () => relay?.games() ?? [];

  const server = Deno.serve({ port: options.port ?? 8000, hostname: options.hostname ?? "127.0.0.1", onListen() {} }, (request) => {
    const host = (request.headers.get("host") ?? "").toLowerCase();
    // The web server in front asks, at this computer's own address, whether a name is one of this
    // host's before it gets a certificate for it.
    if (host !== own.host && !host.endsWith("." + own.host)) {
      const url = new URL(request.url);
      if (url.pathname !== "/endlessmind/known") return new Response("Not found", { status: 404 });
      const name = (url.searchParams.get("domain") ?? "").toLowerCase();
      const known = name === own.hostname || (entryPortal && name === `${PORTAL_NAME}.${own.hostname}`) ||
        (name.endsWith("." + own.hostname) && games().includes(name.slice(0, -own.hostname.length - 1)));
      return new Response(known ? "yes" : "no", { status: known ? 200 : 404 });
    }
    // The EntryPortal's name comes first, so that nothing else can ever answer there.
    if (host === portalHost) return entryPortal ? portalFile(request) : new Response("Not found", { status: 404 });
    const relayed = relay?.handle(request);
    if (relayed) return relayed;
    if (host !== own.host) return page("Nothing is at this name", "This host has no game here.", 404);
    if (resident) return resident.handle(request);
    if (new URL(request.url).pathname !== "/") return new Response("Not found", { status: 404 });
    return page("An Endless Mind host", "This computer runs games for anyone to play.", 200);
  });

  return {
    base: own.href,
    /** The resident game's realm, if there is one. */
    realm: resident?.realm ?? null,
    /** The address of the EntryPortal served here, or null. */
    entryPortal,
    /** The IDs of the realms relayed now. */
    games,
    async stop() {
      relay?.stop();
      await resident?.stop();
      await server.shutdown();
    },
  };
}
