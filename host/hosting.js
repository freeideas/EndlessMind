// A host: one web server that does every job. At its main address it keeps a resident game; it is a
// relay for games on other computers, each at a name of its own under the main one; and it serves a
// spare EntryPortal at a name that serves nothing else. See host/README.md.
//
//   const host = await runHost({ base: "https://myvps.example/", game: "examples/maze" });
//
//   https://myvps.example/              the resident game
//   https://eportal.myvps.example/      the EntryPortal
//   https://<realm ID>.myvps.example/   each release it runs, and each relayed game
//
// It also hands the releases it runs, its resident game's among them, to any host that asks, and takes
// part in finding: it publishes a card of its own and the hosts it knows (see hosts.js). Under its main
// address it serves a board of the games the known hosts run (see board.js), and it can load the most
// wished-for of them by itself (see demand.js).

import { join } from "node:path";
import { isId } from "../shared/keys.js";
import { DEFAULT_PORTAL, openRealm } from "../realm/realm.js";
import { openBoard } from "./board.js";
import { openDemand } from "./demand.js";
import { openGame } from "./host.js";
import { openHosts } from "./hosts.js";
import { openRelay, page, relayedBase } from "./relay.js";
import { findRelease, serveRelease } from "./release.js";

const PORTAL_NAME = "eportal"; // the EntryPortal's name under the host's own
const PORTAL_FILES = new URL("../portal/", import.meta.url);
const ROUND_MS = 10 * 60 * 1000; // how often a host that loads games by itself chooses again

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
 *   store?: string,
 *   load?: string[],
 *   auto?: number,
 *   trust?: string[],
 *   hosts?: string[],
 *   log?: (text: string) => void,
 *   now?: () => number,
 * }} options
 * `base` is the host's main address, a site's root; every name under it must lead here too. `game` is
 * the resident game's folder, and `data` and `portal` are that game's, as in runGame. `relay` and
 * `entryPortal` are on unless false. `games` is how many games are relayed at once. `load` lists the
 * IDs of releases to run, each fetched from whichever known host runs it unless it is already in
 * `store`, the folder where this host keeps releases, their data, the hosts it knows and its own
 * secret phrase. `auto` is how many more games the host loads by itself, the most wished-for first:
 * none unless given. `trust` lists the IDs of realms and hosts whose records it trusts besides its own,
 * when it decides whose wishes count. `hosts` lists the addresses of the hosts to start finding others
 * from. `now` is the clock the board reads lists by.
 */
export async function runHost(options) {
  const own = new URL(options.base);
  if (own.pathname !== "/" || own.search || own.hash) throw new Error("A host's address is a site's root, such as https://myvps.example/");
  const log = options.log ?? ((text) => console.log(text));
  const portalHost = `${PORTAL_NAME}.${own.host}`;
  const entryPortal = options.entryPortal === false ? null : `${own.protocol}//${portalHost}/`;
  const store = options.store ?? ".endlessmind";
  await Deno.mkdir(store, { recursive: true });
  const auto = options.auto ?? 0;
  if (!Number.isInteger(auto) || auto < 0) throw new Error("How many games a host loads by itself is a whole number, 0 or more.");
  for (const id of options.trust ?? []) if (!isId(id)) throw new Error(`${id} is not the ID of a realm or a host.`);

  const hosts = await openHosts({
    store,
    start: options.hosts,
    address: own.href,
    log,
    offers: () => ({ relay: !!relay, portal: entryPortal, runs: runs(), relays: games().map((id) => ({ id, play: relayedBase(own.href, id) })) }),
  });

  /** The releases run here, by the ID of each one's realm. @type {Map<string, { release: import("./release.js").Release, game: Awaited<ReturnType<typeof openGame>> }>} */
  const hosted = new Map();
  /** Run a release at the name made from its realm's ID, in place of any other release of that realm. @param {import("./release.js").Release} release */
  async function open(release) {
    await close(release.realm);
    const game = await openGame({
      release,
      base: `${own.protocol}//${release.realm}.${own.host}/`,
      data: join(store, "games", release.realm),
      secretFile: join(store, "host-secret.txt"),
      portal: options.portal,
      log,
    });
    hosted.set(release.realm, { release, game });
    hosts.changed();
  }
  /** Stop the release run at a realm's name, if there is one. @param {string} realm */
  async function close(realm) {
    const running = hosted.get(realm);
    if (!hosted.delete(realm)) return;
    hosts.changed();
    await running?.game.stop();
  }
  /** The releases the admin named, which run whatever is wished. @type {string[]} */
  const named = [];
  for (const id of options.load ?? []) {
    const release = await findRelease({ store, id, hosts });
    await open(release);
    named.push(release.id);
  }

  const relay = options.relay === false ? null : openRelay({ base: own.href, games: options.games, taken: (id) => hosted.has(id), changed: hosts.changed, log });
  // The resident game is packed as it starts, so that others can host it from its ID.
  const resident = options.game ? await openGame({ folder: options.game, base: own.href, data: options.data, portal: options.portal, store, log }) : null;

  /** What this host's card says it runs: the resident game, then each release. @returns {import("./hosts.js").Run[]} */
  const runs = () => [
    ...(resident?.release ? [{ realm: resident.realm.id, release: resident.release.id, name: resident.realm.card.name, play: own.href }] : []),
    ...[...hosted.values()].map(({ release, game }) => ({ realm: release.realm, release: release.id, name: release.note.card.name, play: game.base })),
  ];
  const games = () => relay?.games() ?? [];

  // Players sign in at the main address to wish for a game: in the resident game's realm or, with no
  // resident game, in a realm the host opens there under its own ID.
  const lobby = resident ? null : await openRealm({
    base: own.href,
    portal: options.portal ?? DEFAULT_PORTAL,
    secretFile: join(store, "host-secret.txt"),
    dataFile: join(store, "host-realm-data.json"),
    card: { name: own.host, description: "An Endless Mind host: it runs games for anyone to play." },
  });
  const board = openBoard({ hosts, realm: resident?.realm ?? /** @type {import("../realm/realm.js").Realm} */ (lobby), games: () => [...hosted.values()].map(({ game }) => game.realm), now: options.now });
  const demand = await openDemand({
    store,
    auto,
    trust: [/** @type {string} */ (hosts.id), ...(resident ? [resident.realm.id] : []), ...(options.trust ?? [])],
    board,
    hosts,
    fixed: () => [...named, ...(resident?.release ? [resident.release.id] : [])],
    taken: (realm) => hosted.has(realm) || games().includes(realm),
    open,
    close: (release) => close(release.realm),
    log,
  });

  const server = Deno.serve({ port: options.port ?? 8000, hostname: options.hostname ?? "127.0.0.1", onListen() {} }, (request) => {
    const host = (request.headers.get("host") ?? "").toLowerCase();
    // The web server in front asks, at this computer's own address, whether a name is one of this
    // host's before it gets a certificate for it.
    if (host !== own.host && !host.endsWith("." + own.host)) {
      const url = new URL(request.url);
      if (url.pathname !== "/endlessmind/known") return new Response("Not found", { status: 404 });
      const name = (url.searchParams.get("domain") ?? "").toLowerCase();
      const under = name.endsWith("." + own.hostname) ? name.slice(0, -own.hostname.length - 1) : "";
      const known = name === own.hostname || (entryPortal && under === PORTAL_NAME) || hosted.has(under) || games().includes(under);
      return new Response(known ? "yes" : "no", { status: known ? 200 : 404 });
    }
    // The EntryPortal's name comes first, so that nothing else can ever answer there.
    if (host === portalHost) return entryPortal ? portalFile(request) : new Response("Not found", { status: 404 });
    const game = host === own.host ? null : hosted.get(host.slice(0, -own.host.length - 1));
    if (game) return game.game.handle(request);
    const relayed = relay?.handle(request);
    if (relayed) return relayed;
    if (host !== own.host) return page("Nothing is at this name", "This host has no game here.", 404);
    const finding = hosts.handle(request) ?? board.handle(request);
    if (finding) return finding;
    if (new URL(request.url).pathname.startsWith("/endlessmind/release/")) {
      return serveRelease(store, runs().map((run) => run.release), request).then((answer) => answer ?? new Response("Not found", { status: 404 }));
    }
    if (resident) return resident.handle(request);
    return /** @type {import("../realm/realm.js").Realm} */ (lobby).handle(request).then((answer) => {
      if (answer) return answer;
      if (new URL(request.url).pathname !== "/") return new Response("Not found", { status: 404 });
      return page("An Endless Mind host", `This computer runs games for anyone to play. <a href="endlessmind/board">See the games</a>.`, 200);
    });
  });

  // Now that this host answers at its address, the hosts it knows are told of it.
  await hosts.refresh();

  /** Choose again which games to run by demand, and tell the known hosts if that changed. */
  async function round() {
    if (await demand.round()) await hosts.refresh();
  }
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let next;
  let stopped = false;
  /** Choose now, then again in ten minutes and a little: hosts that all chose at one moment would all choose alike. */
  async function rounds() {
    await round().catch((error) => log(`This round of choosing games did not finish. ${error instanceof Error ? error.message : error}`));
    if (!stopped) next = setTimeout(rounds, ROUND_MS * (1 + Math.random() / 10));
  }
  if (auto > 0 || demand.loaded().length) await rounds();

  return {
    base: own.href,
    /** The resident game's realm, if there is one. */
    realm: resident?.realm ?? null,
    /** The resident game's release, which others can host from its ID. */
    release: resident?.release ?? null,
    /** Finding: this host's own card, and the hosts it knows. See hosts.js. */
    hosts,
    /** The board: the games the known hosts run, and the play and wishes on record for each. See board.js. */
    board,
    /** Choose again which games to run by demand. */
    round,
    /** The IDs of the releases this host loaded by itself. */
    loaded: demand.loaded,
    /** The releases run here: each one's ID, its realm, and where it is played. */
    hosted: () => [...hosted.values()].map(({ release, game }) => ({ id: release.id, realm: release.realm, name: release.note.card.name, base: game.base })),
    /** The address of the EntryPortal served here, or null. */
    entryPortal,
    /** The IDs of the realms relayed now. */
    games,
    async stop() {
      stopped = true;
      clearTimeout(next);
      await demand.stop();
      await board.stop();
      await hosts.stop();
      relay?.stop();
      await resident?.stop();
      for (const { game } of hosted.values()) await game.stop();
      await server.shutdown();
    },
  };
}
