// Realm manifests and announcements, shared by the app and the server.
//
// A manifest is a realm's signed list of files (by hash) plus its name and tags.
// An announcement is the realm's signed "here I am" note that carries the
// manifest, so anyone holding the announcement can fetch and check every file.

import { hashOf, isHash } from "./crypto.js";
import { canonicalJson } from "./encoding.js";
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
 * @property {RealmApp} [app]     the realm's own app, for realms made with an engine
 * @property {string[]} needs   permissions the realm asks the player's app for; none are
 *                              defined in version 0, so this is empty for now
 */

/**
 * A program players install to play a realm (built with a game engine, say).
 * It is a peer like any other: it speaks the protocol; nothing in it is run by
 * the browser app.
 * @typedef {object} RealmApp
 * @property {string} name
 * @property {string} url   https address where players can get it
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
 * @property {RealmApp} [app]
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
  const tags = source.tags ?? [];
  if (!isTagList(tags)) throw new Error("realm.json may list at most 32 tags, each 1 to 40 characters.");
  if (!source.main) throw new Error("realm.json must point to the realm's rules file (main).");
  if (!source.renderer && !source.app) throw new Error("realm.json must point to a renderer file, or name the realm's own app.");
  if (source.app && !isApp(source.app)) throw new Error("realm.json's app needs a name and an https address (url).");
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
    ...(source.app ? { app: { name: source.app.name, url: source.app.url } } : {}),
    needs: source.needs ?? [],
  };
}

/** @param {unknown} app @returns {app is RealmApp} */
function isApp(app) {
  const a = /** @type {any} */ (app);
  return Boolean(a) && typeof a.name === "string" && a.name.length > 0 && a.name.length <= 80 &&
    typeof a.url === "string" && a.url.length <= 300 && /^https:\/\/[^\s<>"']+$/.test(a.url);
}

/**
 * @typedef {object} AnnouncementBody
 * @property {import("./envelope.js").Envelope} manifest
 * @property {string} name
 * @property {string[]} tags
 * @property {number} expires  milliseconds since 1970
 */

/**
 * A release is the stable manifest body. Its hash pins that version, so a
 * link can say "this realm, exactly as it was" (`emind:<address>?release=<hash>`).
 * @param {import("./envelope.js").Envelope} manifest
 */
export function releaseOf(manifest) {
  return hashOf(canonicalJson(manifest.body));
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
 */
export function makeAnnouncement(realmKeys, manifest) {
  const m = /** @type {ManifestBody} */ (manifest.body);
  /** @type {AnnouncementBody} */
  const body = {
    manifest,
    name: m.name,
    tags: m.tags,
    expires: Date.now() + ANNOUNCEMENT_LIFETIME_MS,
  };
  return seal(realmKeys, null, "announce", body);
}

/** @param {unknown} tags @returns {tags is string[]} */
function isTagList(tags) {
  return Array.isArray(tags) && tags.length <= 32 &&
    tags.every((t) => typeof t === "string" && t.length > 0 && t.length <= 40);
}

/**
 * Check an announcement and the manifest inside it.
 * @param {unknown} value
 * @returns {Promise<{ announcement: import("./envelope.js").Envelope, manifest: ManifestBody } | null>}
 */
export async function checkAnnouncement(value) {
  const announcement = await open(value);
  if (!announcement || announcement.kind !== "announce" || announcement.to !== null) return null;
  const body = /** @type {AnnouncementBody} */ (announcement.body);
  if (!body || typeof body.expires !== "number" || body.expires < Date.now()) return null;
  if (typeof body.name !== "string" || !isTagList(body.tags)) return null;
  const manifestEnv = await open(body.manifest);
  if (!manifestEnv || manifestEnv.kind !== "manifest" || manifestEnv.from !== announcement.from) {
    return null;
  }
  const m = /** @type {ManifestBody} */ (manifestEnv.body);
  if (!m || typeof m.name !== "string" || !isTagList(m.tags)) return null;
  if (!Array.isArray(m.needs) || !m.needs.every((n) => typeof n === "string")) return null;
  if (!m.files || typeof m.files !== "object") return null;
  if (!Object.values(m.files).every(isHash)) return null;
  for (const name of [m.main, m.renderer]) {
    if (name !== undefined && (typeof name !== "string" || !Object.hasOwn(m.files, name))) return null;
  }
  if (m.app !== undefined && !isApp(m.app)) return null;
  return { announcement, manifest: m };
}
