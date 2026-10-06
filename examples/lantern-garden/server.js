// Lantern Garden: a tiny example realm. Plant glowing seeds in a night garden; ten seeds earn a record.
// Guests can play right away; signing in keeps the garden and carries over what a guest planted.
//
//   deno task garden
//
// Settings, all optional: GARDEN_PORT (8000), GARDEN_BASE (the public address, http://localhost:8000/),
// GARDEN_PORTAL (the EntryPortal its codes name) and GARDEN_DATA (folder for its files, ./data/ here).

import { DEFAULT_PORTAL, openRealm } from "../../realm/realm.js";

const PORT = Number(Deno.env.get("GARDEN_PORT") ?? 8000);
const BASE = Deno.env.get("GARDEN_BASE") ?? `http://localhost:${PORT}/`;
const DATA = Deno.env.get("GARDEN_DATA") ?? new URL("./data/", import.meta.url).pathname;
const PLOTS = 24;
const GOAL = 10;

await Deno.mkdir(DATA, { recursive: true });
const realm = await openRealm({
  base: BASE,
  portal: Deno.env.get("GARDEN_PORTAL") ?? DEFAULT_PORTAL,
  secretFile: DATA + "/realm-secret.txt",
  dataFile: DATA + "/realm-data.json",
  card: {
    name: "Lantern Garden",
    description: "Plant glowing seeds in a quiet night garden. Ten seeds earn a record. An example realm for Endless Mind.",
    tags: ["garden", "calm", "example"],
  },
});

// Gardens by who planted them: "player:<ID>" or "guest:<random>".
const GARDENS = DATA + "/gardens.json";
/** @type {Record<string, { plots: number[], earned?: boolean }>} */
let gardens = {};
try {
  gardens = JSON.parse(await Deno.readTextFile(GARDENS));
} catch {
  gardens = {};
}
const saveGardens = () => Deno.writeTextFile(GARDENS, JSON.stringify(gardens));

/** The garden for this request, carrying a guest's plots over once they sign in. @param {Request} request */
async function gardenFor(request) {
  const player = await realm.player(request);
  const guest = request.headers.get("cookie")?.match(/(?:^|;\s*)garden_guest=([a-f0-9]+)/)?.[1];
  let setCookie = "";
  let who;
  if (player) {
    who = "player:" + player;
    const mine = (gardens[who] ??= { plots: [] });
    if (guest && gardens["guest:" + guest]) {
      mine.plots = [...new Set([...mine.plots, ...gardens["guest:" + guest].plots])].sort((a, b) => a - b);
      delete gardens["guest:" + guest];
    }
  } else {
    const id = guest ?? crypto.randomUUID().replaceAll("-", "");
    if (!guest) setCookie = `garden_guest=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
    who = "guest:" + id;
  }
  const garden = (gardens[who] ??= { plots: [] });
  await earn(player, garden);
  return { player, garden, setCookie };
}

/**
 * Save, and offer the record once a signed-in player has ten seeds planted.
 * @param {string | null} player
 * @param {{ plots: number[], earned?: boolean }} garden
 */
async function earn(player, garden) {
  if (player && garden.plots.length >= GOAL && !garden.earned) {
    garden.earned = true;
    await realm.offer(player, [{ text: `Planted ${GOAL} lantern seeds in Lantern Garden.`, data: { seeds: GOAL } }]);
  }
  await saveGardens();
}

/** @param {Request} request */
async function game(request) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/") {
    const page = await Deno.readTextFile(new URL("./index.html", import.meta.url));
    return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (url.pathname === "/api/garden") {
    const { player, garden, setCookie } = await gardenFor(request);
    if (request.method === "POST") {
      const { plot } = await request.json();
      if (Number.isInteger(plot) && plot >= 0 && plot < PLOTS && !garden.plots.includes(plot)) {
        garden.plots.push(plot);
        await earn(player, garden);
      }
    }
    const body = JSON.stringify({ player, plots: garden.plots, size: PLOTS, goal: GOAL });
    const headers = { "content-type": "application/json", ...(setCookie ? { "set-cookie": setCookie } : {}) };
    return new Response(body, { headers });
  }
  return new Response("Not found", { status: 404 });
}

Deno.serve({ port: PORT }, async (request) => (await realm.handle(request)) ?? game(request));
console.log(`Lantern Garden: ${BASE} (realm ID ${realm.id})`);
