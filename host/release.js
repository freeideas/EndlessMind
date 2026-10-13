// Releases: one exact version of a game, packed so that anyone can fetch it, check it and run it.
// A release is a folder of files described by a torrent file, and its ID is that torrent's ID (its
// info-hash), so any torrent program can fetch and share it. Among the files is a release note signed
// by the realm, which is what proves whose game this is. See "Releases" in specs/PROTOCOL.md.
//
//   pack({ folder, store })          make a release from a game's folder; returns its ID
//   checkRelease(store, id)          check a release in the store, every byte of it
//   fetchRelease({ store, id, from }) copy a release from one of the addresses that hand it out, then check it
//   findRelease({ store, id, hosts }) the release from the store if it is there; if not, fetched from
//                                    whichever known host runs it
//   serveRelease(store, ids, request) answer another host that asks for a release
//   removeRelease(store, id)         take a release out of the store
//
// The store is a folder: `releases/<ID>/release.torrent` and `releases/<ID>/files/...`.

import { join } from "node:path";
import { hex, isId, signerFromWords } from "../shared/keys.js";
import { addSignature, canonical, isComplete } from "../shared/signed.js";
import { secretWords } from "../realm/realm.js";

export const CALLS = 1; // the version of the game server's calls this host program speaks
const GAME_FILES = ["game.js", "game.wasm"]; // a game holds one of them
export const NOTE = "endlessmind-release.json"; // the release note's name among the files
const PIECE = 256 * 1024; // the torrent's piece length
const MAX_FILES = 500;
const MAX_BYTES = 50 * 1024 * 1024; // the most a release may hold
const MAX_TORRENT = 1024 * 1024;
const ID = /^[0-9a-f]{40}$/;
/** One part of a file's path: nothing hidden, nothing that climbs out, nothing a system treats specially. */
const PART = /^[A-Za-z0-9_][A-Za-z0-9._ -]{0,99}$/;

/** @param {unknown} id */
export const isReleaseId = (id) => typeof id === "string" && ID.test(id);

/**
 * @typedef {{ path: string, size: number, sha256: string }} FileFact
 * @typedef {{ id: string, realm: string, note: any, folder: string }} Release
 * `folder` holds the release's files; `note` is its release note.
 */

const text = new TextEncoder();

/** Bencode, the torrent file format: integers, byte strings, lists, and dictionaries with sorted keys. @param {unknown} value @returns {Uint8Array} */
function bencode(value) {
  /** @type {Uint8Array[]} */
  const parts = [];
  /** @param {unknown} v */
  const put = (v) => {
    if (typeof v === "number") parts.push(text.encode(`i${v}e`));
    else if (typeof v === "string") put(text.encode(v));
    else if (v instanceof Uint8Array) parts.push(text.encode(`${v.length}:`), v);
    else if (Array.isArray(v)) {
      parts.push(text.encode("l"));
      v.forEach(put);
      parts.push(text.encode("e"));
    } else {
      const o = /** @type {Record<string, unknown>} */ (v);
      parts.push(text.encode("d"));
      for (const key of Object.keys(o).sort((a, b) => (a < b ? -1 : 1))) {
        put(key);
        put(o[key]);
      }
      parts.push(text.encode("e"));
    }
  };
  put(value);
  const all = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

/** Read bencode. Byte strings come back as bytes, dictionary keys as text. @param {Uint8Array} bytes @returns {any} */
function bdecode(bytes) {
  let at = 0;
  const latin = new TextDecoder("latin1");
  /** @returns {any} */
  const next = () => {
    const c = String.fromCharCode(bytes[at]);
    if (c === "i") {
      const end = bytes.indexOf(101, at);
      const n = Number(latin.decode(bytes.subarray(at + 1, end)));
      if (end < 0 || !Number.isSafeInteger(n)) throw new Error("bad torrent file");
      at = end + 1;
      return n;
    }
    if (c === "l" || c === "d") {
      at++;
      /** @type {any} */
      const made = c === "l" ? [] : {};
      while (bytes[at] !== 101) {
        if (at >= bytes.length) throw new Error("bad torrent file");
        if (c === "l") made.push(next());
        else made[new TextDecoder().decode(next())] = next();
      }
      at++;
      return made;
    }
    const colon = bytes.indexOf(58, at);
    const length = Number(latin.decode(bytes.subarray(at, colon)));
    if (colon < 0 || !Number.isSafeInteger(length) || length < 0 || colon + 1 + length > bytes.length) throw new Error("bad torrent file");
    at = colon + 1 + length;
    return bytes.slice(colon + 1, at);
  };
  const value = next();
  if (at !== bytes.length) throw new Error("bad torrent file");
  return value;
}

/** @param {"SHA-1" | "SHA-256"} how @param {Uint8Array} bytes */
const digest = async (how, bytes) => new Uint8Array(await crypto.subtle.digest(how, /** @type {Uint8Array<ArrayBuffer>} */ (bytes)));

/** The fingerprint of a release's files, which its note carries: every file but the note itself. @param {FileFact[]} files */
async function contentOf(files) {
  const rows = files.filter((file) => file.path !== NOTE).map(({ path, size, sha256 }) => [path, size, sha256]);
  return hex(await digest("SHA-256", text.encode(canonical(rows))));
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
 * Read files in order and work out what a torrent says about them.
 * @param {string} folder @param {string[]} paths
 * @returns {Promise<{ facts: FileFact[], pieces: Uint8Array }>}
 */
async function measure(folder, paths) {
  if (paths.length > MAX_FILES) throw new Error(`A release may hold at most ${MAX_FILES} files.`);
  /** @type {FileFact[]} */
  const facts = [];
  /** @type {Uint8Array[]} */
  const hashes = [];
  const piece = new Uint8Array(PIECE);
  let filled = 0, total = 0;
  for (const path of paths) {
    const bytes = await Deno.readFile(join(folder, path));
    if ((total += bytes.length) > MAX_BYTES) throw new Error(`A release may hold at most ${MAX_BYTES / 1024 / 1024} MB.`);
    facts.push({ path, size: bytes.length, sha256: hex(await digest("SHA-256", bytes)) });
    for (let at = 0; at < bytes.length;) {
      const take = Math.min(PIECE - filled, bytes.length - at);
      piece.set(bytes.subarray(at, at + take), filled);
      filled += take;
      at += take;
      if (filled === PIECE) {
        hashes.push(await digest("SHA-1", piece));
        filled = 0;
      }
    }
  }
  if (filled) hashes.push(await digest("SHA-1", piece.subarray(0, filled)));
  const pieces = new Uint8Array(hashes.length * 20);
  hashes.forEach((hash, i) => pieces.set(hash, i * 20));
  return { facts, pieces };
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
  const content = await contentOf((await measure(folder, paths)).facts);

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

  // Lay the release out under a name of its own, since its ID is known only once it is whole.
  const making = join(options.store, "releases", "making-" + hex(crypto.getRandomValues(new Uint8Array(8))));
  const files = join(making, "files");
  for (const path of paths) {
    await Deno.mkdir(join(files, path, ".."), { recursive: true });
    await Deno.copyFile(join(folder, path), join(files, path));
  }
  await Deno.copyFile(join(data, NOTE), join(files, NOTE));
  const all = [...paths, NOTE].sort((a, b) => (a < b ? -1 : 1));
  const { facts, pieces } = await measure(files, all);
  const info = { files: facts.map((file) => ({ length: file.size, path: file.path.split("/") })), name: signer.id, "piece length": PIECE, pieces };
  const id = hex(await digest("SHA-1", bencode(info)));
  await Deno.writeFile(join(making, "release.torrent"), bencode({ info }));
  const place = placeOf(options.store, id);
  await Deno.remove(place, { recursive: true }).catch(() => {});
  await Deno.rename(making, place);
  return { id, realm: signer.id, note, folder: join(place, "files") };
}

/**
 * Check a release in the store against its ID, every byte, and its note against its realm. Throws if
 * anything is off; nothing from a release is run or served before this passes.
 * @param {string} store @param {string} id
 * @returns {Promise<Release>}
 */
export async function checkRelease(store, id) {
  if (!isReleaseId(id)) throw new Error("A release's ID is 40 letters and digits.");
  const place = placeOf(store, id);
  const folder = join(place, "files");
  const { paths, info } = await readTorrent(await Deno.readFile(join(place, "release.torrent")), id);
  const { facts, pieces } = await measure(folder, paths.map((file) => file.path));
  const wrong = facts.some((fact, i) => fact.size !== paths[i].size) || pieces.length !== info.pieces.length || pieces.some((byte, i) => byte !== info.pieces[i]);
  if (wrong) throw new Error(`Release ${id} does not match its ID.`);
  const present = await filesIn(folder);
  if (present.length !== paths.length || present.some((path, i) => path !== paths[i].path)) throw new Error(`Release ${id} holds files its ID does not cover.`);

  const note = JSON.parse(await Deno.readTextFile(join(folder, NOTE)));
  const realm = note?.signers?.[0];
  const good = note.v === 1 && note.type === "release" && note.signers.length === 1 && isId(realm) && new TextDecoder().decode(info.name) === realm &&
    typeof note.card?.name === "string" && typeof note.card?.description === "string" && note.content === (await contentOf(facts)) && (await isComplete(note));
  if (!good) throw new Error(`Release ${id} is not signed by its realm.`);
  if (!Number.isInteger(note.calls) || note.calls < 1 || note.calls > CALLS) throw new Error(`Release ${id} needs a newer host program.`);
  if (!facts.some((fact) => fact.path === "index.html")) throw new Error(`Release ${id} has no index.html.`);
  if (GAME_FILES.filter((name) => facts.some((fact) => fact.path === name)).length !== 1) throw new Error(`Release ${id} holds neither game.js nor game.wasm, or both.`);
  return { id, realm, note, folder };
}

/**
 * Read a torrent file and check that it is the one with this ID.
 * @param {Uint8Array} bytes @param {string} id
 * @returns {Promise<{ paths: { path: string, size: number }[], info: any }>}
 */
async function readTorrent(bytes, id) {
  if (bytes.length > MAX_TORRENT) throw new Error("That torrent file is too big.");
  const torrent = bdecode(bytes);
  const info = torrent?.info;
  if (!info || hex(await digest("SHA-1", bencode(info))) !== id) throw new Error(`That is not the torrent file of release ${id}.`);
  if (info["piece length"] !== PIECE || !(info.pieces instanceof Uint8Array) || !(info.name instanceof Uint8Array) || !Array.isArray(info.files) || info.files.length > MAX_FILES) throw new Error(`Release ${id} is not laid out as a release.`);
  let total = 0;
  const paths = info.files.map((/** @type {any} */ file) => {
    const parts = Array.isArray(file?.path) ? file.path.map((/** @type {Uint8Array} */ part) => new TextDecoder().decode(part)) : [];
    if (!parts.length || !parts.every((/** @type {string} */ part) => PART.test(part)) || !Number.isSafeInteger(file.length) || file.length < 0) throw new Error(`Release ${id} names a file a release cannot hold.`);
    total += file.length;
    return { path: parts.join("/"), size: file.length };
  });
  if (total > MAX_BYTES || !paths.some((/** @type {{ path: string }} */ file) => file.path === NOTE)) throw new Error(`Release ${id} is not laid out as a release.`);
  return { paths, info };
}

/**
 * Copy a release into the store, then check it. Each address in `from` is tried in turn: a host's
 * main address, or a relayed game's. What is sent is believed only as far as it matches the ID.
 * @param {{ store: string, id: string, from: string[] }} options
 * @returns {Promise<Release>}
 */
export async function fetchRelease({ store, id, from }) {
  if (!isReleaseId(id)) throw new Error("A release's ID is 40 letters and digits.");
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
      const torrent = await get(`${id}.torrent`, MAX_TORRENT);
      const { paths } = await readTorrent(torrent, id);
      await Deno.remove(place, { recursive: true }).catch(() => {});
      await Deno.mkdir(join(place, "files"), { recursive: true });
      await Deno.writeFile(join(place, "release.torrent"), torrent);
      for (const { path, size } of paths) {
        await Deno.mkdir(join(place, "files", path, ".."), { recursive: true });
        await Deno.writeFile(join(place, "files", path), await get(`${id}/${path.split("/").map(encodeURIComponent).join("/")}`, size));
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
 * A release ready to run: checked if it is in the store; if it is not there, or is damaged, fetched
 * from whichever of the known hosts runs it, and checked.
 * @param {{ store: string, id: string, hosts: { sources(id: string): Promise<string[]> } }} options
 */
export async function findRelease({ store, id, hosts }) {
  if (!isReleaseId(id)) throw new Error("A release's ID is 40 letters and digits.");
  try {
    return await checkRelease(store, id);
  } catch {
    return fetchRelease({ store, id, from: await hosts.sources(id) });
  }
}

/** Take a release out of the store. What its players saved is kept elsewhere. @param {string} store @param {string} id */
export async function removeRelease(store, id) {
  if (isReleaseId(id)) await Deno.remove(placeOf(store, id), { recursive: true }).catch(() => {});
}

/**
 * Answer a request for a release under `endlessmind/release/`: its torrent file at `<ID>.torrent` and
 * each file at `<ID>/<path>`. Only releases in `ids` are served. Returns null for any other address.
 * @param {string} store @param {Iterable<string>} ids @param {Request} request
 */
export async function serveRelease(store, ids, request) {
  const m = decodeURIComponent(new URL(request.url).pathname).match(/^\/endlessmind\/release\/([0-9a-f]{40})(\.torrent|\/(.+))$/);
  if (!m) return null;
  const missing = new Response("Not found", { status: 404 });
  if (![...ids].includes(m[1]) || (request.method !== "GET" && request.method !== "HEAD")) return missing;
  if (m[3] && !m[3].split("/").every((part) => PART.test(part))) return missing;
  try {
    const path = m[3] ? join(placeOf(store, m[1]), "files", m[3]) : join(placeOf(store, m[1]), "release.torrent");
    return new Response(await Deno.readFile(path), { headers: { "content-type": "application/octet-stream", "access-control-allow-origin": "*" } });
  } catch {
    return missing;
  }
}
