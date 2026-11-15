// Releases: one exact version of a game, packed so that anyone can fetch it, check it and run it.
// Among a release's files is a release note signed by the realm, which proves whose game this is and
// carries the fingerprint of every other file. The release's ID is the SHA-256 of the note's signed
// bytes, so the ID covers every byte, and whoever hands a release on need not be trusted. Hosts fetch
// releases from each other over HTTPS. See "Releases" in specs/PROTOCOL.md.
//
//   pack({ folder, store })          make a release from a game's folder; returns its ID
//   checkRelease(store, id)          check a release in the store, every byte of it
//   fetchRelease({ store, id, from }) copy a release from one of the addresses that hand it out, then check it
//   findRelease({ store, realm, hosts })  the newest release of a realm in the store that checks out (one
//                                    that does not is removed); if there is none, the newest the known
//                                    hosts offer, fetched
//   newerRelease({ store, than, hosts, passed })  a release of the same realm newer than `than`, fetched,
//                                    or null
//   serveRelease(store, ids, request) answer another host that asks for a release
//   removeRelease(store, id)         take a release out of the store
//
// The store is a folder: `releases/<ID>/files/...`, the note among them, and `releases/<ID>/files.json`,
// the list of the other files that the note's fingerprint covers, as it is handed to other hosts.

import { join } from "node:path";
import { hex, isId, signerFromWords } from "../shared/keys.js";
import { addSignature, canonical, isComplete, signedBytes } from "../shared/signed.js";
import { secretWords } from "../realm/realm.js";

export const CALLS = 1; // the version of the game server's calls this host program speaks
const GAME_FILES = ["game.js", "game.wasm"]; // a game holds one of them
export const NOTE = "endlessmind-release.json"; // the release note's name among the files
const MAX_FILES = 500;
const MAX_BYTES = 50 * 1024 * 1024; // the most a release may hold
const MAX_NOTE = 64 * 1024; // the longest release note read from another host
const MAX_LIST = 128 * 1024; // the longest list of files read from another host
const ID = /^[0-9a-f]{64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
/** One part of a file's path: nothing hidden, nothing that climbs out, nothing a system treats specially. */
const PART = /^[A-Za-z0-9_][A-Za-z0-9._ -]{0,99}$/;

/** @param {unknown} id */
export const isReleaseId = (id) => typeof id === "string" && ID.test(id);

/**
 * @typedef {{ path: string, size: number, sha256: string }} FileFact
 * @typedef {[string, number, string]} Row one file the note's fingerprint covers: its path, size and SHA-256
 * @typedef {{ id: string, realm: string, note: any, folder: string }} Release
 * `folder` holds the release's files; `note` is its release note.
 */

const text = new TextEncoder();

/** @param {Uint8Array} bytes */
const sha256 = async (bytes) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", /** @type {Uint8Array<ArrayBuffer>} */ (bytes))));

/** The files a note's fingerprint covers: every file but the note itself, sorted by path. @param {FileFact[]} facts @returns {Row[]} */
const rowsOf = (facts) => facts.filter((file) => file.path !== NOTE).map(({ path, size, sha256 }) => [path, size, sha256]);

/** The fingerprint a note carries for those files. @param {Row[]} rows */
const contentOf = (rows) => sha256(text.encode(canonical(rows)));

/** A release's ID: the SHA-256 of its note's signed bytes, or null if it is no signed JSON at all. @param {any} note */
async function idOf(note) {
  try {
    return note && typeof note === "object" && !Array.isArray(note) ? await sha256(signedBytes(note)) : null;
  } catch {
    return null;
  }
}

/** Every file under a folder that is not hidden, as paths with "/" between parts, sorted. @param {string} folder */
async function filesIn(folder) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} under */
  async function walk(under) {
    for await (const entry of Deno.readDir(join(folder, under))) {
      const path = under ? `${under}/${entry.name}` : entry.name;
      if (entry.name.startsWith(".")) continue;
      if (entry.isSymlink || !PART.test(entry.name)) throw new Error(`A release cannot hold ${path}: plain names and plain files only.`);
      if (entry.isDirectory) await walk(path);
      else found.push(path);
    }
  }
  await walk("");
  return found.sort((a, b) => (a < b ? -1 : 1));
}

/**
 * Read files and say what each one is: its size and its SHA-256.
 * @param {string} folder @param {string[]} paths
 * @returns {Promise<FileFact[]>}
 */
async function measure(folder, paths) {
  if (paths.length > MAX_FILES) throw new Error(`A release may hold at most ${MAX_FILES} files.`);
  /** @type {FileFact[]} */
  const facts = [];
  let total = 0;
  for (const path of paths) {
    const bytes = await Deno.readFile(join(folder, path));
    if ((total += bytes.length) > MAX_BYTES) throw new Error(`A release may hold at most ${MAX_BYTES / 1024 / 1024} MB.`);
    facts.push({ path, size: bytes.length, sha256: await sha256(bytes) });
  }
  return facts;
}

/** @param {string} store @param {string} id */
const placeOf = (store, id) => join(store, "releases", id);

/**
 * Make a release from a game's folder, signed by the game's realm. Packing the same files again
 * gives the same release, because the note is kept beside the realm's secret phrase: in `data`, which
 * is `.data/` in the folder unless given.
 * `secretFile` holds the realm's secret phrase: `realm-secret.txt` in `data` unless given.
 * @param {{ folder: string, store: string, data?: string, secretFile?: string, now?: () => number }} options
 * @returns {Promise<Release>}
 */
export async function pack(options) {
  const folder = await Deno.realPath(options.folder);
  const data = options.data ?? join(folder, ".data");
  await Deno.mkdir(data, { recursive: true });
  const signer = await signerFromWords(await secretWords(options.secretFile ?? join(data, "realm-secret.txt")));
  const paths = await filesIn(folder);
  for (const needed of ["card.json", "index.html"]) if (!paths.includes(needed)) throw new Error(`A game's folder needs ${needed}.`);
  if (GAME_FILES.filter((name) => paths.includes(name)).length !== 1) throw new Error("A game's folder holds game.js or game.wasm, one of them.");
  if (paths.includes(NOTE)) throw new Error(`A game's folder cannot hold a file named ${NOTE}.`);
  const { name, description, tags, picture } = JSON.parse(await Deno.readTextFile(join(folder, "card.json")));
  const rows = rowsOf(await measure(folder, paths));
  const content = await contentOf(rows);

  // Keep the note from last time if the files have not changed, so the release keeps its ID.
  /** @type {any} */
  let note = null;
  try {
    note = JSON.parse(await Deno.readTextFile(join(data, NOTE)));
  } catch {
    note = null;
  }
  if (!note || note.content !== content || note.signers?.[0] !== signer.id || note.calls !== CALLS || !(await isComplete(note))) {
    const card = { name, description, ...(tags ? { tags } : {}), ...(picture ? { picture } : {}) };
    note = await addSignature({ v: 1, type: "release", signers: [signer.id], time: (options.now ?? Date.now)(), calls: CALLS, card, content }, signer);
    await Deno.writeTextFile(join(data, NOTE), JSON.stringify(note, null, 2) + "\n");
  }

  // Lay the release out under a name of its own, then move it to its ID.
  const making = join(options.store, "releases", "making-" + hex(crypto.getRandomValues(new Uint8Array(8))));
  const files = join(making, "files");
  for (const path of paths) {
    await Deno.mkdir(join(files, path, ".."), { recursive: true });
    await Deno.copyFile(join(folder, path), join(files, path));
  }
  await Deno.copyFile(join(data, NOTE), join(files, NOTE));
  await Deno.writeTextFile(join(making, "files.json"), canonical(rows));
  const id = /** @type {string} */ (await idOf(note));
  const place = placeOf(options.store, id);
  await Deno.remove(place, { recursive: true }).catch(() => {});
  await Deno.rename(making, place);
  return checkRelease(options.store, id);
}

/**
 * Check a release in the store against its ID, every byte, and its note against its realm. Throws if
 * anything is off; nothing from a release is run or served before this passes.
 * @param {string} store @param {string} id
 * @returns {Promise<Release>}
 */
export async function checkRelease(store, id) {
  if (!isReleaseId(id)) throw new Error("A release's ID is 64 letters and digits.");
  const place = placeOf(store, id);
  const folder = join(place, "files");
  const note = JSON.parse(await Deno.readTextFile(join(folder, NOTE)));
  if ((await idOf(note)) !== id) throw new Error(`Release ${id} does not match its ID.`);
  const facts = await measure(folder, await filesIn(folder));
  const rows = rowsOf(facts);
  if (note.content !== (await contentOf(rows))) throw new Error(`Release ${id} holds files its note does not cover.`);

  const realm = note?.signers?.[0];
  const good = note.v === 1 && note.type === "release" && Array.isArray(note.signers) && note.signers.length === 1 && isId(realm) &&
    typeof note.card?.name === "string" && typeof note.card?.description === "string" && Number.isSafeInteger(note.time) && (await isComplete(note));
  if (!good) throw new Error(`Release ${id} is not signed by its realm.`);
  if (!Number.isInteger(note.calls) || note.calls < 1 || note.calls > CALLS) throw new Error(`Release ${id} needs a newer host program.`);
  if (!facts.some((fact) => fact.path === "index.html")) throw new Error(`Release ${id} has no index.html.`);
  if (GAME_FILES.filter((name) => facts.some((fact) => fact.path === name)).length !== 1) throw new Error(`Release ${id} holds neither game.js nor game.wasm, or both.`);
  // The list handed to other hosts is the one just checked.
  const list = canonical(rows);
  if ((await Deno.readTextFile(join(place, "files.json")).catch(() => "")) !== list) await Deno.writeTextFile(join(place, "files.json"), list);
  return { id, realm, note, folder };
}

/**
 * Read a list of files sent by another host, and check that it is the one a note's fingerprint covers.
 * @param {unknown} list @param {any} note @param {string} id
 * @returns {Promise<Row[]>}
 */
async function readList(list, note, id) {
  let total = 0;
  const good = Array.isArray(list) && list.length < MAX_FILES && list.every((row, i) => {
    const [path, size, sum] = Array.isArray(row) && row.length === 3 ? row : [];
    total += size;
    return typeof path === "string" && path !== NOTE && path.split("/").every((part) => PART.test(part)) && (i === 0 || list[i - 1][0] < path) &&
      Number.isSafeInteger(size) && size >= 0 && typeof sum === "string" && SHA256.test(sum);
  }) && total <= MAX_BYTES;
  if (!good || (await contentOf(/** @type {Row[]} */ (list))) !== note.content) throw new Error(`That is not the list of files of release ${id}.`);
  return /** @type {Row[]} */ (list);
}

/**
 * Copy a release into the store, then check it. Each address in `from` is tried in turn: a host's
 * main address, or a relayed game's. What is sent is believed only as far as it matches the ID: the
 * note first, whose signed bytes hash to the ID; then the list of the other files, which hashes to the
 * note's `content`; then each file, which must match its line in the list.
 * @param {{ store: string, id: string, from: string[] }} options
 * @returns {Promise<Release>}
 */
export async function fetchRelease({ store, id, from }) {
  if (!isReleaseId(id)) throw new Error("A release's ID is 64 letters and digits.");
  /** @type {string[]} */
  const failed = [];
  for (const address of from) {
    const place = placeOf(store, id);
    try {
      const base = new URL("endlessmind/release/", address).href;
      /** @param {string} name @param {number} most */
      const get = async (name, most) => {
        const answer = await fetch(base + name, { redirect: "error" });
        if (!answer.ok) throw new Error(`${base + name} answered ${answer.status}`);
        const bytes = new Uint8Array(await answer.arrayBuffer());
        if (bytes.length > most) throw new Error(`${base + name} sent too much`);
        return bytes;
      };
      const noteBytes = await get(`${id}/${NOTE}`, MAX_NOTE);
      const note = JSON.parse(new TextDecoder().decode(noteBytes));
      if ((await idOf(note)) !== id) throw new Error(`That is not the note of release ${id}.`);
      const rows = await readList(JSON.parse(new TextDecoder().decode(await get(`${id}.json`, MAX_LIST))), note, id);
      await Deno.remove(place, { recursive: true }).catch(() => {});
      await Deno.mkdir(join(place, "files"), { recursive: true });
      await Deno.writeFile(join(place, "files", NOTE), noteBytes);
      for (const [path, size, sum] of rows) {
        const bytes = await get(`${id}/${path.split("/").map(encodeURIComponent).join("/")}`, size);
        if (bytes.length !== size || (await sha256(bytes)) !== sum) throw new Error(`${path} is not the file the release names.`);
        await Deno.mkdir(join(place, "files", path, ".."), { recursive: true });
        await Deno.writeFile(join(place, "files", path), bytes);
      }
      return await checkRelease(store, id);
    } catch (error) {
      await Deno.remove(place, { recursive: true }).catch(() => {});
      failed.push(`${address}: ${error instanceof Error ? error.message : error}`);
    }
  }
  throw new Error(`Release ${id} could not be fetched. ${failed.join("; ") || "No known host runs it."}`);
}

/**
 * The newest release of a realm in the store, checked, or null if there is none. One of the realm's
 * that fails the check is removed, so that it is fetched again.
 * @param {string} store @param {string} realm
 */
async function storedRelease(store, realm) {
  /** @type {Release | null} */
  let best = null;
  try {
    for await (const entry of Deno.readDir(join(store, "releases"))) {
      if (!isReleaseId(entry.name)) continue;
      try {
        const note = JSON.parse(await Deno.readTextFile(join(placeOf(store, entry.name), "files", NOTE)));
        if (note?.signers?.[0] !== realm || (best && note.time <= best.note.time)) continue;
        try {
          best = await checkRelease(store, entry.name);
        } catch {
          // Damaged: removed, so that it is fetched again from the known hosts.
          await removeRelease(store, entry.name);
        }
      } catch {
        // No readable note, so whose it is cannot be told here. If a known host offers it, it is checked then.
      }
    }
  } catch {
    // No releases yet.
  }
  return best;
}

/**
 * The newest release of a realm to be had, checked. Without `than`, one already in the store will do;
 * if there is none, the newest that the known hosts offer is fetched, and an error is thrown if none can
 * be. With `than`, only a release newer than that one is wanted, by the `time` in its note, and null
 * comes back if none can be had. A release found to be no newer, or not the realm's, is removed from
 * the store and its ID added to `passed`, which is never fetched again.
 * @param {{ store: string, realm: string, hosts: Pick<import("./hosts.js").Hosts, "releases">, than?: Release | null, passed?: Set<string> }} options
 * @returns {Promise<Release | null>}
 */
async function newestRelease({ store, realm, hosts, than = null, passed = new Set() }) {
  const offered = [...(await hosts.releases(realm))].filter(([id, { time }]) => id !== than?.id && !passed.has(id) && (time === null || !than || time > than.note.time));
  // The newest a host's card claims first; one only a relayed game names last, since nothing says how new it is.
  offered.sort(([, a], [, b]) => (b.time ?? -Infinity) - (a.time ?? -Infinity));
  let best = than;
  for (const [id, { time, from }] of offered) {
    if (best && best !== than && time !== null && time <= best.note.time) continue;
    // One already in the store is running here, or was already weighed: fetching it again could only
    // disturb it. One that is damaged is removed and fetched again.
    if (await Deno.stat(placeOf(store, id)).then(() => true, () => false)) {
      if (await checkRelease(store, id).then(() => true, () => false)) continue;
      await removeRelease(store, id);
    }
    let release;
    try {
      release = await fetchRelease({ store, id, from });
    } catch {
      continue; // Asked again next time.
    }
    if (release.realm !== realm || (best && release.note.time <= best.note.time)) {
      passed.add(id);
      await removeRelease(store, id);
      continue;
    }
    if (best && best !== than) {
      passed.add(best.id);
      await removeRelease(store, best.id);
    }
    best = release;
  }
  return best === than ? null : best;
}

/**
 * A release of a realm, ready to run: the newest in the store if there is one, or else the newest the
 * known hosts offer, fetched and checked.
 * @param {{ store: string, realm: string, hosts: Pick<import("./hosts.js").Hosts, "releases"> }} options
 * @returns {Promise<Release>}
 */
export async function findRelease({ store, realm, hosts }) {
  if (!isId(realm)) throw new Error(`${realm} is not a realm's ID.`);
  const found = (await storedRelease(store, realm)) ?? (await newestRelease({ store, realm, hosts }));
  if (!found) throw new Error(`A release of realm ${realm} could not be fetched from the known hosts.`);
  return found;
}

/**
 * A release of a realm newer than the one given, fetched and checked, or null if the known hosts offer
 * none. `passed` collects the IDs of releases found to be no newer, so they are not fetched again.
 * @param {{ store: string, than: Release, hosts: Pick<import("./hosts.js").Hosts, "releases">, passed: Set<string> }} options
 */
export function newerRelease({ store, than, hosts, passed }) {
  return newestRelease({ store, realm: than.realm, hosts, than, passed });
}

/** Take a release out of the store. What its players saved is kept elsewhere. @param {string} store @param {string} id */
export async function removeRelease(store, id) {
  if (isReleaseId(id)) await Deno.remove(placeOf(store, id), { recursive: true }).catch(() => {});
}

/**
 * Answer a request for a release under `endlessmind/release/`: the list of its files but the note at
 * `<ID>.json`, and each file, the note among them, at `<ID>/<path>`. Only releases in `ids` are served.
 * Returns null for any other address.
 * @param {string} store @param {Iterable<string>} ids @param {Request} request
 */
export async function serveRelease(store, ids, request) {
  const m = decodeURIComponent(new URL(request.url).pathname).match(/^\/endlessmind\/release\/([0-9a-f]{64})(\.json|\/(.+))$/);
  if (!m) return null;
  const missing = new Response("Not found", { status: 404 });
  if (![...ids].includes(m[1]) || (request.method !== "GET" && request.method !== "HEAD")) return missing;
  if (m[3] && !m[3].split("/").every((part) => PART.test(part))) return missing;
  try {
    const path = m[3] ? join(placeOf(store, m[1]), "files", m[3]) : join(placeOf(store, m[1]), "files.json");
    return new Response(await Deno.readFile(path), { headers: { "content-type": "application/octet-stream", "access-control-allow-origin": "*" } });
  } catch {
    return missing;
  }
}
