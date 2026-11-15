// A host's board: the realms the known hosts run, each with its releases, the play on record for it
// added up across every place that runs any of them, the wishes players have made for it, and, as a weaker
// number, the players who came there lately (their public visits). Only players the host has reason
// to believe count: those with play on record signed by an ID it trusts. Nothing signed by an ID the realm at
// the host's main address treats as burned counts, whenever it was signed. It is built from the host
// cards that finding holds (hosts.js) and from each game's realm card and public list. See "The board"
// in specs/PROTOCOL.md.
//
//   const board = openBoard({ hosts, realm, games, trust });
//
//   board.handle(request)   answer for the page, its data, or a wish; null for any other request
//   board.refresh()         read the lists that have not been read in the last ten minutes
//   board.games()           the realms, most played first, as the board's data holds them

import { isId } from "../shared/keys.js";
import { isComplete, validNotes, validSigners } from "../shared/signed.js";
import { ask, capped, each } from "./hosts.js";
import { isReleaseId } from "./release.js";

const MINUTE = 60 * 1000;
const EVERY = 10 * MINUTE; // a list on another computer is read no more often than this
const WEEK = 7 * 24 * 60 * MINUTE; // how long a wish or a visit counts
const AHEAD = 10 * MINUTE; // a wish or a visit may be dated this far ahead of this computer's clock
const ROUND_MS = 30 * 1000; // how long one round of reading may take
const MAX_CARD = 128 * 1024; // the longest realm card read
const MAX_LIST = 2 * 1024 * 1024; // the longest public list read
const NOTES = 3; // how many of the newest notes a game shows
const PAGE = new URL("./board.html", import.meta.url);

/**
 * @typedef {import("../realm/realm.js").Realm} Realm
 * @typedef {{ player: string, time: number, key: string, wish?: string, realm?: string, note?: string }} Counted
 * One record that counts: who the player is, and what marks it as one record. A wish names a realm.
 * @typedef {{ player: string, time: number }} Visit
 * One visit that counts: a player's public sign-in note at one of the place's `play` addresses.
 * @typedef {{ signer: string, realm: string, release: string | null, name: string, description: string, records: Counted[], visits: Visit[] }} Place
 * One address where a game is played: who signs there, what its realm card says, and its list.
 * @typedef {{ release: string, time?: number, hosts: { id: string, address: string, play: string }[], relayed: string[] }} Version
 * One release of a realm: when its note says it was made, as a host's card gives it, and where it is played.
 * @typedef {{ realm: string, name: string, description: string, releases: Version[], players: number, records: number, visitors: number, wishes: number, notes: { player: string, text: string, time: number }[] }} Game
 * One realm, as the board's data holds it.
 * @typedef {ReturnType<typeof openBoard>} Board
 */

/**
 * @param {{
 *   hosts: import("./hosts.js").Hosts,
 *   realm: Realm,
 *   games: () => Realm[],
 *   trust: Iterable<string>,
 *   now?: () => number,
 * }} options
 * `realm` is the realm at the host's main address, where players sign in to wish. `games` gives the
 * realms of the other games this host runs. Their lists are read where they are kept, with no request.
 * `trust` holds the IDs whose records make a player count: the host's own, its resident game's, and
 * those its admin named.
 */
export function openBoard(options) {
  const { hosts, realm } = options;
  const trust = [...options.trust];
  const now = options.now ?? Date.now;
  /** What each address on another computer answered, and when it was asked. @type {Map<string, { at: number, place: Place | null }>} */
  const read = new Map();
  /** Records already checked, so that a list kept here is checked once. @type {WeakMap<object, Counted | null>} */
  const checked = new WeakMap();
  /** Sign-in notes already checked for their player's proof. @type {WeakMap<object, boolean>} */
  const signed = new WeakMap();
  let reads = 0;
  /** @type {Promise<void> | null} */
  let reading = null;
  /** @type {{ stamp: string, games: Game[] } | null} */
  let built = null;

  const here = () => new Map([realm, ...options.games()].map((one) => [one.base, one]));

  async function cards() {
    const mine = await hosts.card();
    return [...(mine ? [mine] : []), ...hosts.known()];
  }

  /**
   * Every address the cards name, each with the IDs that may sign there: the host itself, the realm a
   * run names, and the ID in a relayed game's name. A host speaks only for names at or under its own.
   * @param {import("./hosts.js").HostCard[]} all
   */
  function named(all) {
    /** @type {Map<string, Set<string>>} */
    const found = new Map();
    /** @param {string | null} address @param {string} id */
    const allow = (address, id) => address && found.set(address, (found.get(address) ?? new Set()).add(id));
    for (const card of all) {
      const id = card.signers[0];
      allow(card.address, id);
      for (const run of card.runs) {
        allow(hosts.place(card, run.play), id);
        allow(hosts.place(card, run.play), run.realm);
      }
      for (const game of card.relays ?? []) allow(hosts.place(card, game.play), game.id);
    }
    return found;
  }

  /**
   * A record that counts: complete, marked public, and signed by the place's signer and one player.
   * @param {any} record @param {string} signer @returns {Promise<Counted | null>}
   */
  async function count(record, signer) {
    if (!record || typeof record !== "object") return null;
    const before = checked.get(record);
    if (before !== undefined) return before;
    /** @type {Counted | null} */
    let found = null;
    try {
      const ids = record.signers;
      const good = record.v === 1 && record.type === "record" && record.public === true && Array.isArray(ids) && ids.length === 2 &&
        ids.includes(signer) && ids[0] !== ids[1] && Number.isSafeInteger(record.time) && (await isComplete(record));
      if (good) {
        const player = ids.find((/** @type {string} */ id) => id !== signer);
        const note = (await validNotes(record))[player]?.text;
        found = {
          player,
          time: record.time,
          key: record.sigs[signer],
          ...(isId(record.data?.wish) ? { wish: record.data.wish } : {}),
          ...(isId(record.realm) ? { realm: record.realm } : {}),
          ...(note ? { note } : {}),
        };
      }
    } catch {
      found = null;
    }
    checked.set(record, found);
    return found;
  }

  /**
   * A visit that counts: a sign-in note marked public, signed by its player, made at one of the
   * place's `play` addresses. Never play, never a record.
   * @param {any} note @param {string[]} play @returns {Promise<Visit | null>}
   */
  async function visit(note, play) {
    if (!note || typeof note !== "object") return null;
    let good = signed.get(note);
    if (good === undefined) {
      try {
        good = note.v === 1 && note.type === "enter" && isId(note.player) && note.public === true && typeof note.address === "string" &&
          Number.isSafeInteger(note.time) && (await validSigners(note)).includes(note.player);
      } catch {
        good = false;
      }
      signed.set(note, good);
    }
    return good && play.some((address) => note.address.startsWith(address)) ? { player: note.player, time: note.time } : null;
  }

  /**
   * What one address holds, from its realm card and its public list, or null if the card is not signed
   * by an ID that may sign there or the list is not that signer's.
   * @param {any} card @param {any} list @param {Set<string>} ids @returns {Promise<Place | null>}
   */
  async function check(card, list, ids) {
    const signer = card?.signers?.[0];
    if (card?.v !== 1 || card.type !== "card" || card.signers.length !== 1 || !ids.has(signer) || !(await isComplete(card))) return null;
    if (list?.realm !== signer || !Array.isArray(list.records)) return null;
    /** @type {Counted[]} */
    const records = [];
    for (const record of list.records) {
      const one = await count(record, signer);
      if (one) records.push(one);
    }
    const play = Array.isArray(card.play) ? card.play.filter((/** @type {unknown} */ address) => typeof address === "string" && /^https?:\/\/[^/]+\//.test(address)) : [];
    /** @type {Visit[]} */
    const visits = [];
    for (const note of Array.isArray(list.visits) ? list.visits : []) {
      const one = await visit(note, play);
      if (one) visits.push(one);
    }
    return {
      signer,
      realm: isId(card.realm) ? card.realm : signer,
      release: isReleaseId(card.release) ? card.release : null,
      name: String(card.name ?? "").slice(0, 80),
      description: String(card.description ?? "").slice(0, 500),
      records,
      visits,
    };
  }

  /** Ask every address on another computer that has not been asked in the last ten minutes. */
  async function readDue() {
    const wanted = named(await cards());
    const local = here();
    for (const address of read.keys()) if (!wanted.has(address)) read.delete(address);
    const due = [...wanted].filter(([address]) => !local.has(address) && now() - (read.get(address)?.at ?? -Infinity) >= EVERY);
    const until = Date.now() + ROUND_MS;
    await each(due, async ([address, ids]) => {
      if (Date.now() > until) return;
      let place = null;
      try {
        place = await check(await ask(address + "endlessmind-card.json", MAX_CARD), await ask(address + "endlessmind-list.json", MAX_LIST), ids);
      } catch {
        // Gone, or not a realm: nothing there counts until it is asked again.
      }
      read.set(address, { at: now(), place });
    });
    reads++;
  }

  const refresh = () => (reading ??= readDue().finally(() => (reading = null)));

  /** Add everything up. The answer is kept until something it was made from changes. */
  async function build() {
    /** Whether the realm here treats an ID as burned, asked once for each build. @type {Map<string, boolean>} */
    const asked = new Map();
    /** @param {string} id */
    const ghost = async (id) => {
      if (!asked.has(id)) asked.set(id, await realm.isBurned(id));
      return /** @type {boolean} */ (asked.get(id));
    };
    // A card signed by a burned host ID is a ghost, and so is a run of a burned realm.
    /** @type {import("./hosts.js").HostCard[]} */
    const all = [];
    for (const card of await cards()) {
      if (await ghost(card.signers[0])) continue;
      const runs = [];
      for (const run of card.runs) if (!(await ghost(run.realm))) runs.push(run);
      all.push({ ...card, runs });
    }
    const local = here();
    const stamp = [reads, Math.floor(now() / MINUTE), Object.keys(realm.data.burned).length, all.map((card) => card.time), [...local.values()].map((one) => {
      const list = one.list();
      return [list.records.length, list.visits.reduce((sum, note) => sum + (Number(note?.time) || 0), 0)];
    })].join("|");
    if (built?.stamp === stamp) return built;

    /** @type {Place[]} */
    const places = [];
    /** @type {Map<string, Place>} */
    const at = new Map();
    for (const [address, ids] of named(all)) {
      const kept = local.get(address);
      const found = kept ? await check(kept.card, kept.list(), ids) : read.get(address)?.place;
      // Nothing signed by a burned ID counts: not a place whose signer or realm is burned, and not the
      // records or visits of a burned player, whenever they were made.
      if (!found || (await ghost(found.signer)) || (await ghost(found.realm))) continue;
      /** @type {Place} */
      const place = { ...found, records: [], visits: [] };
      for (const record of found.records) if (!(await ghost(record.player))) place.records.push(record);
      for (const seen of found.visits) if (!(await ghost(seen.player))) place.visits.push(seen);
      places.push(place), at.set(address, place);
    }

    /**
     * @typedef {Game & { who: Set<string>, seen: Set<string>, came: Map<string, number>, named: number }} Sum a realm while it is added up
     * @type {Map<string, Sum>}
     */
    const games = new Map();
    /** @param {string} realmId */
    const game = (realmId) => {
      const before = games.get(realmId);
      if (before) return before;
      /** @type {Sum} */
      const made = { realm: realmId, name: "", description: "", releases: [], players: 0, records: 0, visitors: 0, wishes: 0, notes: [], who: new Set(), seen: new Set(), came: new Map(), named: -Infinity };
      games.set(realmId, made);
      return made;
    };
    /** One release of a realm, with the name it goes by if it is the newest yet. @param {Sum} one @param {string} id @param {number | null} time @param {string} name */
    const version = (one, id, time, name) => {
      let found = one.releases.find((release) => release.release === id);
      if (!found) one.releases.push((found = { release: id, hosts: [], relayed: [] }));
      if (time !== null && !((found.time ?? -Infinity) >= time)) found.time = time;
      if ((time ?? -Infinity) >= one.named) [one.name, one.named] = [name.slice(0, 80), time ?? -Infinity];
      return found;
    };
    for (const card of all) {
      for (const run of card.runs) {
        const play = hosts.place(card, run.play);
        if (!play) continue;
        const one = version(game(run.realm), run.release, run.time, run.name);
        if (!one.hosts.some((host) => host.id === card.signers[0])) one.hosts.push({ id: card.signers[0], address: card.address, play });
      }
    }
    // A game on its maker's computer says which release it is in its realm card.
    for (const card of all) {
      for (const relayed of card.relays ?? []) {
        const play = hosts.place(card, relayed.play);
        const place = play ? at.get(play) : null;
        if (!play || !place?.release) continue;
        const one = version(game(place.realm), place.release, null, place.name);
        if (!one.relayed.includes(play)) one.relayed.push(play);
      }
    }
    // The newest release first; one whose time no host's card gives, last.
    for (const one of games.values()) one.releases.sort((a, b) => (b.time ?? -Infinity) - (a.time ?? -Infinity));

    /** The players with play on record signed by an ID this host trusts. @type {Set<string>} */
    const known = new Set();
    /** Each player's newest wish. @type {Map<string, Counted>} */
    const newest = new Map();
    for (const place of places) {
      for (const record of place.records) {
        if (record.wish) {
          if (record.time <= now() + AHEAD && !((newest.get(record.player)?.time ?? -Infinity) >= record.time)) newest.set(record.player, record);
        } else if (trust.includes(place.signer)) known.add(record.player);
      }
    }
    // Only players this host has reason to believe count, wherever they played.
    for (const place of places) {
      const one = games.get(place.realm);
      // The words of the newest release's realm card, or of any if none is the newest's.
      if (one && (!one.description || place.release === one.releases[0]?.release)) one.description = place.description;
      for (const record of place.records) {
        if (record.wish || !known.has(record.player) || !one || (record.realm && record.realm !== one.realm) || one.seen.has(record.key)) continue;
        one.seen.add(record.key);
        one.who.add(record.player);
        if (record.note) one.notes.push({ player: record.player, text: record.note, time: record.time });
      }
      // Each player's newest visit to the realm, from any place where it is played.
      for (const seen of place.visits) {
        if (one && seen.time <= now() + AHEAD && !((one.came.get(seen.player) ?? -Infinity) >= seen.time)) one.came.set(seen.player, seen.time);
      }
    }
    for (const wish of newest.values()) {
      const one = games.get(/** @type {string} */ (wish.wish));
      if (one && known.has(wish.player) && wish.time > now() - WEEK) one.wishes++;
    }
    // Visitors: players who count whose newest visit is less than a week old.
    for (const one of games.values()) {
      for (const [player, time] of one.came) {
        if (known.has(player) && time > now() - WEEK) one.visitors++;
      }
    }

    const ranked = [...games.values()].map(({ who, seen, came: _came, named: _, notes, ...one }) => ({
      ...one,
      players: who.size,
      records: seen.size,
      notes: notes.sort((a, b) => b.time - a.time).slice(0, NOTES),
    })).sort((a, b) =>
      b.players - a.players || b.records - a.records || b.visitors - a.visitors || b.wishes - a.wishes || (a.name + a.realm < b.name + b.realm ? -1 : 1)
    );
    return (built = { stamp, games: ranked });
  }

  /** @param {unknown} body @param {number} [status] */
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-cache" } });

  /** The board's data. The first asker waits for the lists; later ones get what is known while they are read again. */
  async function data() {
    if (reads) refresh().catch(() => {});
    else await refresh();
    const mine = await hosts.card();
    return json({ v: 1, type: "board", host: hosts.id, address: mine?.address, time: now(), games: (await build()).games });
  }

  /** A signed-in player wishes for a game: the realm here offers them the wish, to claim like any record. @param {Request} request */
  async function wish(request) {
    // Browsers send a player's session from the pages of every game at a name under this host's, so
    // only the board's own page may ask.
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(realm.base).origin) return json({ error: "Not from this host's board." }, 403);
    const player = await realm.player(request);
    if (!player) return json({ error: "Sign in first." }, 401);
    let wished = null;
    try {
      wished = JSON.parse(await capped(request.body, 1024)).realm;
    } catch {
      wished = null;
    }
    const wanted = (await build()).games.find((one) => one.realm === wished);
    if (!wanted) return json({ error: "This board does not list that game." }, 404);
    await realm.offer(player, [{ text: `I want to play ${wanted.name} (realm ${wanted.realm}).`, data: { wish: wanted.realm } }]);
    return json({ ok: true });
  }

  return {
    refresh,
    /** The games, most played first. */
    games: async () => (await build()).games,
    /**
     * Answer a request for the board's page, its data or a wish, or return null for any other.
     * @param {Request} request
     * @returns {Promise<Response> | null}
     */
    handle(request) {
      const path = new URL(request.url).pathname;
      const reading = request.method === "GET" || request.method === "HEAD";
      if (path === "/endlessmind/board" && reading) {
        return Deno.readFile(PAGE).then((page) => new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } }));
      }
      if (path === "/endlessmind/board.json" && reading) return data();
      if (path === "/endlessmind/wish" && request.method === "POST") return wish(request);
      return null;
    },
    /** Wait for any reading under way. */
    async stop() {
      await reading?.catch(() => {});
    },
  };
}
