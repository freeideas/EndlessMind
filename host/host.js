// The host program: referees a realm without a browser. It is a peer like any
// other: it holds the realm's key, connects to a helper server, and answers
// visitors with the same signed messages a browser tab would.
//
// Three uses:
//   - keep a realm up all the time (a browser tab must stay open; this need not);
//   - run rules that stay private, on the maker's own machine, where they can
//     do what a sandbox forbids, such as asking an AI model;
//   - show how any program outside a browser (a game engine, say) joins in.
//
// Usage: deno task host --server https://example.org --realm ./my-realm [--keys FILE] [--address ADDRESS]
//        deno task host --server https://example.org --keys FILE [--address ADDRESS]
//
// With --realm, the realm's files are read from that folder each time, so
// starting again publishes the folder's current version under the same key.
// Without it, the realm comes from the key file alone (one written by this
// program, or by "Save full backup" in the browser app). The rules run directly,
// not in a sandbox: host only realms you wrote or trust.

import { checkAnnouncement, makeAnnouncement, makeManifest, manifestBody, releaseOf } from "../shared/announce.js";
import { addressOf, hashOf, keyPairFromSecret, newPortableKey } from "../shared/crypto.js";
import { directRules, referee } from "../shared/referee.js";
import { Relay } from "../shared/relay.js";
import { KEY_FORMAT, bundleFiles, checkKeyFormat, encodeFile } from "../shared/bundle.js";
import { fileStorage } from "./storage.js";

const FORMAT = KEY_FORMAT;

/**
 * @typedef {object} HostOptions
 * @property {string} server      the helper server's web address, e.g. "https://example.org"
 * @property {string} [realmDir]  folder holding realm.json and the realm's files
 * @property {string} keysFile    key file to read, and (with realmDir) to write
 * @property {string} [address]   which realm in the key file, if it holds several
 * @property {(text: string) => void} [log]
 */

/** @param {HostOptions} options */
export async function startHost(options) {
  const log = options.log ?? console.log;
  const server = new URL(options.server);
  const keyFile = await readKeyFile(options.keysFile);

  /** @type {import("../shared/envelope.js").Envelope} */
  let manifest;
  /** @type {CryptoKeyPair} */
  let keys;
  let rulesModule;
  /** Public files, by name. @type {Record<string, Uint8Array<ArrayBuffer>>} */
  const files = {};

  if (options.realmDir) {
    const dir = new URL(options.realmDir.replace(/\/?$/, "/"), `file://${Deno.cwd()}/`);
    /** @type {import("../shared/announce.js").RealmSource} */
    const source = JSON.parse(await Deno.readTextFile(new URL("realm.json", dir)));
    const names = new Set([source.privateRules ? undefined : source.main, source.renderer, ...(source.files ?? [])]);
    /** @type {Record<string, string>} */
    const hashes = {};
    for (const name of names) {
      if (!name) continue;
      files[name] = await Deno.readFile(new URL(name, dir));
      hashes[name] = await hashOf(files[name]);
    }
    const body = manifestBody(source, hashes);
    // A key file made for one folder holds one realm, whatever the realm is called now: renaming must not
    // change its address. Only a file holding several realms is searched by name.
    const saved = options.address
      ? keyFile.realms.find((r) => r.address === options.address)
      : keyFile.realms.length === 1 ? keyFile.realms[0] : keyFile.realms.find((r) => r.name === body.name);
    if (options.address && !saved) throw new Error(`The key file holds no realm with the address ${options.address}.`);
    const secret = saved?.secret ?? (await newPortableKey()).secret;
    keys = await keyPairFromSecret(secret);
    manifest = await makeManifest(keys, body);
    rulesModule = (await import(new URL(/** @type {string} */ (source.main), dir).href)).default;
    await writeKeyFile(options.keysFile, keyFile.raw, saved?.entry, { secret, manifest,
      files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, encodeFile(bytes)])), storage:saved?.entry.storage });
  } else {
    const saved = options.address ? keyFile.realms.find((r) => r.address === options.address) : keyFile.realms[0];
    if (!saved) throw new Error("The key file holds no such realm. Give --realm to host a realm from its folder.");
    const main = saved.entry.manifest?.body?.main;
    if (!main || typeof saved.entry.files?.[main] !== "string") {
      throw new Error(`${saved.name} keeps its rules private, so they are not in the key file. Give --realm to host it from its folder.`);
    }
    keys = await keyPairFromSecret(saved.secret);
    manifest = saved.entry.manifest;
    Object.assign(files, await bundleFiles(keyFile.raw, saved.entry));
    rulesModule = (await import("data:text/javascript;base64," + encodeFile(files[main]))).default;
  }

  const address = await addressOf(keys.publicKey);
  const body = /** @type {import("../shared/announce.js").ManifestBody} */ (manifest.body);
  for (const [name, hash] of Object.entries(body.files)) {
    if (!files[name] || await hashOf(files[name]) !== hash) throw new Error(`Missing or changed file: ${name}`);
  }
  /** @param {unknown} note */
  async function post(note) {
    const reply = await fetch(new URL("/announce", server), { method: "POST", body: JSON.stringify(note) });
    if (!reply.ok) throw new Error(`Announcing failed: ${(await reply.json()).error}`);
    await reply.body?.cancel();
  }
  async function announce() {
    await post(await makeAnnouncement(keys, manifest));
    // With public rules the release also stands without the key: anyone can play their own copy.
    if (body.main) await post(body);
  }
  // A server takes only files that an announced realm lists, so announce first.
  await announce();
  for (const [name, hash] of Object.entries(body.files)) {
    const reply = await fetch(new URL(`/blob/${hash}`, server), { method: "PUT", body: files[name] });
    if (!reply.ok) throw new Error(`Upload of ${name} failed: ${(await reply.json()).error}`);
    await reply.body?.cancel();
  }

  const entry = keyFile.realms.find(r => r.address === address)?.entry;
  const storage = await fileStorage(`${options.keysFile}.${address}.state.json`, entry?.storage);
  const rules = await directRules(rulesModule, storage);
  const relay = new Relay(`${server.protocol === "https:" ? "wss" : "ws"}://${server.host}/ws`);
  let ref;
  try {
    await relay.connect();
    ref = await referee({ address, keys, name: body.name, release:await releaseOf(manifest), rules, relay, announce, status: log, onStop:() => relay.close() });
  } catch (e) { rules.stop(); relay.close(); throw e; }
  const link = `${server.origin}/#emind:${address}?via=${encodeURIComponent(server.origin)}`;
  log(`Hosting ${body.name}${body.main ? "" : " (private rules)"}: ${link}`);
  return {
    address,
    link,
    stop() {
      ref.stop();
      relay.close();
    },
  };
}

/**
 * @param {string} path
 * @returns {Promise<{ raw: any, realms: { address: string, name: string, secret: string, entry: any }[] }>}
 */
async function readKeyFile(path) {
  let raw;
  try {
    raw = JSON.parse(await Deno.readTextFile(path));
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
    return { raw: { format: FORMAT, realms: [] }, realms: [] };
  }
  checkKeyFormat(raw?.format);
  const realms = [];
  for (const entry of Array.isArray(raw.realms) ? raw.realms : []) {
    const keys = await keyPairFromSecret(entry.secret);
    if (!await checkAnnouncement(await makeAnnouncement(keys, entry.manifest))) throw new Error("A realm does not match its key.");
    const files = await bundleFiles(raw, entry);
    entry.files = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, encodeFile(bytes)]));
    realms.push({ address: await addressOf(keys.publicKey), name: String(entry.manifest?.body?.name), secret: entry.secret, entry });
  }
  raw.format = FORMAT;
  return { raw, realms };
}

/**
 * Save the realm into the key file, keeping whatever else the file holds.
 * @param {string} path @param {any} raw @param {unknown} oldEntry @param {unknown} entry
 */
async function writeKeyFile(path, raw, oldEntry, entry) {
  const realms = (Array.isArray(raw.realms) ? raw.realms : []).filter((/** @type {unknown} */ r) => r !== oldEntry);
  const folder = path.replace(/[^/\\]*$/, "");
  if (folder) await Deno.mkdir(folder, { recursive: true });
  // Whoever can read this file holds the realm, so keep it to this user.
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await Deno.writeTextFile(temp, JSON.stringify({ ...raw, format: FORMAT, realms: [...realms, entry] }, null, 1), { mode: 0o600 });
    await Deno.rename(temp, path);
  } finally { await Deno.remove(temp).catch(() => {}); }
}

/** Export keys, public files and the latest committed realm data. @param {string} keysFile @param {string} destination */
export async function exportBackup(keysFile, destination) {
  const {raw, realms} = await readKeyFile(keysFile);
  for (const realm of realms) {
    for (const name of Object.keys(realm.entry.manifest.body.files)) {
      if (!Object.hasOwn(realm.entry.files, name)) throw new Error(`Cannot make a full backup: missing file ${name}.`);
    }
    const storage = await fileStorage(`${keysFile}.${realm.address}.state.json`, realm.entry.storage);
    realm.entry.storage = await storage.snapshot();
  }
  const folder = destination.replace(/[^/\\]*$/, "");
  if (folder) await Deno.mkdir(folder, {recursive:true});
  const temp = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    await Deno.writeTextFile(temp, JSON.stringify(raw, null, 1), {mode:0o600});
    await Deno.rename(temp, destination);
  } finally { await Deno.remove(temp).catch(() => {}); }
}

if (import.meta.main) {
  /** @type {Record<string, string>} */
  const args = {};
  for (let i = 0; i < Deno.args.length; i++) {
    if (Deno.args[i].startsWith("--")) args[Deno.args[i].slice(2)] = Deno.args[i + 1] ?? "";
  }
  if (args.backup && args.keys) {
    await exportBackup(args.keys, args.backup);
    Deno.exit(0);
  }
  if (!args.server || !(args.realm || args.keys)) {
    console.error("Usage: deno task host --server https://example.org --realm ./my-realm [--keys FILE] [--address ADDRESS]");
    Deno.exit(2);
  }
  const folderName = (args.realm ?? "").replace(/[/\\]+$/, "").split(/[/\\]/).pop();
  await startHost({
    server: args.server,
    realmDir: args.realm,
    keysFile: args.keys ?? `./keys/${folderName}.json`,
    address: args.address,
  });
}
