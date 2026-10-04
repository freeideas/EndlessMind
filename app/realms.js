// Publishing realms and fetching them back, checking every hash and signature.

import { checkAnnouncement, makeAnnouncement, makeManifest, manifestBody, releaseOf } from "../shared/announce.js";
import { addressOf, hashOf, newPortableKey } from "../shared/crypto.js";
import { fromUtf8, parseStrictJson } from "../shared/encoding.js";
import * as store from "./store.js";

/** @typedef {import("../shared/announce.js").RealmSource} RealmSource */

/**
 * A realm this device holds the key for.
 * @typedef {object} OwnedRealm
 * @property {string} address
 * @property {string} name
 * @property {CryptoKeyPair} keys
 * @property {string} secret  the key's secret, so the realm can be saved and hosted elsewhere
 * @property {import("../shared/envelope.js").Envelope} manifest
 */

/**
 * Publish a realm from its files: make its key, upload the files by hash,
 * sign its manifest and announce it.
 * @param {Map<string, Uint8Array<ArrayBuffer>>} files file name to contents, including realm.json
 * @returns {Promise<OwnedRealm>}
 */
export async function publish(files) {
  const sourceBytes = files.get("realm.json");
  if (!sourceBytes) throw new Error("A realm needs a realm.json file.");
  /** @type {RealmSource} */
  const source = JSON.parse(fromUtf8(sourceBytes));
  if (source.privateRules) {
    throw new Error("This realm keeps its rules private, so a browser tab cannot referee it. Host it with: deno task host (see specs/RUNNING.md).");
  }
  // Checks the description before anything is uploaded.
  manifestBody(source, Object.fromEntries([...files.keys()].map((name) => [name, "-"])));

  /** @type {Record<string, string>} */
  const hashes = {};
  for (const [name, bytes] of files) {
    if (name === "realm.json") continue;
    hashes[name] = await upload(name, bytes);
  }

  const { keys, secret } = await newPortableKey();
  const address = await addressOf(keys.publicKey);
  const manifest = await makeManifest(keys, manifestBody(source, hashes));
  /** @type {OwnedRealm} */
  const realm = { address, name: source.name, keys, secret, manifest };
  await announce(realm);
  await store.put("realm:" + address, realm);
  return realm;
}

/**
 * Store one file on the server under its hash.
 * @param {string} name @param {Uint8Array<ArrayBuffer>} bytes
 * @returns {Promise<string>} the hash
 */
export async function upload(name, bytes) {
  const hash = await hashOf(bytes);
  const response = await fetch(`/blob/${hash}`, { method: "PUT", body: bytes });
  if (!response.ok) throw new Error(`Upload of ${name} failed: ${(await response.json()).error}`);
  return hash;
}

/** Announce (or renew) a realm this device owns. @param {OwnedRealm} realm */
export async function announce(realm) {
  const announcement = await makeAnnouncement(realm.keys, realm.manifest);
  const response = await fetch("/announce", { method: "POST", body: JSON.stringify(announcement) });
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

/**
 * Look a realm up by its address and check its announcement.
 * @param {string} address
 */
export async function lookUp(address) {
  const response = await fetch(`/announce/${encodeURIComponent(address)}`);
  if (!response.ok) return null;
  const reply = /** @type {any} */ (parseStrictJson(await response.text()));
  if (!reply) return null;
  const { announcement, online } = reply;
  const checked = await checkAnnouncement(announcement);
  if (!checked || checked.announcement.from !== address) return null;
  const manifestEnv = /** @type {any} */ (checked.announcement.body).manifest;
  return { manifest: checked.manifest, online: Boolean(online), release: await releaseOf(manifestEnv) };
}

/**
 * Fetch one of a realm's files and check it against its hash.
 * @param {string} hash
 * @returns {Promise<string>}
 */
export async function fetchFile(hash) {
  const response = await fetch(`/blob/${hash}`);
  if (!response.ok) throw new Error("A file of this realm is missing on the server.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if ((await hashOf(bytes)) !== hash) throw new Error("A file of this realm does not match its hash.");
  return fromUtf8(bytes);
}

/** @param {string} [tag] */
export async function search(tag) {
  const response = await fetch("/announce" + (tag ? `?tag=${encodeURIComponent(tag)}` : ""));
  if (!response.ok) return [];
  return /** @type {{address: string, name: string, tags: string[], online: boolean}[]} */ (
    (await response.json()).realms
  );
}

/** Load an example realm's files from this server. @param {string} folder */
export async function exampleFiles(folder) {
  const base = `/examples/${folder}/`;
  const sourceBytes = new Uint8Array(await (await fetch(base + "realm.json")).arrayBuffer());
  /** @type {RealmSource & {files?: string[]}} */
  const source = JSON.parse(fromUtf8(sourceBytes));
  const names = new Set([source.main, source.renderer, ...(source.files ?? [])]);
  /** @type {Map<string, Uint8Array<ArrayBuffer>>} */
  const files = new Map([["realm.json", sourceBytes]]);
  for (const name of names) {
    if (!name) continue;
    files.set(name, new Uint8Array(await (await fetch(base + name)).arrayBuffer()));
  }
  return files;
}
