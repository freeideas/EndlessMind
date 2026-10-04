// Realm manifests and announcements, shared by the portal and the server.
//
// A manifest is a realm's signed list of files (by hash) plus its name and tags.
// An announcement is the realm's signed "here I am" note that carries the
// manifest, so anyone holding the announcement can fetch and check every file.

import { addressOf, hashOf, isAddress, isHash, newPortableKey } from "./crypto.js";
import { canonicalJson } from "./encoding.js";

/** Limits on a manifest, so one realm cannot crowd a server's lists (see specs/PROTOCOL.md). */
export const MAX_NAME = 200, MAX_DESCRIPTION = 2000, MAX_FILES = 256;
import { open, seal } from "./envelope.js";

/**
 * @typedef {object} ManifestBody
 * @property {string} name
 * @property {string} [description]
 * @property {string[]} tags
 * @property {Record<string, string>} files  file name to hash
 * @property {string} [main]      file name of the realm's rules; left out when the rules are
 *                                private (known only to the referee)
 * @property {string} [renderer]  file name of the default browser renderer; left out when the
 *                                realm cannot be played in a browser
 * @property {RealmPortal} [portal]     the realm's own portal, for realms made with an engine
 * @property {string[]} [asks]  addresses of realms whose signed claims this realm would like to be
 *                              shown; the portal offers what the actor holds from them, if the actor agrees
 * @property {string[]} needs   permissions the realm asks the actor's portal for; none are
 *                              defined in version 0, so this is empty for now
 */

/**
 * A program actors install to play a realm (built with a game engine, say).
 * It is a peer like any other: it speaks the protocol; nothing in it is run by
 * the browser portal.
 * @typedef {object} RealmPortal
 * @property {string} name
 * @property {string} url   https address where actors can get it
 */

/**
 * A realm's source description (realm.json, written by its creator or agent).
 * @typedef {object} RealmSource
 * @property {string} name
 * @property {string} [description]
 * @property {string[]} [tags]
 * @property {string} [main]      rules file
 * @property {boolean} [privateRules]  keep the rules file off the network: only a host program can referee
 * @property {string} [renderer]  default browser renderer file
 * @property {string[]} [files]   other public files
 * @property {RealmPortal} [portal]
 * @property {string[]} [asks]    realms whose signed claims this realm would like to be shown
 * @property {string[]} [needs]   permissions asked for (none exist yet)
 */

/**
 * Build a manifest's contents from a realm's source description.
 * @param {RealmSource} source
 * @param {Record<string, string>} hashes  public file name to hash
 * @returns {ManifestBody}
 */
export function manifestBody(source, hashes) {
  if (!source || typeof source.name !== "string" || !source.name) throw new Error("realm.json must name the realm.");
  if (source.name.length > MAX_NAME || (source.description ?? "").length > MAX_DESCRIPTION) {
    throw new Error(`A realm's name may have at most ${MAX_NAME} characters and its description ${MAX_DESCRIPTION}.`);
  }
  if (Object.keys(hashes).length > MAX_FILES) throw new Error(`A realm may list at most ${MAX_FILES} files.`);
  const tags = source.tags ?? [];
  if (!isTagList(tags)) throw new Error("realm.json may list at most 32 tags, each 1 to 40 characters.");
  if (!source.main) throw new Error("realm.json must point to the realm's rules file (main).");
  if (!source.renderer && !source.portal) throw new Error("realm.json must point to a renderer file, or name the realm's own portal.");
  if (source.asks && !(Array.isArray(source.asks) && source.asks.length <= 16 && source.asks.every(isAddress))) {
    throw new Error("realm.json's asks may list at most 16 realm addresses.");
  }
  if (source.portal && !isPortal(source.portal)) throw new Error("realm.json's portal needs a name and an https address (url).");
  const main = source.privateRules ? undefined : source.main;
  for (const name of [main, source.renderer]) {
    if (name && !hashes[name]) throw new Error(`The file ${name} named in realm.json is missing.`);
  }
  return {
    name: source.name,
    description: source.description ?? "",
    tags,
    files: hashes,
    ...(main ? { main } : {}),
    ...(source.renderer ? { renderer: source.renderer } : {}),
    ...(source.portal ? { portal: { name: source.portal.name, url: source.portal.url } } : {}),
    ...(source.asks?.length ? { asks: source.asks } : {}),
    needs: source.needs ?? [],
  };
}

/** @param {unknown} portal @returns {portal is RealmPortal} */
function isPortal(portal) {
  const a = /** @type {any} */ (portal);
  return Boolean(a) && typeof a.name === "string" && a.name.length > 0 && a.name.length <= 80 &&
    typeof a.url === "string" && a.url.length <= 300 && /^https:\/\/[^\s<>"']+$/.test(a.url);
}

/**
 * @typedef {object} AnnouncementBody
 * @property {import("./envelope.js").Envelope} manifest
 * @property {string} name
 * @property {string[]} tags
 * @property {number} expires  milliseconds since 1970
 * @property {string} [key]  the referee's exchange key ("x25519-..."), for locking entry requests
 * @property {string[]} [servers]  web addresses of every server the realm is refereed on, so one
 *                                working hint leads to the rest
 * @property {import("./envelope.js").Envelope} [pass]  present when a referee key, not the realm's
 *                                own key, signed this announcement (see makePass)
 */

/**
 * A release is the stable manifest body. Its hash pins that version, so a
 * link can say "this realm, exactly as it was" (`emind:<address>?release=<hash>`).
 * @param {import("./envelope.js").Envelope} manifest
 */
export function releaseOf(manifest) {
  return releaseOfBody(manifest.body);
}

/** The release hash of a manifest body: the name of a realm that has no key. @param {unknown} body */
export function releaseOfBody(body) {
  return hashOf(canonicalJson(body));
}

/** One week: announcements expire unless renewed ("unused things fade away"). */
export const ANNOUNCEMENT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {CryptoKeyPair} realmKeys
 * @param {ManifestBody} body
 */
export function makeManifest(realmKeys, body) {
  return seal(realmKeys, null, "manifest", body);
}

/**
 * @param {CryptoKeyPair} realmKeys
 * @param {import("./envelope.js").Envelope} manifest
 * @param {{ lifetimeMs?: number, pass?: import("./envelope.js").Envelope, servers?: string[], key?: string }} [options]
 *   `lifetimeMs` is shorter for a room, which is gone when its host leaves; `pass` is given when the keys
 *   are a referee key the realm gave a pass to; `servers` lists every server the realm is refereed on;
 *   `key` is the referee's exchange key, with which visitors lock the private part of an entry request
 */
export function makeAnnouncement(realmKeys, manifest, { lifetimeMs = ANNOUNCEMENT_LIFETIME_MS, pass, servers, key } = {}) {
  const m = /** @type {ManifestBody} */ (manifest.body);
  /** @type {AnnouncementBody} */
  const body = {
    manifest,
    name: m.name,
    tags: m.tags,
    expires: Math.min(Date.now() + lifetimeMs, pass ? /** @type {any} */ (pass.body).expires : Infinity),
    ...(pass ? { pass } : {}),
    ...(servers?.length ? { servers } : {}),
    ...(key ? { key } : {}),
  };
  return seal(realmKeys, null, "announce", body);
}

/**
 * A referee pass: the realm's key says "this other key may referee me until
 * then". The realm's own key can then stay off the machine that referees, where
 * nothing can reach it. A stolen referee key stops working when its pass runs
 * out, and a newer pass takes its place at once on any server that sees it.
 * @param {CryptoKeyPair} realmKeys @param {number} lifetimeMs
 * @returns {Promise<{ secret: string, pass: import("./envelope.js").Envelope }>} the referee key's secret, and the pass
 */
export async function makePass(realmKeys, lifetimeMs) {
  const { secret, keys } = await newPortableKey();
  const body = { referee: await addressOf(keys.publicKey), expires: Date.now() + lifetimeMs };
  return { secret, pass: await seal(realmKeys, null, "referee", body) };
}

/**
 * Check a pass. @param {unknown} value
 * @returns {Promise<{ realm: string, referee: string, expires: number, time: number } | null>}
 */
export async function checkPass(value) {
  const pass = await open(value);
  const body = /** @type {any} */ (pass?.body);
  if (!pass || pass.kind !== "referee" || pass.to !== null || !body) return null;
  if (!isAddress(body.referee) || typeof body.expires !== "number" || body.expires < Date.now()) return null;
  return { realm: pass.from, referee: body.referee, expires: body.expires, time: pass.time };
}

/** @param {unknown} servers @returns {servers is string[]} */
function isServerList(servers) {
  return Array.isArray(servers) && servers.length <= 8 &&
    servers.every((s) => typeof s === "string" && s.length <= 300 && /^https?:\/\/[^\s\/?#]+$/.test(s));
}

/** @param {unknown} tags @returns {tags is string[]} */
function isTagList(tags) {
  return Array.isArray(tags) && tags.length <= 32 &&
    tags.every((t) => typeof t === "string" && t.length > 0 && t.length <= 40);
}

/**
 * Check an announcement and the manifest inside it.
 * @param {unknown} value
 * @returns {Promise<{ announcement: import("./envelope.js").Envelope, manifest: ManifestBody, realm: string,
 *   referee: string, authority: number } | null>} `realm` is the address the realm is known by, `referee`
 *   the address that answers visitors (the same unless a pass is used), and `authority` the time the
 *   realm's own key last spoke, by which a server tells a newer announcement from an older one
 */
export async function checkAnnouncement(value) {
  const announcement = await open(value);
  if (!announcement || announcement.kind !== "announce" || announcement.to !== null) return null;
  const body = /** @type {AnnouncementBody} */ (announcement.body);
  if (!body || typeof body.expires !== "number" || body.expires < Date.now()) return null;
  // A note may not outlive the usual lifetime (plus a day for clocks that differ).
  if (body.expires > Date.now() + ANNOUNCEMENT_LIFETIME_MS + 24 * 60 * 60 * 1000) return null;
  if (typeof body.name !== "string" || body.name.length > MAX_NAME || !isTagList(body.tags)) return null;
  if (body.servers !== undefined && !isServerList(body.servers)) return null;
  if (body.key !== undefined && !(typeof body.key === "string" && /^x25519-[a-z2-7]{52}$/.test(body.key))) return null;
  let realm = announcement.from, authority = announcement.time;
  if (body.pass !== undefined) {
    const pass = await checkPass(body.pass);
    if (!pass || pass.referee !== announcement.from || body.expires > pass.expires) return null;
    realm = pass.realm;
    authority = pass.time;
  }
  const manifestEnv = await open(body.manifest);
  if (!manifestEnv || manifestEnv.kind !== "manifest" || manifestEnv.from !== realm) {
    return null;
  }
  if (!isManifestBody(manifestEnv.body)) return null;
  return { announcement, manifest: manifestEnv.body, realm, referee: announcement.from, authority };
}

/** @param {unknown} body @returns {body is ManifestBody} */
export function isManifestBody(body) {
  const m = /** @type {ManifestBody} */ (body);
  if (!m || typeof m !== "object" || Array.isArray(m)) return false;
  if (typeof m.name !== "string" || !m.name || m.name.length > MAX_NAME || !isTagList(m.tags)) return false;
  if (m.description !== undefined && (typeof m.description !== "string" || m.description.length > MAX_DESCRIPTION)) return false;
  if (!Array.isArray(m.needs) || !m.needs.every((n) => typeof n === "string")) return false;
  if (!m.files || typeof m.files !== "object" || Array.isArray(m.files)) return false;
  const names = Object.keys(m.files);
  if (names.length > MAX_FILES || !names.every((n) => n.length > 0 && n.length <= MAX_NAME)) return false;
  if (!Object.values(m.files).every(isHash)) return false;
  for (const name of [m.main, m.renderer]) {
    if (name !== undefined && (typeof name !== "string" || !Object.hasOwn(m.files, name))) return false;
  }
  if (m.asks !== undefined && !(Array.isArray(m.asks) && m.asks.length <= 16 && m.asks.every(isAddress))) return false;
  return m.portal === undefined || isPortal(m.portal);
}
