// Finding each other: which hosts are known, and what each one runs. A host signs a card of its own
// (its ID, its address, what it runs) and serves it beside the cards of every host it knows. It learns
// more hosts by reading those lists, and sends its card to each host it learns of. A game at home has
// no address of its own, so it publishes nothing and only reads. See "Hosts" in specs/PROTOCOL.md.
//
//   const hosts = await openHosts({ store, start, address, offers });
//
//   hosts.known()       the cards of the hosts known now
//   hosts.card()        this host's own card, signed, or null for a program with no address
//   hosts.relays()      the addresses of the known hosts that relay
//   hosts.sources(id)   the addresses a release can be fetched from
//   hosts.refresh()     read the known hosts' lists, then send them this host's card
//   hosts.changed()     what this host runs has changed: its card is signed again when next asked for
//   hosts.handle(request)  answer a request for this host's card, its list, or a card sent to it
//   hosts.stop()

import { join } from "node:path";
import { isId, signerFromWords } from "../shared/keys.js";
import { addSignature, canonical, isComplete } from "../shared/signed.js";
import { secretWords } from "../realm/realm.js";

/** Where a host program starts looking unless it is told otherwise. */
export const STARTING_HOSTS = ["https://relay.endlessmind.com/"];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR; // a card is forgotten this long after its time
const AHEAD = 10 * MINUTE; // a card may be dated this far ahead of this computer's clock
const MAX_KNOWN = 1000; // how many hosts are kept
const MAX_CARD = 16 * 1024; // the longest card, as canonical JSON
const MAX_LIST = 4 * 1024 * 1024; // the longest list of known hosts that is read or served
const MAX_REALM_CARD = 128 * 1024; // the longest realm card read from a relayed game
const WAIT_MS = 5000; // how long one host is waited for
const ROUND_MS = 30 * 1000; // how long one round of reading lists may take
const AT_ONCE = 20; // how many hosts are asked at once, and how many sent cards are checked at once
const RELEASE = /^[0-9a-f]{40}$/;
const NAME = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/;
const PRIVATE = /\.(local|localdomain|internal|lan|home|arpa)$/;

/**
 * @typedef {{ realm: string, release: string, name: string, play: string }} Run
 * A release a host runs and hands on: whose it is, its ID, its name, and where it is played.
 * @typedef {{ id: string, play: string }} Relayed
 * A game on another computer that a host relays now.
 * @typedef {{ v: 1, type: "host", signers: string[], time: number, address: string, relay?: true, portal?: string, runs: Run[], relays?: Relayed[], sigs: Record<string, string> }} HostCard
 * `signers` holds the host's ID alone.
 * @typedef {{ relay?: boolean, portal?: string | null, runs: Run[], relays?: Relayed[] }} Offers
 * What a host's card says it does.
 * @typedef {Awaited<ReturnType<typeof openHosts>>} Hosts
 */

/** @param {string} name */
const atHome = (name) => name === "localhost" || name.endsWith(".localhost");

/**
 * A host's address as it is written in a card, or null if it cannot be one: a site's root, public and
 * `https`. With `local`, names under `localhost` count too, over `http` as well.
 * @param {unknown} address @param {boolean} [local]
 */
export function hostAddress(address, local = false) {
  let url;
  try {
    url = new URL(String(address));
  } catch {
    return null;
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
  if (atHome(url.hostname)) return local && (url.protocol === "http:" || url.protocol === "https:") ? url.href : null;
  // A name, never a number: every game on a host is at a name under the host's own.
  return url.protocol === "https:" && NAME.test(url.hostname) && !PRIVATE.test(url.hostname) ? url.href : null;
}

/** Read a body as text, giving up once it is longer than `most` bytes. @param {ReadableStream<Uint8Array> | null} body @param {number} most */
async function capped(body, most) {
  const decoder = new TextDecoder();
  let text = "", size = 0;
  for await (const part of body ?? []) {
    if ((size += part.length) > most) throw new Error("too long");
    text += decoder.decode(part, { stream: true });
  }
  return text + decoder.decode();
}

/** Ask one address, never following it anywhere else, and read its JSON answer. @param {string} address @param {number} most @param {RequestInit} [how] */
async function ask(address, most, how = {}) {
  const stop = new AbortController();
  const slow = setTimeout(() => stop.abort(), WAIT_MS);
  try {
    const answer = await fetch(address, { ...how, redirect: "manual", signal: stop.signal });
    if (answer.status !== 200) {
      await answer.body?.cancel();
      throw new Error(`${address} answered ${answer.status}`);
    }
    return JSON.parse(await capped(answer.body, most));
  } finally {
    clearTimeout(slow);
  }
}

/** Do `work` for each item, a few at a time. @template T @param {Iterable<T>} items @param {(item: T) => Promise<unknown>} work */
async function each(items, work) {
  const waiting = [...items];
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, waiting.length) }, async () => {
    for (let item = waiting.shift(); item !== undefined; item = waiting.shift()) await work(item);
  }));
}

/**
 * @param {{
 *   store: string,
 *   start?: string[],
 *   address?: string,
 *   offers?: () => Offers,
 *   log?: (text: string) => void,
 *   now?: () => number,
 * }} options
 * `store` is the folder where the known hosts are kept, and the host's secret phrase. `start` lists the
 * addresses to begin from; with none, only hosts that send their cards here are ever known. A host
 * gives its own main `address` and `offers`, which says what its card should hold; a program with no
 * address of its own leaves both out and only reads.
 */
export async function openHosts(options) {
  const now = options.now ?? Date.now;
  const log = options.log ?? ((text) => console.log(text));
  const file = join(options.store, "hosts.json");
  const own = options.address ? new URL(options.address).href : null;
  const start = (options.start ?? []).map((address) => {
    const good = hostAddress(address, true);
    if (!good) throw new Error(`${address} cannot be a host's address: that is a site's root over https, such as https://host.example/`);
    return good;
  });
  // Names under localhost are for tests and for trying things at home. A host on the web never asks one.
  const local = [...(own ? [own] : []), ...start].some((address) => atHome(new URL(address).hostname));
  if (own && !hostAddress(own, local)) throw new Error(`${own} cannot be a host's address: that is a site's root over https, such as https://host.example/`);
  if (own) await Deno.mkdir(options.store, { recursive: true });
  const signer = own ? await signerFromWords(await secretWords(join(options.store, "host-secret.txt"))) : null;

  /** The hosts known now, by ID. @type {Map<string, HostCard>} */
  const known = new Map();
  /** @type {HostCard | null} */
  let mine = null;
  let stale = true;
  let learnt = -Infinity;
  /** @type {Promise<void> | null} */
  let learning = null;
  let checking = 0;
  let saving = Promise.resolve();

  /** Whether this is a host card, signed, about a public address, and neither old nor dated ahead. @param {any} card @returns {Promise<boolean>} */
  async function isCard(card) {
    try {
      const { sigs: _, ...body } = card;
      return card.v === 1 && card.type === "host" && Array.isArray(card.signers) && card.signers.length === 1 && isId(card.signers[0]) &&
        Number.isSafeInteger(card.time) && card.time <= now() + AHEAD && card.time > now() - DAY &&
        typeof card.address === "string" && hostAddress(card.address, local) === card.address &&
        (card.relay === undefined || card.relay === true) && (card.portal === undefined || typeof card.portal === "string") &&
        Array.isArray(card.runs) && card.runs.every((/** @type {any} */ run) => isId(run?.realm) && RELEASE.test(run.release) && typeof run.name === "string" && typeof run.play === "string") &&
        (card.relays === undefined || (Array.isArray(card.relays) && card.relays.every((/** @type {any} */ game) => isId(game?.id) && typeof game.play === "string"))) &&
        canonical(body).length <= MAX_CARD && (await isComplete(card));
    } catch {
      return false;
    }
  }

  function forget() {
    for (const [id, card] of known) if (card.time <= now() - DAY) known.delete(id);
  }

  function save() {
    saving = saving.then(async () => {
      await Deno.mkdir(options.store, { recursive: true });
      await Deno.writeTextFile(file + ".new", JSON.stringify({ v: 1, type: "hosts", hosts: [...known.values()] }));
      await Deno.rename(file + ".new", file);
    }).catch((error) => log(`The known hosts could not be saved. ${error instanceof Error ? error.message : error}`));
    return saving;
  }

  /** Keep a card that has been checked. Returns whether it, or a newer one from the same host, is now known. @param {HostCard} card */
  function keep(card) {
    const id = card.signers[0];
    if (id === signer?.id || card.address === own) return false;
    const before = known.get(id);
    if (before && before.time >= card.time) return true;
    // An address belongs to whoever answers there now.
    for (const [other, old] of known) if (old.address === card.address) known.delete(other);
    if (!before && known.size >= MAX_KNOWN) return false;
    known.set(id, card);
    return true;
  }

  /**
   * Ask an address for its own card, and keep it if it is that address's own: this is what shows that
   * a card's signer really is at the address the card names. Never throws.
   * @param {string} address @param {string} [id] the ID the card must be signed by
   * @returns {Promise<HostCard | null>}
   */
  async function look(address, id) {
    try {
      const card = await ask(address + "endlessmind/host.json", 2 * MAX_CARD);
      if (!(await isCard(card)) || card.address !== address || (id && card.signers[0] !== id)) return null;
      return keep(card) ? card : null;
    } catch {
      return null;
    }
  }

  /** Read the list of hosts an address knows: its own card is kept, and the addresses of the rest come back. @param {string} address @returns {Promise<string[]>} */
  async function read(address) {
    try {
      const list = await ask(address + "endlessmind/hosts.json", MAX_LIST);
      const [first, ...rest] = Array.isArray(list?.hosts) ? list.hosts : [];
      if (!(await isCard(first)) || first.address !== address || !keep(first)) return [];
      return rest.map((/** @type {any} */ card) => hostAddress(card?.address, local)).filter((/** @type {string | null} */ named) => named && named !== own);
    } catch {
      return [];
    }
  }

  /** One round of reading: the lists of the hosts known and the starting ones, then of every host those name. */
  async function learn() {
    forget();
    const until = Date.now() + ROUND_MS;
    /** @type {Set<string>} */
    const asked = new Set(own ? [own] : []);
    let next = [...start, ...[...known.values()].map((card) => card.address)];
    while (next.length) {
      const round = [...new Set(next)].filter((address) => !asked.has(address)).slice(0, MAX_KNOWN);
      next = [];
      await each(round, async (address) => {
        asked.add(address);
        if (Date.now() < until && asked.size <= 2 * MAX_KNOWN) next.push(...(await read(address)));
      });
    }
    learnt = now();
    await save();
  }

  /** Make sure the lists were read within the last minute. */
  function fresh() {
    if (now() - learnt < MINUTE) return Promise.resolve();
    return (learning ??= learn().finally(() => (learning = null)));
  }

  /** This host's own card, signed again if what it runs has changed or an hour has passed. @returns {Promise<HostCard | null>} */
  async function card() {
    if (!signer || !own) return null;
    if (mine && !stale && now() - mine.time < HOUR) return mine;
    stale = false;
    const offers = options.offers?.() ?? { runs: [] };
    /** @type {Record<string, any>} */
    const body = {
      v: 1,
      type: "host",
      signers: [signer.id],
      time: Math.max(now(), (mine?.time ?? 0) + 1),
      address: own,
      ...(offers.relay ? { relay: true } : {}),
      ...(offers.portal ? { portal: offers.portal } : {}),
      runs: [...offers.runs],
      ...(offers.relays?.length ? { relays: [...offers.relays] } : {}),
    };
    // A card has a longest length, so a host with a great deal to say names what fits.
    while (canonical(body).length > MAX_CARD) {
      if (body.relays?.length) body.relays.pop();
      else body.runs.pop();
    }
    return (mine = /** @type {HostCard} */ (await addSignature(body, signer)));
  }

  /** Send this host's card to every host known. */
  async function announce() {
    const sent = await card();
    if (!sent) return;
    await each([...known.values()].map((other) => other.address), async (address) => {
      try {
        await ask(address + "endlessmind/hosts", 1024, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sent) });
      } catch {
        // Gone, or it would not have this host: its card is forgotten a day after it was signed.
      }
    });
  }

  /** A host sent its card. @param {Request} request */
  async function receive(request) {
    /** @param {number} status @param {string} said */
    const answer = (status, said) => new Response(JSON.stringify({ ok: status === 200, said }), { status, headers: { "content-type": "application/json; charset=utf-8" } });
    if (checking >= AT_ONCE) return answer(503, "Busy: send it again in a while.");
    checking++;
    try {
      /** @type {any} */
      let sent = null;
      try {
        sent = JSON.parse(await capped(request.body, 2 * MAX_CARD));
      } catch {
        sent = null;
      }
      if (!(await isCard(sent))) return answer(400, "That is not a host's card.");
      const before = known.get(sent.signers[0]);
      const kept = before && before.time >= sent.time && before.address === sent.address ? before : await look(sent.address, sent.signers[0]);
      if (!kept) return answer(400, "The address in that card did not answer with a card signed by the same ID, or there is no room.");
      if (kept !== before) await save();
      return answer(200, "Known.");
    } finally {
      checking--;
    }
  }

  /** @param {unknown} body */
  const json = (body) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-cache" } });

  try {
    for (const kept of JSON.parse(await Deno.readTextFile(file)).hosts) if (await isCard(kept)) keep(kept);
  } catch {
    // Nothing kept yet.
  }

  const hourly = own ? setInterval(() => refresh().catch(() => {}), HOUR) : undefined;

  async function refresh() {
    await fresh();
    await announce();
  }

  return {
    /** This host's ID, or null for a program with no address of its own. */
    id: signer?.id ?? null,
    /** The cards of the hosts known now, each checked: signed by its host, which answered at its address. */
    known() {
      forget();
      return [...known.values()];
    },
    card,
    /** The addresses of the known hosts that relay, after reading their lists if that was not just done. */
    async relays() {
      await fresh();
      return [...known.values()].filter((other) => other.relay).map((other) => other.address);
    },
    /**
     * The addresses a release can be fetched from: the hosts whose cards say they run it or, if none
     * does, the relayed games whose realm cards name it. Whatever they send is checked against the ID.
     * @param {string} id the release's ID
     */
    async sources(id) {
      await fresh();
      const running = [...known.values()].filter((other) => other.runs.some((run) => run.release === id)).map((other) => other.address);
      if (running.length) return running;
      /** @type {string[]} */
      const found = [];
      const games = [...known.values()].flatMap((other) => (other.relays ?? []).map((game) => ({ game, under: "." + new URL(other.address).host })));
      await each(games, async ({ game, under }) => {
        const play = hostAddress(game.play, local);
        // A relay speaks only for the names under its own.
        if (!play || !new URL(play).host.endsWith(under)) return;
        const realmCard = await ask(play + "endlessmind-card.json", MAX_REALM_CARD).catch(() => null);
        if (realmCard?.release === id) found.push(play);
      });
      return found;
    },
    refresh,
    changed() {
      stale = true;
    },
    /**
     * Answer a request that is about finding hosts, or return null for any other.
     * @param {Request} request
     * @returns {Promise<Response> | null}
     */
    handle(request) {
      const path = new URL(request.url).pathname;
      const reads = request.method === "GET" || request.method === "HEAD";
      if (!own || !path.startsWith("/endlessmind/host")) return null;
      if (path === "/endlessmind/host.json" && reads) return card().then(json);
      if (path === "/endlessmind/hosts.json" && reads) {
        return card().then((first) => {
          forget();
          const hosts = [first];
          let size = 0;
          for (const other of known.values()) if ((size += JSON.stringify(other).length) < MAX_LIST / 2) hosts.push(other);
          return json({ v: 1, type: "hosts", hosts });
        });
      }
      if (path === "/endlessmind/hosts" && request.method === "POST") return receive(request);
      return null;
    },
    async stop() {
      clearInterval(hourly);
      await learning?.catch(() => {});
      await saving;
    },
  };
}
