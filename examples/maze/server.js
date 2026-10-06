// Endless Maze: an example realm. Run mazes that grow with each level; finishing levels 3, 10, 20 and
// every tenth after that earns a record. Guests can play right away; signing in keeps their progress
// and carries over what they did as a guest.
//
//   deno task maze
//
// Settings, all optional: MAZE_PORT (8000), MAZE_HOSTNAME (127.0.0.1), MAZE_BASE (the public address,
// http://localhost:8000/), MAZE_PORTAL (the EntryPortal its codes name) and MAZE_DATA (folder for its
// files, ./.data/ here).

import { DEFAULT_PORTAL, openRealm } from "../../realm/realm.js";
import { makeMaze, solves } from "./maze.js";

const PORT = Number(Deno.env.get("MAZE_PORT") ?? 8000);
const BASE = Deno.env.get("MAZE_BASE") ?? `http://localhost:${PORT}/`;
const DATA = Deno.env.get("MAZE_DATA") ?? new URL("./.data/", import.meta.url).pathname;
const RUN_MS = 2 * 60 * 60 * 1000; // a run left unfinished this long is forgotten
const FASTEST_MS = 10; // no person moves faster than one step per 10 ms, even holding a key down

/** The levels whose completion earns a record: 3, 10, 20, 30, ... @param {number} level */
const milestone = (level) => level === 3 || (level >= 10 && level % 10 === 0);

await Deno.mkdir(DATA, { recursive: true });
const realm = await openRealm({
  base: BASE,
  portal: Deno.env.get("MAZE_PORTAL") ?? DEFAULT_PORTAL,
  secretFile: DATA + "/realm-secret.txt",
  dataFile: DATA + "/realm-data.json",
  card: {
    name: "Endless Maze",
    description: "Run mazes that grow with every level. Finishing levels 3, 10, 20 and every tenth after earns a record. An example realm for Endless Mind.",
    tags: ["maze", "puzzle", "example"],
  },
});

/**
 * Progress by who is playing: "player:<ID>" or "guest:<random>". `reached` is the highest level they
 * may play; `best` their best time on each level, in milliseconds; `earned` the levels whose records
 * have been offered.
 * @typedef {{ reached: number, best: Record<string, number>, earned?: number[] }} Progress
 */
const FILE = DATA + "/progress.json";
/** @type {Record<string, Progress>} */
let progress = {};
try {
  progress = JSON.parse(await Deno.readTextFile(FILE));
} catch {
  progress = {};
}
const saveProgress = () => Deno.writeTextFile(FILE, JSON.stringify(progress));

/** Runs in play, by a random ID: who started which level, and when. Kept in memory only. */
/** @type {Map<string, { who: string, level: number, started: number }>} */
const runs = new Map();

/**
 * Offer a signed-in player the records for every milestone they have passed and not yet been offered,
 * including ones passed as a guest before signing in.
 * @param {string} player
 * @param {Progress} mine
 */
async function award(player, mine) {
  for (let level = 1; level < mine.reached; level++) {
    if (!milestone(level) || mine.earned?.includes(level)) continue;
    (mine.earned ??= []).push(level);
    await realm.offer(player, [{ text: `Finished the first ${level} mazes in Endless Maze.`, data: { level } }]);
  }
}

/** Who is playing, carrying a guest's progress over once they sign in. @param {Request} request */
async function whoFor(request) {
  const player = await realm.player(request);
  const guest = request.headers.get("cookie")?.match(/(?:^|;\s*)maze_guest=([a-f0-9]+)/)?.[1];
  let setCookie = "";
  let who;
  if (player) {
    who = "player:" + player;
    // No progress kept here (a new server, or lost data)? The records this realm signed with the player
    // still say how far they got.
    const recorded = realm.publicRecords(player).map((r) => Number(r.data?.level) || 0);
    const mine = (progress[who] ??= { reached: Math.max(0, ...recorded) + 1, best: {}, earned: recorded });
    const theirs = guest ? progress["guest:" + guest] : undefined;
    if (theirs) {
      mine.reached = Math.max(mine.reached, theirs.reached);
      for (const [level, ms] of Object.entries(theirs.best)) mine.best[level] = Math.min(mine.best[level] ?? Infinity, ms);
      delete progress["guest:" + guest];
      await award(player, mine);
      await saveProgress();
    }
  } else {
    const id = guest ?? crypto.randomUUID().replaceAll("-", "");
    if (!guest) setCookie = `maze_guest=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
    who = "guest:" + id;
  }
  // A guest who has played nothing yet is not stored, so passing visitors leave nothing behind.
  const mine = progress[who] ?? { reached: 1, best: {} };
  return { player, who, mine, setCookie };
}

/** @param {Request} request */
async function game(request) {
  const url = new URL(request.url);
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/maze.js")) {
    const file = url.pathname === "/" ? "./index.html" : "./maze.js";
    const type = url.pathname === "/" ? "text/html" : "text/javascript";
    return new Response(await Deno.readTextFile(new URL(file, import.meta.url)), {
      headers: { "content-type": `${type}; charset=utf-8` },
    });
  }
  if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });

  const { player, who, mine, setCookie } = await whoFor(request);
  const answer = (/** @type {Record<string, unknown>} */ body, status = 200) =>
    new Response(JSON.stringify({ player, reached: mine.reached, best: mine.best, ...body }), {
      status,
      headers: { "content-type": "application/json", ...(setCookie ? { "set-cookie": setCookie } : {}) },
    });

  if (url.pathname === "/api/state") return answer({});

  if (url.pathname === "/api/start" && request.method === "POST") {
    const { level } = await request.json();
    if (!Number.isInteger(level) || level < 1 || level > mine.reached) return answer({ error: "That level is not open yet." }, 400);
    const now = Date.now();
    for (const [id, run] of runs) if (now - run.started > RUN_MS) runs.delete(id);
    const run = crypto.randomUUID();
    runs.set(run, { who, level, started: now });
    return answer({ run });
  }

  if (url.pathname === "/api/finish" && request.method === "POST") {
    const { run: id, moves } = await request.json();
    const run = runs.get(id);
    if (!run || run.who !== who) return answer({ error: "That run is unknown here. Start the level again." }, 400);
    const ms = Date.now() - run.started;
    if (typeof moves !== "string" || !solves(makeMaze(run.level), moves)) return answer({ error: "Those moves do not reach the exit." }, 400);
    if (ms < moves.length * FASTEST_MS) return answer({ error: "That was faster than anyone can move." }, 400);
    runs.delete(id);
    progress[who] = mine;
    mine.best[run.level] = Math.min(mine.best[run.level] ?? Infinity, ms);
    if (run.level === mine.reached) mine.reached++;
    if (player) await award(player, mine);
    await saveProgress();
    return answer({ level: run.level, ms });
  }
  return new Response("Not found", { status: 404 });
}

Deno.serve(
  { port: PORT, hostname: Deno.env.get("MAZE_HOSTNAME") ?? "127.0.0.1" },
  async (request) => (await realm.handle(request)) ?? game(request),
);
console.log(`Endless Maze: ${BASE} (realm ID ${realm.id})`);
