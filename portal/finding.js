// Finding realms through reputation: the actor's own recommendations, the
// actors and realms the actor follows, and suggestions weighed from those.
// There is no global score: each portal works out its own, starting from the
// actor's choices. See "Finding realms" in specs/DESIGN.md.

import { addressOf, isAddress, keyPairFromSecret } from "../shared/crypto.js";
import { open } from "../shared/envelope.js";
import { parseLink } from "../shared/link.js";
import { checkRecommendation, makeRecommendation } from "../shared/recommend.js";
import { held, record } from "./claims.js";
import { lookUp, postRecommendation } from "./realms.js";
import * as store from "./store.js";

/** @typedef {import("../shared/recommend.js").Recommendation} Recommendation */
/** @typedef {{ subject: string, kind: Recommendation["kind"], note?: string, via: string[], record: unknown, time: number }} Mine */
/** @typedef {{ address: string, name: string, servers: string[], since: number }} Followed */

/** Renewed when older than this, so a recommendation lasts while its author still uses the portal. */
const RENEW_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The character's lasting address: the one others follow, and the one its recommendations are signed with.
 * @param {import("./character.js").Character} character
 */
export async function lasting(character) {
  const keys = await keyPairFromSecret(character.secret);
  return { keys, address: await addressOf(keys.publicKey) };
}

/** What this actor has said about a realm or an actor, if anything. @param {string} subject @returns {Promise<Mine | undefined>} */
export function mine(subject) {
  return store.get("mine:" + subject);
}

/** Everything this actor has said. @returns {Promise<Mine[]>} */
export async function allMine() {
  return (await store.list("mine:")).filter(Boolean);
}

/**
 * Recommend a realm or an actor, say it is not for me, or withdraw what was said. It is signed with the
 * character's lasting key and posted to the subject's servers and the chosen one. A recommendation of a
 * realm carries, as proof of playing, the claims that realm signed about this character, and as standing,
 * claims from other realms this character publicly recommends: those links are public already, so showing
 * what those realms said reveals nothing new about where the character has been.
 * @param {import("./character.js").Character} character @param {string} subject
 * @param {{ note?: string, via: string[] } | "not for me" | "withdrawn"} what @param {string[]} servers where to post it
 */
export async function say(character, subject, what, servers) {
  const { keys, address } = await lasting(character);
  const via = typeof what === "object" ? what.via : (await mine(subject))?.via ?? [];
  const claim = await makeRecommendation(keys, subject, typeof what === "object" ? { note: what.note, via } : what);
  const proof = typeof what === "object" ? (await held(subject)).filter((c) => c.to === address).slice(0, 4) : [];
  /** @type {import("../shared/envelope.js").Envelope[]} */
  const standing = [];
  if (typeof what === "object") {
    for (const m of await allMine()) {
      if (m.kind !== "recommend" || m.subject === subject || standing.length >= 4) continue;
      const theirs = (await held(m.subject)).find((c) => c.to === address);
      if (theirs) standing.push(theirs);
    }
  }
  const record = { claim, ...(proof.length ? { proof } : {}), ...(standing.length ? { standing } : {}) };
  const checked = await checkRecommendation(record);
  if (!checked) throw new Error("This recommendation could not be signed.");
  await store.put("mine:" + subject, { subject, kind: checked.kind, note: checked.note, via, record, time: checked.time });
  await post(record, [...via, ...servers]);
  return checked;
}

/** @param {unknown} record @param {string[]} servers */
async function post(record, servers) {
  const results = await Promise.allSettled([...new Set(servers)].slice(0, 8).map((s) => postRecommendation(/** @type {any} */ (record), s)));
  if (results.length && results.every((r) => r.status === "rejected")) throw /** @type {PromiseRejectedResult} */ (results[0]).reason;
}

/**
 * Sign again, and post again, whatever this actor said more than a week ago: a recommendation fades
 * unless its author still means it, and using the portal is taken to mean it.
 * @param {import("./character.js").Character} character @param {string[]} servers
 */
export async function renewMine(character, servers) {
  for (const m of await allMine()) {
    if (Date.now() - m.time < RENEW_AFTER_MS) continue;
    const what = m.kind === "recommend" ? { note: m.note, via: m.via } : m.kind === "notForMe" ? "not for me" : "withdrawn";
    await say(character, m.subject, /** @type {any} */ (what), servers).catch(() => {});
  }
}

/**
 * Add what a backup holds to what is here: whom the character follows, and what it has said. Nothing here
 * is thrown away, and of two things said about one subject the newer stays. Only what the backup's own
 * character signed is taken.
 * @param {unknown} follows @param {unknown} said @param {string} secret  the character's secret from the same backup
 */
export async function restoreFinding(follows, said, secret) {
  const known = new Set((await following()).map((f) => f.address));
  for (const f of Array.isArray(follows) ? follows.slice(0, 1000) : []) {
    if (!isAddress(f?.address) || known.has(f.address)) continue;
    const servers = Array.isArray(f.servers) ? f.servers.filter((/** @type {unknown} */ s) => typeof s === "string") : [];
    await follow(f.address, typeof f.name === "string" ? f.name : "", servers);
  }
  const me = await addressOf((await keyPairFromSecret(secret)).publicKey);
  for (const record of Array.isArray(said) ? said.slice(0, 1000) : []) {
    const r = await checkRecommendation(record) ?? await lapsed(record);
    if (!r || r.author !== me || ((await mine(r.subject))?.time ?? 0) >= r.time) continue;
    await store.put("mine:" + r.subject, { subject: r.subject, kind: r.kind, note: r.note, via: r.via, record: r.record, time: r.time });
  }
}

/**
 * A recommendation that lapsed after the backup was made still says what its author meant. Its signature
 * must hold; it is kept as if signed long ago, so the next renewal signs it again at once.
 * @param {unknown} record
 */
async function lapsed(record) {
  const signed = await open(/** @type {any} */ (record)?.claim);
  if (!signed || signed.kind !== "emind.claim" || !signed.to) return null;
  // Read what it says as if it were still in date; nothing of it is passed on unless signed again.
  const says = /** @type {any} */ (signed.body)?.says;
  const kind = says?.notForMe === true ? "notForMe" : says?.withdrawn === true ? "withdrawn" : says?.recommend ? "recommend" : null;
  if (!kind) return null;
  const via = Array.isArray(says.recommend?.via) ? says.recommend.via.filter((/** @type {unknown} */ v) => typeof v === "string").slice(0, 8) : [];
  const note = typeof says.recommend?.note === "string" ? says.recommend.note.slice(0, 280) : undefined;
  return { author: signed.from, subject: signed.to, kind: /** @type {Mine["kind"]} */ (kind), note, via, record: { claim: signed }, time: 0 };
}

/** @returns {Promise<Followed[]>} */
export async function following() {
  return (await store.list("follow:")).filter(Boolean);
}

/** Follow an actor or a realm: its recommendations then count for this actor. @param {string} address @param {string} name @param {string[]} servers */
export function follow(address, name, servers) {
  return store.put("follow:" + address, { address, name: name.slice(0, 60) || address.slice(0, 16), servers: servers.slice(0, 8), since: Date.now() });
}

/** @param {string} address */
export function unfollow(address) {
  return store.put("follow:" + address, undefined);
}

/**
 * Read an address or a realm link, as pasted by an actor who wants to follow someone.
 * @param {string} text @returns {{ address: string, servers: string[] }}
 */
export function readAddress(text) {
  const t = text.trim();
  if (/^ed25519-[a-z2-7]{52}$/.test(t)) return { address: t, servers: [] };
  const { address, servers } = parseLink(t);
  return { address, servers };
}

/** Recommendations on one server, by author or about a subject. @param {string} server @param {Record<string, string>} query */
async function fetchRecommendations(server, query) {
  try {
    const url = new URL("/recommend", server);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const list = (await response.json()).recommendations;
    const checked = await Promise.all((Array.isArray(list) ? list : []).slice(0, 200).map(checkRecommendation));
    return /** @type {Recommendation[]} */ (checked.filter(Boolean));
  } catch {
    return [];
  }
}

/**
 * @typedef {object} Suggestion
 * @property {string} address
 * @property {number} score
 * @property {string[]} via
 * @property {{ author: string, name: string, note?: string, played: boolean }[]} voices  who recommended it, nearest first
 */

/**
 * Suggestions for this actor, weighed from people and realms they chose to listen to:
 * - the actors and realms the actor follows count fully;
 * - those the followed ones recommend in turn (an actor or a realm can be recommended too) count half;
 * - anyone else on the servers asked counts a tenth, so a crowd of fresh addresses weighs little, or
 *   three tenths when their recommendation carries standing from a realm this actor trusts (one they
 *   follow, recommend, or hold claims from), which takes real time in real realms to earn;
 * - a recommendation that carries proof of playing (claims the realm itself signed about its author)
 *   counts double; "not for me" counts against, but only from those the actor follows and those they
 *   recommend. What the actor said themselves decides: their own "not for me" hides a realm.
 * @param {import("./character.js").Character} character @param {string[]} servers  where to ask
 * @returns {Promise<Suggestion[]>}
 */
export async function suggestions(character, servers) {
  const { address: me } = await lasting(character);
  const followed = await following();
  /** @type {Map<string, { weight: number, name: string }>} */
  const voices = new Map(followed.map((f) => [f.address, { weight: 1, name: f.name }]));
  voices.delete(me);
  const asked = [...new Set([...servers, ...followed.flatMap((f) => f.servers)])].slice(0, 6);
  /** @param {string[]} authors */
  const byAuthors = async (authors) =>
    (await Promise.all(authors.flatMap((author) => asked.map((s) => fetchRecommendations(s, { author }))))).flat();
  const first = await byAuthors([...voices.keys()].slice(0, 30));
  // The second step: actors and realms that those followed recommend, whose own word then counts half.
  for (const r of first) {
    if (r.kind === "recommend" && r.subject !== me && !voices.has(r.subject)) {
      voices.set(r.subject, { weight: 0.5, name: `recommended by ${voices.get(r.author)?.name ?? "someone you follow"}` });
    }
  }
  const second = await byAuthors([...voices].filter(([, v]) => v.weight === 0.5).map(([a]) => a).slice(0, 30));
  const nearby = (await Promise.all(asked.map((s) => fetchRecommendations(s, {})))).flat();
  /** @type {Map<string, Recommendation>} the newest from each author about each subject */
  const all = new Map();
  for (const r of [...first, ...second, ...nearby]) {
    const key = `${r.author}\n${r.subject}`;
    if (r.author !== me && (!all.has(key) || /** @type {Recommendation} */ (all.get(key)).time < r.time)) all.set(key, r);
  }
  const said = new Map((await allMine()).map((m) => [m.subject, m.kind]));
  // Realms this actor trusts: followed, recommended, or ones that have signed claims about this character.
  const trusted = new Set([
    ...followed.map((f) => f.address),
    ...[...said].filter(([, kind]) => kind === "recommend").map(([subject]) => subject),
    ...(await record()).filter((r) => r.list.length).map((r) => r.realm),
  ]);
  /** @type {Map<string, Suggestion>} */
  const out = new Map();
  for (const r of all.values()) {
    if (said.get(r.subject) === "notForMe" || r.subject === me) continue;
    const voice = voices.get(r.author);
    if (r.kind === "notForMe" && !voice) continue;
    if (r.kind === "withdrawn") continue;
    const earned = r.standing.some((c) => trusted.has(c.issuer));
    const weight = (voice?.weight ?? (earned ? 0.3 : 0.1)) * (r.proof.length ? 2 : 1) * (r.kind === "notForMe" ? -1 : 1);
    const s = out.get(r.subject) ?? { address: r.subject, score: 0, via: [], voices: [] };
    s.score += weight;
    if (r.kind === "recommend") {
      s.via = [...new Set([...s.via, ...r.via])].slice(0, 8);
      s.voices.push({ author: r.author, name: voice?.name ?? r.author.slice(0, 16) + "...", ...(r.note ? { note: r.note } : {}), played: r.proof.length > 0 });
    }
    out.set(r.subject, s);
  }
  return [...out.values()]
    .filter((s) => s.score > 0 && s.via.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((s) => ({ ...s, voices: s.voices.sort((a, b) => (voices.get(b.author)?.weight ?? 0) - (voices.get(a.author)?.weight ?? 0)) }));
}

/**
 * The picks of a server's operator, each with what its announcement says.
 * @param {string} server
 */
export async function picks(server) {
  try {
    const response = await fetch(new URL("/picks", server), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { note: "", picks: [] };
    const reply = await response.json();
    /** @type {{ address: string, servers: string[], note?: string }[]} */
    const list = [];
    for (const p of Array.isArray(reply.picks) ? reply.picks.slice(0, 50) : []) {
      try { list.push({ ...parseLink(p.link), ...(typeof p.note === "string" ? { note: p.note.slice(0, 280) } : {}) }); } catch { /* skip */ }
    }
    return { note: typeof reply.note === "string" ? reply.note.slice(0, 280) : "", picks: list };
  } catch {
    return { note: "", picks: [] };
  }
}

/**
 * What a realm's announcement says, from the first of its servers that has it.
 * @param {string} address @param {string[]} servers
 */
export async function describe(address, servers) {
  for (const server of servers.slice(0, 4)) {
    const found = await lookUp(address, server).catch(() => null);
    if (found) return { server, found };
  }
  return null;
}
