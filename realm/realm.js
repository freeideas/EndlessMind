// The realm library: everything a realm on Deno needs for Endless Mind sign-in, records, its realm card
// and its public list. See specs/PROTOCOL.md for the formats and realm/README.md for how to use it.
//
//   const realm = await openRealm({ base: "https://example.org/", card: { name: "...", description: "..." } });
//   Deno.serve(async (request) => (await realm.handle(request)) ?? myGame(request));
//
// Inside the game, `realm.player(request)` is the signed-in player's ID (or null for a guest), and
// `realm.offer(player, [{ text }])` proposes records for the player to claim. The page includes
// `<base>endlessmind/signin.js`, which draws the sign-in and claim boxes.

import { checkWords, fromBase64url, hex, isId, newWords, signerFromPrivateKey, signerFromWords } from "../shared/keys.js";
import { addSignature, canonical, isComplete, signedBytes, validSigners } from "../shared/signed.js";
import { qrSvg } from "../shared/qr.js";
import { defaultName, tidyName } from "../shared/names.js";

const JOIN_MS = 2 * 60 * 1000; // a join code works once, for two minutes
const CLOCK_MS = 2 * 60 * 1000; // how far a sign-in note's time may be from this realm's clock
const CLAIM_MS = 10 * 60 * 1000; // a claim code works until its records come back, for ten minutes
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SIGNED = 16 * 1024;
const MAX_BODY = 256 * 1024;
const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0, 1, I or O, which are easy to mistype
const COOKIE = "endlessmind";

/**
 * @typedef {{ name: string, description: string, picture?: string, tags?: string[] }} CardText
 * @typedef {{ load(): Promise<any>, save(data: any): Promise<void> }} Store
 * @typedef {{
 *   base: string,
 *   card: CardText,
 *   portal?: string,
 *   secretFile?: string,
 *   dataFile?: string,
 *   words?: string,
 *   store?: Store,
 *   now?: () => number,
 *   isBurned?: (id: string) => boolean | Promise<boolean>,
 *   onRecord?: (record: any) => void,
 * }} RealmOptions
 * `base` is the realm's public address, ending in "/"; the realm answers under it. `portal` is the
 * EntryPortal its sign-in codes name. The realm's secret phrase is `words`, or is kept in `secretFile`
 * (made on first run). What it must remember is kept in `dataFile`, or in `store`.
 */

export const DEFAULT_PORTAL = "https://portal.endlessmind.com/"; // forwards to the newest version

/** @param {RealmOptions} options */
export async function openRealm(options) {
  // A game keeps its data in .data/ inside its own folder; web servers that refuse names starting with
  // a dot never serve it.
  const usesDefault = (!options.words && !options.secretFile) || (!options.store && !options.dataFile);
  if (usesDefault) await Deno.mkdir(".data", { recursive: true });
  const words = options.words ?? (await secretWords(options.secretFile ?? ".data/realm-secret.txt"));
  const signer = await signerFromWords(words);
  const store = options.store ?? fileStore(options.dataFile ?? ".data/realm-data.json");
  const realm = new Realm(options, signer, store, (await store.load()) ?? {});
  await realm.signCard();
  return realm;
}

export class Realm {
  /** @type {Map<string, { token: string, created: number, player?: string, taken?: boolean }>} */
  #joins = new Map();
  /** @type {Map<string, { token: string, created: number, player: string, records: any[], done?: number, restore?: boolean }>} */
  #claims = new Map();
  /** @type {Map<string, number>} sign-in note nonces seen recently, with when they can be forgotten */
  #nonces = new Map();
  #saving = Promise.resolve();
  /** @type {any} */
  card = null;

  /**
   * @param {RealmOptions} options
   * @param {import("../shared/keys.js").Signer} signer
   * @param {Store} store
   * @param {any} data
   */
  constructor(options, signer, store, data) {
    if (!options.base.endsWith("/")) throw new Error("base must end with /");
    this.options = options;
    this.base = new URL(options.base).href;
    this.basePath = new URL(options.base).pathname;
    this.portal = options.portal ?? DEFAULT_PORTAL;
    this.signer = signer;
    this.id = signer.id;
    this.store = store;
    this.now = options.now ?? Date.now;
    /** @type {{ sessions: Record<string, { player: string, created: number }>, offers: Record<string, any[]>, public: any[], records: any[], burned: Record<string, any>, players: Record<string, { portal?: string, name?: string, seen: number }> }} */
    this.data = { sessions: {}, offers: {}, public: [], records: [], burned: {}, players: {}, ...data };
  }

  /** Sign a fresh realm card. */
  async signCard() {
    const { name, description, picture, tags } = this.options.card;
    const card = {
      v: 1,
      type: "card",
      signers: [this.id],
      time: this.now(),
      name,
      description,
      ...(picture ? { picture } : {}),
      ...(tags ? { tags } : {}),
      play: [this.base],
      list: this.base + "endlessmind-list.json",
    };
    this.card = await addSignature(card, this.signer);
  }

  /** The realm's public list: its complete records marked public. */
  list() {
    return { v: 1, type: "list", realm: this.id, records: this.data.public };
  }

  /**
   * Answer the requests this library owns, or return null to let the game answer.
   * @param {Request} request
   * @returns {Promise<Response | null>}
   */
  async handle(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(this.basePath)) return null;
    const path = url.pathname.slice(this.basePath.length);
    const get = request.method === "GET" || request.method === "HEAD";
    const post = request.method === "POST";
    if (get && path === "endlessmind-card.json") return json(this.card, 200, { "access-control-allow-origin": "*" });
    if (get && path === "endlessmind-list.json") return json(this.list(), 200, { "access-control-allow-origin": "*" });
    if (get && path === "endlessmind/signin.js") {
      const code = await Deno.readTextFile(new URL("./signin.js", import.meta.url));
      return new Response(code, { headers: { "content-type": "text/javascript; charset=utf-8" } });
    }
    if (get && path === "endlessmind/me") return json(await this.#me(request));
    if (post && path === "endlessmind/start") return json(await this.#startJoin(request, url.searchParams.has("rename")));
    if (post && path === "endlessmind/claim") return this.#startClaim(request);
    if (post && path === "endlessmind/restore") return this.#startRestore(request);
    if (post && path === "endlessmind/signout") return this.#signOut(request);
    let m = path.match(/^endlessmind\/wait\/([A-Za-z0-9]+)$/);
    if (get && m) return this.#wait(m[1].toUpperCase(), url.searchParams.get("token") ?? "");
    m = path.match(/^join\/([A-Za-z0-9]+)$/);
    if (get && m) return redirect(this.#portalLink(this.joinAddress(m[1].toUpperCase())));
    if (post && m) return this.#joinPost(m[1].toUpperCase(), request);
    m = path.match(/^claim\/([A-Za-z0-9]+)$/);
    if (get && m) return this.#claimGet(m[1].toUpperCase());
    if (post && m) return this.#claimPost(m[1].toUpperCase(), request);
    return null;
  }

  /**
   * The signed-in player's ID, or null for a guest.
   * @param {Request} request
   */
  async player(request) {
    const session = this.data.sessions[cookie(request, COOKIE) ?? ""];
    if (!session || this.now() - session.created > SESSION_MS) return null;
    if (await this.isBurned(session.player)) return null;
    return session.player;
  }

  /**
   * Propose records for a player to claim. The realm signs each one after the player has.
   * @param {string} player
   * @param {{ text: string, data?: Record<string, unknown> }[]} items
   */
  async offer(player, items) {
    const offers = (this.data.offers[player] ??= []);
    for (const { text, data } of items) {
      if (typeof text !== "string" || text.length > 1000) throw new Error("a record's text must be at most 1000 characters");
      offers.push({ v: 1, type: "record", signers: [this.id, player], time: this.now(), text, ...(data ? { data } : {}) });
    }
    await this.#save();
  }

  /**
   * The complete public records this realm has signed together with the player, oldest first.
   * @param {string} player
   */
  publicRecords(player) {
    return this.data.public.filter((r) => r.signers.includes(player));
  }

  /**
   * Every complete record this realm has signed together with the player, public and private, oldest
   * first. Private ones are never listed; they are kept so the player can get them back.
   * @param {string} player
   */
  records(player) {
    const all = [...this.data.records, ...this.data.public.filter((r) => !this.data.records.includes(r))];
    const seen = new Set();
    return all.filter((r) => {
      const key = canonical(r);
      if (!r.signers.includes(player) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * The name the player chose in their EntryPortal, as of their latest sign-in here, or their starting
   * name. Names are not unique and prove nothing; show them, but key everything by the ID.
   * @param {string} id
   */
  playerName(id) {
    return this.data.players[id]?.name ?? defaultName(id);
  }

  /** @param {string} id */
  async isBurned(id) {
    return id in this.data.burned || Boolean(await this.options.isBurned?.(id));
  }

  /** @param {string} code */
  joinAddress(code) {
    return `${this.base}join/${code}`;
  }

  /** @param {string} code */
  claimAddress(code) {
    return `${this.base}claim/${code}`;
  }

  // ---- signing in ----

  /**
   * A one-time join code for the page to show. With `rename`, a signed-in player wants to change their
   * name: the code opens their own EntryPortal with the name box, and signing in again brings the name.
   * @param {Request} request
   * @param {boolean} rename
   */
  async #startJoin(request, rename) {
    this.#forgetOld();
    const code = this.#newCode();
    const token = hex(crypto.getRandomValues(new Uint8Array(16)));
    this.#joins.set(code, { token, created: this.now() });
    const address = this.joinAddress(code);
    const player = rename ? await this.player(request) : null;
    const portal = (player && this.data.players[player]?.portal) || this.portal;
    const link = this.#portalLink(address, portal) + (rename ? "&rename" : "");
    return { code, token, address, link, typed: typedAddress(address), qr: qrSvg(link), expires: this.now() + JOIN_MS };
  }

  /** @param {string} code @param {Request} request */
  async #joinPost(code, request) {
    const form = await readForm(request);
    if (!form) return this.#page("Too large", "That request was too large.", 413);
    const burn = form.get("burn");
    if (typeof burn === "string") return this.#burnPost(burn);
    const text = form.get("enter");
    if (typeof text !== "string") return this.#page("Nothing to do", "This address expects a sign-in note.", 400);
    const problem = await this.#checkNote(code, text);
    if (problem) return this.#page("Not signed in", problem, 400);
    // The device that made the note may play too: give its browser a session of its own.
    const session = await this.#newSession(/** @type {string} */ (this.#joins.get(code)?.player));
    return this.#page(
      "You're in",
      "You're in. If the game is open on another screen, it is signed in there too, and you can close this page.",
      200,
      { href: this.base, text: `Play ${this.card.name} here` },
      { "set-cookie": this.#cookie(session, SESSION_MS) },
    );
  }

  /**
   * Check a sign-in note for a join code, and let in the screen waiting on it. Returns a problem, or "".
   * @param {string} code
   * @param {string} text
   */
  async #checkNote(code, text) {
    const now = this.now();
    if (text.length > MAX_SIGNED) return "The sign-in note is too large.";
    /** @type {any} */
    let note;
    try {
      note = JSON.parse(text);
    } catch {
      return "The sign-in note is not readable.";
    }
    if (!note || note.v !== 1 || note.type !== "enter" || !isId(note.player)) return "The sign-in note is not readable.";
    const join = this.#joins.get(code);
    if (typeof note.address !== "string" || note.address.toLowerCase() !== this.joinAddress(code).toLowerCase()) {
      return "This sign-in note was made for a different address.";
    }
    if (!join || join.player || now - join.created > JOIN_MS) return "This sign-in code has expired or was already used. Ask your screen for a new one.";
    if (!Number.isSafeInteger(note.time) || Math.abs(note.time - now) > CLOCK_MS) {
      return "The time on your device and on this realm differ by more than two minutes.";
    }
    if (typeof note.nonce !== "string" || note.nonce.length < 16 || note.nonce.length > 64) return "The sign-in note is not readable.";
    if (this.#nonces.has(note.nonce)) return "This sign-in note was already used.";
    if (!(await validSigners(note)).includes(note.player)) return "The sign-in note's proof does not check out.";
    if (await this.isBurned(note.player)) return "That player ID has been burned, so it cannot be used here.";
    this.#nonces.set(note.nonce, now + 2 * CLOCK_MS);
    join.player = note.player;
    const portal = typeof note.portal === "string" && /^https?:\/\//.test(note.portal) ? note.portal : undefined;
    const name = tidyName(note.name);
    this.data.players[note.player] = { ...(portal ? { portal } : {}), ...(name ? { name } : {}), seen: now };
    await this.#save();
    return "";
  }

  /** @param {string} code @param {string} token */
  async #wait(code, token) {
    const join = this.#joins.get(code);
    if (join && join.token === token) {
      if (join.player && !join.taken) {
        join.taken = true;
        const session = await this.#newSession(join.player);
        return json({ state: "in", player: join.player }, 200, { "set-cookie": this.#cookie(session, SESSION_MS) });
      }
      if (join.taken) return json({ state: "in", player: join.player });
      return json({ state: this.now() - join.created > JOIN_MS ? "expired" : "waiting" });
    }
    const claim = this.#claims.get(code);
    if (claim && claim.token === token) {
      if (claim.done !== undefined) return json({ state: "claimed", count: claim.done });
      return json({ state: this.now() - claim.created > CLAIM_MS ? "expired" : "waiting" });
    }
    return json({ state: "unknown" }, 404);
  }

  /** @param {Request} request */
  async #me(request) {
    const player = await this.player(request);
    return {
      realm: this.id,
      name: this.card.name,
      player,
      playerName: player ? this.playerName(player) : null,
      portal: (player && this.data.players[player]?.portal) || this.portal,
      claims: player ? (this.data.offers[player] ?? []).length : 0,
      records: player ? this.records(player).length : 0,
    };
  }

  /** @param {Request} request */
  async #signOut(request) {
    delete this.data.sessions[cookie(request, COOKIE) ?? ""];
    await this.#save();
    return json({ ok: true }, 200, { "set-cookie": this.#cookie("", 0) });
  }

  // ---- claiming records ----

  /** @param {Request} request */
  async #startClaim(request) {
    const player = await this.player(request);
    if (!player) return json({ error: "not signed in" }, 401);
    const records = this.data.offers[player] ?? [];
    if (!records.length) return json({ error: "nothing to claim" }, 400);
    this.#forgetOld();
    const code = this.#newCode();
    const token = hex(crypto.getRandomValues(new Uint8Array(16)));
    this.#claims.set(code, { token, created: this.now(), player, records: [...records] });
    const address = this.claimAddress(code);
    return json({ code, token, address, link: address, typed: typedAddress(address), qr: qrSvg(address), count: records.length, expires: this.now() + CLAIM_MS });
  }

  /**
   * "Get my records back": a one-time code that hands the signed-in player every record this realm
   * holds for them, through their EntryPortal, the same way finished claims are handed back.
   * @param {Request} request
   */
  async #startRestore(request) {
    const player = await this.player(request);
    if (!player) return json({ error: "not signed in" }, 401);
    const records = this.records(player);
    if (!records.length) return json({ error: "no records" }, 400);
    this.#forgetOld();
    const code = this.#newCode();
    const token = hex(crypto.getRandomValues(new Uint8Array(16)));
    this.#claims.set(code, { token, created: this.now(), player, records, restore: true });
    const address = this.claimAddress(code);
    return json({ code, token, address, link: address, typed: typedAddress(address), qr: qrSvg(address), count: records.length, expires: this.now() + CLAIM_MS });
  }

  /** @param {string} code */
  #claimGet(code) {
    const claim = this.#claims.get(code);
    if (!claim || claim.done !== undefined || this.now() - claim.created > CLAIM_MS) {
      return this.#page("Expired", "This code has expired or was already used. Ask your screen for a new one.", 410);
    }
    const portal = this.data.players[claim.player]?.portal ?? this.portal;
    if (claim.restore) {
      // Complete records to keep: no `return`, since there is nothing to sign.
      claim.done = claim.records.length;
      return redirect(portal + "#sign=" + encodeURIComponent(JSON.stringify({ records: claim.records, back: this.base })));
    }
    return redirect(portal + "#sign=" + encodeURIComponent(JSON.stringify({ return: this.claimAddress(code), records: claim.records })));
  }

  /** @param {string} code @param {Request} request */
  async #claimPost(code, request) {
    const claim = this.#claims.get(code);
    if (!claim || claim.done !== undefined || this.now() - claim.created > CLAIM_MS) {
      return this.#page("Expired", "This claim code has expired or was already used. Ask your screen for a new one.", 410);
    }
    const form = await readForm(request);
    /** @type {any} */
    let returned;
    try {
      returned = JSON.parse(String(form?.get("records") ?? ""));
    } catch {
      returned = null;
    }
    if (!Array.isArray(returned)) return this.#page("Not readable", "The records sent back were not readable.", 400);
    const completed = [];
    for (const record of returned) {
      const done = await this.#countersign(claim, record);
      if (done) completed.push(done);
    }
    // Proposals the player did not sign are dropped: players keep the records they want.
    const offered = new Set(claim.records.map(proposalKey));
    this.data.offers[claim.player] = (this.data.offers[claim.player] ?? []).filter((r) => !offered.has(proposalKey(r)));
    if (!this.data.offers[claim.player].length) delete this.data.offers[claim.player];
    claim.done = completed.length;
    await this.#save();
    for (const record of completed) this.options.onRecord?.(record);
    if (!completed.length) return this.#page("Nothing signed", "No records were signed. Go back to your screen.");
    const portal = this.data.players[claim.player]?.portal ?? this.portal;
    // `back` lets the EntryPortal offer a way back to the game, for a player who claimed on this device.
    return redirect(portal + "#sign=" + encodeURIComponent(JSON.stringify({ records: completed, back: this.base })));
  }

  /**
   * Sign a record the player sent back, if it is one of the claim's proposals with only `public` and
   * `sigs` changed and the player's proof checks out. Returns the complete record, or null.
   * @param {{ player: string, records: any[] }} claim
   * @param {any} record
   */
  async #countersign(claim, record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    if (record.public !== undefined && typeof record.public !== "boolean") return null;
    const key = proposalKey(record);
    if (!claim.records.some((p) => proposalKey(p) === key)) return null;
    if (signedBytes(record).length > MAX_SIGNED) return null;
    if (!(await validSigners(record)).includes(claim.player)) return null;
    const { sigs, ...body } = record;
    /** @type {any} */
    const done = await addSignature({ ...body, sigs: { [claim.player]: sigs[claim.player] } }, this.signer);
    if (!(await isComplete(done))) return null;
    this.data.records.push(done);
    if (done.public === true) this.data.public.push(done);
    return done;
  }

  // ---- burning ----

  /** @param {string} text */
  async #burnPost(text) {
    /** @type {any} */
    let notice;
    let id = "";
    try {
      notice = JSON.parse(text);
      if (notice?.v !== 1 || notice.type !== "burn") throw new Error();
      if (typeof notice.key === "string") id = (await signerFromPrivateKey(fromBase64url(notice.key))).id;
      else if (typeof notice.words === "string") id = (await signerFromWords(notice.words)).id;
      else throw new Error();
    } catch {
      return this.#page("Not readable", "That burn notice is not readable.", 400);
    }
    if (!(id in this.data.players) && !this.data.public.some((r) => r.signers.includes(id))) {
      return this.#page("Unknown here", "This realm has never seen that player ID, so nothing changed.");
    }
    await this.burn(id, notice);
    return this.#page("Burned", "Noted: that player ID is burned here, and nothing signed by it counts any more.");
  }

  /**
   * Treat an ID as gone: end its sessions, drop its offers and public records, and refuse it from now on.
   * Call this for notices learned elsewhere, such as from a board.
   * @param {string} id
   * @param {any} notice
   */
  async burn(id, notice) {
    this.data.burned[id] = notice;
    for (const [token, session] of Object.entries(this.data.sessions)) if (session.player === id) delete this.data.sessions[token];
    delete this.data.offers[id];
    this.data.public = this.data.public.filter((r) => !r.signers.includes(id));
    this.data.records = this.data.records.filter((r) => !r.signers.includes(id));
    await this.#save();
  }

  // ---- helpers ----

  #newCode() {
    for (;;) {
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const code = Array.from(bytes, (b) => CODE_CHARS[b & 31]).join("");
      if (!this.#joins.has(code) && !this.#claims.has(code)) return code;
    }
  }

  #forgetOld() {
    const now = this.now();
    for (const [code, join] of this.#joins) if (now - join.created > 2 * JOIN_MS) this.#joins.delete(code);
    for (const [code, claim] of this.#claims) if (now - claim.created > 2 * CLAIM_MS) this.#claims.delete(code);
    for (const [nonce, until] of this.#nonces) if (now > until) this.#nonces.delete(nonce);
  }

  /** @param {string} address @param {string} [portal] */
  #portalLink(address, portal = this.portal) {
    return portal + "#url=" + encodeURIComponent(address);
  }

  /** @param {string} value @param {number} ms */
  #cookie(value, ms) {
    const secure = this.base.startsWith("https:") ? "; Secure" : "";
    return `${COOKIE}=${value}; Path=${this.basePath}; Max-Age=${Math.floor(ms / 1000)}; HttpOnly; SameSite=Lax${secure}`;
  }

  /** A new session for a player, kept until it expires or they sign out. @param {string} player */
  async #newSession(player) {
    const session = hex(crypto.getRandomValues(new Uint8Array(24)));
    this.data.sessions[session] = { player, created: this.now() };
    await this.#save();
    return session;
  }

  /**
   * A small page for the browser that sent a form here.
   * @param {string} title @param {string} message @param {number} [status]
   * @param {{ href: string, text: string }} [link] a button to show, if any
   * @param {Record<string, string>} [headers]
   */
  #page(title, message, status = 200, link = { href: "", text: "" }, headers = {}) {
    const name = escapeHtml(this.card.name);
    const button = link.href
      ? `<p><a href="${escapeHtml(link.href)}" style="display:inline-block;padding:.6rem 1.1rem;border-radius:10px;background:#5b3fd0;color:#fff;text-decoration:none">${escapeHtml(link.text)}</a></p>`
      : "";
    const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | ${name}</title><style>body{font:20px/1.5 system-ui,sans-serif;max-width:30rem;margin:3rem auto;padding:0 1rem}</style></head>
<body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${button}<p><small>${name}</small></p></body></html>`;
    return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
  }

  #save() {
    const snapshot = JSON.parse(JSON.stringify(this.data));
    this.#saving = this.#saving.then(() => this.store.save(snapshot));
    return this.#saving;
  }
}

/** Keep the realm's data in a JSON file. @param {string} path @returns {Store} */
export function fileStore(path) {
  return {
    async load() {
      try {
        return JSON.parse(await Deno.readTextFile(path));
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) return null;
        throw e;
      }
    },
    async save(data) {
      await Deno.writeTextFile(path + ".new", JSON.stringify(data));
      await Deno.rename(path + ".new", path);
    },
  };
}

/** Keep the realm's data in memory only, for tests. @returns {Store} */
export function memoryStore() {
  let saved = "null";
  return { load: async () => JSON.parse(saved), save: async (data) => void (saved = JSON.stringify(data)) };
}

/** The realm's secret phrase from a file, made on first run. @param {string} path */
async function secretWords(path) {
  try {
    return await checkWords(await Deno.readTextFile(path));
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  const words = await newWords();
  await Deno.writeTextFile(path, words + "\n", { mode: 0o600, createNew: true });
  console.log(`Made a new secret phrase for this realm in ${path}. Keep a copy somewhere safe: it is the realm's identity.`);
  return words;
}

/** What identifies a proposal: everything except `public` and `sigs`. @param {any} record */
function proposalKey(record) {
  const { public: _p, sigs: _s, ...body } = record;
  return canonical(body);
}

/** @param {Request} request */
async function readForm(request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return null;
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

/** @param {Request} request @param {string} name */
function cookie(request, name) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** The address as a person would type it: https is assumed, so it is left out. @param {string} address */
function typedAddress(address) {
  return address.replace(/^https:\/\//, "");
}

/** @param {unknown} value @param {number} [status] @param {Record<string, string>} [headers] */
function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/** @param {string} location */
function redirect(location) {
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });
}

/** @param {string} text */
function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

