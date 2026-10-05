// A local realm is the original. Helper servers receive copies of its public files.
import {
  checkAnnouncement,
  makeAnnouncement,
  makeManifest,
  checkPictureSize,
  manifestBody,
  releaseOf,
} from "../shared/announce.js";
import { addressOf, hashOf, newPortableKey } from "../shared/crypto.js";
import { fromUtf8, parseStrictJson } from "../shared/encoding.js";
import * as store from "./store.js";

/** @typedef {import("../shared/announce.js").RealmSource} RealmSource */
/**
 * @typedef {object} OwnedRealm
 * @property {string} address
 * @property {string} name
 * @property {CryptoKeyPair} keys
 * @property {string} secret
 * @property {import("../shared/envelope.js").Envelope} manifest
 * @property {Record<string, Uint8Array<ArrayBuffer>>} [files] absent in older browser records
 */

/**
 * A server that takes the connection and then says nothing must not hold up the next one to try.
 * @param {AbortSignal} [signal]
 */
function patient(signal) {
  const limit = AbortSignal.timeout(15_000);
  return signal && AbortSignal.any ? AbortSignal.any([signal, limit]) : signal ?? limit;
}

/** @param {string} value */
export function serverOrigin(value) {
  const url = new URL(value.includes("://") ? value : `${location.protocol}//${value}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Use an http or https server address.");
  }
  return url.origin;
}

/** Save locally before any upload. @param {Map<string, Uint8Array<ArrayBuffer>>} files @param {string} [server] */
export async function publish(files, server = location.origin) {
  const sourceBytes = files.get("realm.json");
  if (!sourceBytes) throw new Error("A realm needs a realm.json file.");
  const source = /** @type {RealmSource} */ (JSON.parse(fromUtf8(sourceBytes)));
  if (source.privateRules) {
    throw new Error("Private rules need the host program. See specs/RUNNING.md.");
  }
  const publicFiles = Object.fromEntries([...files].filter(([name]) => name !== "realm.json"));
  const hashes = Object.fromEntries(
    await Promise.all(
      Object.entries(publicFiles).map(async ([name, bytes]) => [name, await hashOf(bytes)]),
    ),
  );
  const body = manifestBody(source, hashes);
  checkPictureSize(source, publicFiles);
  const { keys, secret } = await newPortableKey();
  const address = await addressOf(keys.publicKey);
  const manifest = await makeManifest(keys, body);
  const realm = { address, name: source.name, keys, secret, manifest, files: publicFiles };
  await store.put("realm:" + address, realm);
  await publishOwned(realm, server);
  return realm;
}

/** @param {OwnedRealm} realm @param {string} [server] */
export async function publishOwned(realm, server = location.origin) {
  const body = /** @type {import("../shared/announce.js").ManifestBody} */ (realm.manifest.body);
  // Older records may still need one retrieval. Persist each recovered file.
  for (const [name, hash] of Object.entries(body.files)) {
    if (!realm.files?.[name]) {
      realm.files = { ...realm.files, [name]: await fetchBytes(hash, server) };
      await store.put("realm:" + realm.address, realm);
    }
  }
  // A server takes only files that an announced realm lists, so announce first.
  await announce(realm, server);
  for (const [name, hash] of Object.entries(body.files)) {
    if (await upload(name, /** @type {NonNullable<typeof realm.files>} */ (realm.files)[name], server) !== hash) {
      throw new Error(`Changed local file: ${name}`);
    }
  }
  // With public rules the release also stands without the key: anyone can play their own copy.
  if (body.main) await postRelease(body, server);
}

/**
 * Post a release with no key: the manifest body, named by its hash. Posting it
 * again renews it, so a release stays while people use it.
 * @param {import("../shared/announce.js").ManifestBody} body @param {string} [server]
 */
export async function postRelease(body, server = location.origin) {
  const response = await fetch(new URL("/announce", server), { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Posting the release failed: ${(await response.json()).error}`);
}

/** Post a signed recommendation to a server. @param {{ claim: unknown, proof?: unknown[] }} record @param {string} [server] */
export async function postRecommendation(record, server = location.origin) {
  const response = await fetch(new URL("/recommend", server), { method: "POST", body: JSON.stringify(record) });
  if (!response.ok) throw new Error(`Recommending failed: ${(await response.json()).error}`);
}

/** @param {string} name @param {Uint8Array<ArrayBuffer>} bytes @param {string} [server] */
export async function upload(name, bytes, server = location.origin) {
  const hash = await hashOf(bytes);
  const response = await fetch(new URL(`/blob/${hash}`, server), { method: "PUT", body: bytes });
  if (!response.ok) throw new Error(`Upload of ${name} failed: ${(await response.json()).error}`);
  return hash;
}

/** @param {{keys: CryptoKeyPair, manifest: import("../shared/envelope.js").Envelope}} realm @param {string} [server] @param {number} [lifetimeMs]
 * @param {string} [key] the exchange key of the referee now running, if one is */
export async function announce(realm, server = location.origin, lifetimeMs, key) {
  const announcement = await makeAnnouncement(realm.keys, realm.manifest, { lifetimeMs, servers: [server], key });
  const response = await fetch(new URL("/announce", server), {
    method: "POST",
    body: JSON.stringify(announcement),
  });
  if (!response.ok) throw new Error(`Announcing failed: ${(await response.json()).error}`);
}

/** @returns {Promise<OwnedRealm[]>} */
export function ownedRealms() {
  return store.list("realm:");
}
/** @param {string} address @returns {Promise<OwnedRealm | undefined>} */
export function ownedRealm(address) {
  return store.get("realm:" + address);
}

/** @param {string} address @param {string} [server] @param {AbortSignal} [signal] */
export async function lookUp(address, server = location.origin, signal) {
  const response = await fetch(new URL(`/announce/${encodeURIComponent(address)}`, server), {
    signal: patient(signal),
  });
  if (!response.ok) return null;
  const reply = /** @type {any} */ (parseStrictJson(await response.text()));
  if (!reply) return null;
  const checked = await checkAnnouncement(reply.announcement);
  if (!checked || checked.realm !== address) return null;
  return {
    manifest: checked.manifest,
    referee: checked.referee,
    key: /** @type {string | undefined} */ (reply.announcement.body.key),
    servers: /** @type {string[]} */ (reply.announcement.body.servers ?? []),
    online: Boolean(reply.online),
    release: await releaseOf(reply.announcement.body.manifest),
  };
}

/** @param {string} hash @param {string} [server] @param {AbortSignal} [signal] */
export async function fetchBytes(hash, server = location.origin, signal) {
  const response = await fetch(new URL(`/blob/${hash}`, server), { signal: patient(signal) });
  if (!response.ok) throw new Error("A file of this realm is missing on the server.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (await hashOf(bytes) !== hash) {
    throw new Error("A file of this realm does not match its hash.");
  }
  return bytes;
}
/** @param {string} hash @param {string} [server] @param {AbortSignal} [signal] */
export async function fetchFile(hash, server = location.origin, signal) {
  return fromUtf8(await fetchBytes(hash, server, signal));
}

/**
 * A realm as a server lists it.
 * @typedef {object} Listed
 * @property {string} address
 * @property {string} name
 * @property {string} [description]  its first 300 characters
 * @property {{ hash: string, type: string }} [picture]
 * @property {string[]} tags
 * @property {boolean} online
 * @property {boolean} [alone]
 * @property {boolean} [picked]  the server's operator picked it
 */

/** @param {string} [tag] @param {string} [server] @returns {Promise<Listed[]>} */
export async function search(tag, server = location.origin) {
  const url = new URL("/announce", server);
  if (tag) url.searchParams.set("tag", tag);
  const response = await fetch(url);
  if (!response.ok) return [];
  return (await response.json()).realms;
}

/** @param {string} folder */
export async function exampleFiles(folder) {
  const base = `/examples/${folder}/`;
  const sourceBytes = new Uint8Array(await (await fetch(base + "realm.json")).arrayBuffer());
  const source = /** @type {RealmSource} */ (JSON.parse(fromUtf8(sourceBytes)));
  const files = new Map([["realm.json", sourceBytes]]);
  for (const name of new Set([source.main, source.renderer, source.picture, ...Object.values(source.renderers ?? {}), ...(source.files ?? [])])) {
    if (name) files.set(name, new Uint8Array(await (await fetch(base + name)).arrayBuffer()));
  }
  return files;
}
