// A host's board: the games the known hosts run, with the play on record for each, added up across
// every place that runs it, and the wishes players have made for it. It is built from the host cards
// that finding holds (hosts.js) and from each game's realm card and public list. See "Boards" in
// specs/PROTOCOL.md.
//
//   const board = openBoard({ hosts, realm, games });
//
//   board.handle(request)   answer for the page, its data, or a wish; null for any other request
//   board.refresh()         read the lists that have not been read in the last ten minutes
//   board.games()           the games, most played first, as the board's data holds them
//   board.wishes(trust)     how many wishes each release has from players with play signed by `trust`

import { isId } from "../shared/keys.js";
import { isComplete, validNotes } from "../shared/signed.js";
import { ask, capped, each } from "./hosts.js";
import { isReleaseId } from "./release.js";

const MINUTE = 60 * 1000;
const EVERY = 10 * MINUTE; // a list on another computer is read no more often than this
const WEEK = 7 * 24 * 60 * MINUTE; // how long a wish counts
const AHEAD = 10 * MINUTE; // a wish may be dated this far ahead of this computer's clock
const ROUND_MS = 30 * 1000; // how long one round of reading may take
const MAX_CARD = 128 * 1024; // the longest realm card read
const MAX_LIST = 2 * 1024 * 1024; // the longest public list read
const NOTES = 3; // how many of the newest notes a game shows
const PAGE = new URL("./board.html", import.meta.url);

/**
 * @typedef {import("../realm/realm.js").Realm} Realm
 * @typedef {{ player: string, time: number, key: string, wish?: string, release?: string, note?: string }} Counted
 * One record that counts: who the player is, and what marks it as one record. A wish names a release.
 * @typedef {{ signer: string, realm: string, release: string | null, name: string, description: string, records: Counted[] }} Place
 * One address where a game is played: who signs there, what its realm card says, and its list.
 * @typedef {{ realm: string, release: string, name: string, description: string, hosts: { id: string, address: string, play: string }[], relayed: string[], players: number, records: number, wishes: number, notes: { player: string, text: string, time: number }[] }} Game
 * One release, as the board's data holds it.
 * @typedef {ReturnType<typeof openBoard>} Board
 */

/**
 * @param {{
 *   hosts: import("./hosts.js").Hosts,
 *   realm: Realm,
 *   games: () => Realm[],
 *   now?: () => number,
 * }} options
 * `realm` is the realm at the host's main address, where players sign in to wish. `games` gives the
 * realms of the other games this host runs. Their lists are read where they are kept, with no request.
 */
export function openBoard(options) {
  const { hosts, realm } = options;
  const now = options.now ?? Date.now;
  /** What each address on another computer answered, and when it was asked. @type {Map<string, { at: number, place: Place | null }>} */
  const read = new Map();
  /** Records already checked, so that a list kept here is checked once. @type {WeakMap<object, Counted | null>} */
  const checked = new WeakMap();
  let reads = 0;
  /** @type {Promise<void> | null} */
  let reading = null;
  /** @type {{ stamp: string, games: Game[], wishes: Counted[], played: Map<string, Set<string>> } | null} */
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
          ...(isReleaseId(record.data?.wish) ? { wish: record.data.wish } : {}),
          ...(isReleaseId(record.release) ? { release: record.release } : {}),
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
    return {
      signer,
      realm: isId(card.realm) ? card.realm : signer,
      release: isReleaseId(card.release) ? card.release : null,
      name: String(card.name ?? "").slice(0, 80),
      description: String(card.description ?? "").slice(0, 500),
      records,
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
    const all = await cards();
    const local = here();
    const stamp = [reads, Math.floor(now() / MINUTE), all.map((card) => card.time), [...local.values()].map((one) => one.list().records.length)].join("|");
    if (built?.stamp === stamp) return built;

    /** @type {Place[]} */
    const places = [];
    /** @type {Map<string, Place>} */
    const at = new Map();
    for (const [address, ids] of named(all)) {
      const kept = local.get(address);
      const place = kept ? await check(kept.card, kept.list(), ids) : read.get(address)?.place;
      if (place) places.push(place), at.set(address, place);
    }

    /**
     * @typedef {Game & { who: Set<string>, seen: Set<string> }} Sum a game while it is added up
     * @type {Map<string, Sum>}
     */
    const games = new Map();
    /** @param {string} release @param {string} realmId @param {string} name */
    const game = (release, realmId, name) => {
      const before = games.get(release);
      if (before) return before;
      /** @type {Sum} */
      const made = { realm: realmId, release, name: name.slice(0, 80), description: "", hosts: [], relayed: [], players: 0, records: 0, wishes: 0, notes: [], who: new Set(), seen: new Set() };
      games.set(release, made);
      return made;
    };
    for (const card of all) {
      for (const run of card.runs) {
        const play = hosts.place(card, run.play);
        if (!play) continue;
        const one = game(run.release, run.realm, run.name);
        if (!one.hosts.some((host) => host.id === card.signers[0])) one.hosts.push({ id: card.signers[0], address: card.address, play });
      }
    }
    // A game on its maker's computer says which release it is in its realm card.
    for (const card of all) {
      for (const relayed of card.relays ?? []) {
        const play = hosts.place(card, relayed.play);
        const place = play ? at.get(play) : null;
        if (!play || !place?.release) continue;
        const one = game(place.release, place.realm, place.name);
        if (!one.relayed.includes(play)) one.relayed.push(play);
      }
    }

    /** The players with play on record, by who signed it with them. @type {Map<string, Set<string>>} */
    const played = new Map();
    /** Each player's newest wish. @type {Map<string, Counted>} */
    const newest = new Map();
    for (const place of places) {
      const one = place.release ? games.get(place.release) : null;
      if (one && !one.description) one.description = place.description;
      for (const record of place.records) {
        if (record.wish) {
          if (record.time <= now() + AHEAD && !((newest.get(record.player)?.time ?? -Infinity) >= record.time)) newest.set(record.player, record);
          continue;
        }
        played.set(place.signer, (played.get(place.signer) ?? new Set()).add(record.player));
        if (!one || (record.release && record.release !== one.release) || one.seen.has(record.key)) continue;
        one.seen.add(record.key);
        one.who.add(record.player);
        if (record.note) one.notes.push({ player: record.player, text: record.note, time: record.time });
      }
    }
    const wishes = [...newest.values()].filter((wish) => wish.time > now() - WEEK && games.has(/** @type {string} */ (wish.wish)));
    for (const wish of wishes) /** @type {Game} */ (games.get(/** @type {string} */ (wish.wish))).wishes++;

    const ranked = [...games.values()].map(({ who, seen, notes, ...one }) => ({
      ...one,
      players: who.size,
      records: seen.size,
      notes: notes.sort((a, b) => b.time - a.time).slice(0, NOTES),
    })).sort((a, b) => b.players - a.players || b.records - a.records || b.wishes - a.wishes || (a.name + a.release < b.name + b.release ? -1 : 1));
    return (built = { stamp, games: ranked, wishes, played });
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
    let release = null;
    try {
      release = JSON.parse(await capped(request.body, 1024)).release;
    } catch {
      release = null;
    }
    const wanted = (await build()).games.find((one) => one.release === release);
    if (!wanted) return json({ error: "This board does not list that game." }, 404);
    await realm.offer(player, [{ text: `I want to play ${wanted.name} (release ${wanted.release}).`, data: { wish: wanted.release } }]);
    return json({ ok: true });
  }

  return {
    refresh,
    /** The games, most played first. */
    games: async () => (await build()).games,
    /**
     * How many wishes each release has that count for a host that trusts the IDs in `trust`: those
     * from players who have play on record signed by one of them.
     * @param {Iterable<string>} trust
     */
    async wishes(trust) {
      const { wishes, played } = await build();
      const known = [...trust].map((id) => played.get(id) ?? new Set());
      /** @type {Map<string, number>} */
      const counts = new Map();
      for (const { player, wish } of wishes) {
        if (wish && known.some((players) => players.has(player))) counts.set(wish, (counts.get(wish) ?? 0) + 1);
      }
      return counts;
    },
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
