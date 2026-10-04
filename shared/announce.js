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
 * @property {string} main      file name of the realm's rules
 * @property {string} renderer  file name of the default renderer
 * @property {string[]} play    how it can be played, e.g. ["browser"]
 * @property {string[]} needs   permissions the realm asks the player's app for; none are
 *                              defined in version 0, so this is empty for now
 */

/**
 * @typedef {object} AnnouncementBody
 * @property {import("./envelope.js").Envelope} manifest
 * @property {string} name
 * @property {string[]} tags
 * @property {number} expires  milliseconds since 1970
 */

/**
 * A release is one exact signed manifest. Its hash pins that version, so a
 * link can say "this realm, exactly as it was" (`wwg:<address>?release=<hash>`).
 * @param {import("./envelope.js").Envelope} manifest
 */
export function releaseOf(manifest) {
  return hashOf(canonicalJson(manifest));
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
  if (!m.files[m.main] || !m.files[m.renderer]) return null;
  return { announcement, manifest: m };
}
