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
//        deno task host --keys FILE --pass OUT [--days 30] [--realm ./my-realm] [--address ADDRESS]
//
// The last form hosts nothing. It writes a referee pass: a file holding a
// fresh referee key and the realm key's signed word that this key may referee
// until the pass runs out. Host from that file on the always-on machine, and
// the realm's own key never has to leave the machine it was made on.
//
// With --realm, the realm's files are read from that folder each time, so
// starting again publishes the folder's current version under the same key.
// Without it, the realm comes from the key file alone (one written by this
// program, or by "Save full backup" in the browser app). The rules run directly,
// not in a sandbox: host only realms you wrote or trust.

import { checkAnnouncement, checkPass, makeAnnouncement, makeManifest, makePass, manifestBody, releaseOf } from "../shared/announce.js";
import { addressOf, hashOf, keyPairFromSecret, newPortableKey } from "../shared/crypto.js";
import { canonicalJson } from "../shared/encoding.js";
import { directRules, referee } from "../shared/referee.js";
import { Relays } from "../shared/relay.js";
import { KEY_FORMAT, bundleFiles, checkKeyFormat, encodeFile } from "../shared/bundle.js";
import { fileStorage } from "./storage.js";

const FORMAT = KEY_FORMAT;

/**
 * @typedef {object} HostOptions
 * @property {string} server      the helper server's web address, e.g. "https://example.org"; several, separated by commas
 * @property {string} [realmDir]  folder holding realm.json and the realm's files
 * @property {string} keysFile    key file to read, and (with realmDir) to write
 * @property {string} [address]   which realm in the key file, if it holds several
 * @property {(text: string) => void} [log]
 */

/**
 * Read the realm to host: from its folder (signing its current version, when
 * the realm's own key is at hand) or from the key file alone.
 * @param {{ realmDir?: string, keysFile: string, address?: string }} options
 */
async function loadRealm(options) {
  const keyFile = await readKeyFile(options.keysFile);

  /** @type {import("../shared/envelope.js").Envelope} */
  let manifest;
  /** The key that will referee: the realm's own, or one it gave a pass to. @type {CryptoKeyPair} */
  let keys;
  /** @type {import("../shared/envelope.js").Envelope | undefined} */
  let pass;
  let rulesModule, secret = "";
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
    rulesModule = (await import(new URL(/** @type {string} */ (source.main), dir).href)).default;
    // A key file made for one folder holds one realm, whatever the realm is called now: renaming must not
    // change its address. Only a file holding several realms is searched by name.
    const saved = options.address
      ? keyFile.realms.find((r) => r.address === options.address)
      : keyFile.realms.length === 1 ? keyFile.realms[0] : keyFile.realms.find((r) => r.name === body.name);
    if (options.address && !saved) throw new Error(`The key file holds no realm with the address ${options.address}.`);
    if (saved?.entry.pass) {
      // A pass cannot sign a new version: the folder must be the version the realm's key signed.
      manifest = saved.entry.manifest;
      pass = saved.entry.pass;
      keys = await keyPairFromSecret(saved.secret);
      if (canonicalJson(/** @type {any} */ (manifest.body).files) !== canonicalJson(hashes)) {
        throw new Error("The folder has changed since this pass was made. Make a new pass where the realm's key is kept.");
      }
      return { manifest, keys, pass, rulesModule, files, secret: "", keyFile };
    }
    secret = saved?.secret ?? (await newPortableKey()).secret;
    keys = await keyPairFromSecret(secret);
    manifest = await makeManifest(keys, body);
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
    pass = saved.entry.pass;
    secret = pass ? "" : saved.secret;
    Object.assign(files, await bundleFiles(keyFile.raw, saved.entry));
    rulesModule = (await import("data:text/javascript;base64," + encodeFile(files[main]))).default;
  }
  return { manifest, keys, pass, rulesModule, files, secret, keyFile };
}

/** @param {HostOptions} options */
export async function startHost(options) {
  const log = options.log ?? console.log;
  // Several servers, separated by commas: the realm is refereed on all of them at once, so no one server
  // holds its life in its hands.
  const servers = options.server.split(",").map((s) => new URL(s.trim()));
  const origins = servers.map((s) => s.origin);
  const { manifest, keys, pass, rulesModule, files, keyFile } = await loadRealm(options);

  // The realm is known by its own key's address, whichever key referees.
  const address = manifest.from;
  const body = /** @type {import("../shared/announce.js").ManifestBody} */ (manifest.body);
  for (const [name, hash] of Object.entries(body.files)) {
    if (!files[name] || await hashOf(files[name]) !== hash) throw new Error(`Missing or changed file: ${name}`);
  }
  /** @param {URL} server @param {string} path @param {string} method @param {BodyInit} content @param {string} what */
  async function put(server, path, method, content, what) {
    // A server that takes the connection and then says nothing must not hold up the others.
    const reply = await fetch(new URL(path, server), { method, body: content, signal: AbortSignal.timeout(20_000) });
    if (!reply.ok) throw new Error(`${what} failed on ${server.origin}: ${(await reply.json()).error}`);
    await reply.body?.cancel();
  }
  /** Announce on one server, and give it the files if asked. @param {URL} server @param {boolean} withFiles */
  async function publish(server, withFiles) {
    // A server takes only files that an announced realm lists, so announce first.
    await put(server, "/announce", "POST", JSON.stringify(await makeAnnouncement(keys, manifest, { pass, servers: origins })), "Announcing");
    // With public rules the release also stands without the key: anyone can play their own copy.
    if (body.main) await put(server, "/announce", "POST", JSON.stringify(body), "Announcing");
    if (!withFiles) return;
    for (const [name, hash] of Object.entries(body.files)) await put(server, `/blob/${hash}`, "PUT", files[name], `Upload of ${name}`);
  }
  /** Enough that one server takes it; the rest are told again at the next renewal. @param {boolean} withFiles */
  async function everywhere(withFiles) {
    const results = await Promise.allSettled(servers.map((server) => publish(server, withFiles)));
    const failed = /** @type {PromiseRejectedResult[]} */ (results.filter((r) => r.status === "rejected"));
    if (failed.length === servers.length) throw failed[0].reason;
    for (const f of failed) log(String(f.reason));
  }
  await everywhere(true);

  const entry = keyFile.realms.find(r => r.address === address)?.entry;
  const storage = await fileStorage(`${options.keysFile}.${address}.state.json`, entry?.storage);
  const rules = await directRules(rulesModule, storage);
  const relay = new Relays(servers.map((server) => `${server.protocol === "https:" ? "wss" : "ws"}://${server.host}/ws`));
  let ref;
  try {
    await relay.connect();
    ref = await referee({ address: await addressOf(keys.publicKey), keys, name: body.name, release:await releaseOf(manifest), rules, relay, realm: address, pass,
      announce: () => everywhere(true), status: log, onStop:() => relay.close() });
  } catch (e) { rules.stop(); relay.close(); throw e; }
  const link = `${origins[0]}/#emind:${address}?via=${origins.map(encodeURIComponent).join(",")}`;
  const until = pass ? `, under a pass that runs out on ${new Date(/** @type {any} */ (pass.body).expires).toDateString()}` : "";
  log(`Hosting ${body.name}${body.main ? "" : " (private rules)"}${until}: ${link}`);
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
    if (entry.pass && !await checkPass(entry.pass)) throw new Error("A referee pass in this file has run out. Make a new one where the realm's key is kept.");
    if (!await checkAnnouncement(await makeAnnouncement(keys, entry.manifest, { pass: entry.pass }))) throw new Error("A realm does not match its key.");
    const files = await bundleFiles(raw, entry);
    entry.files = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, encodeFile(bytes)]));
    realms.push({ address: entry.manifest.from, name: String(entry.manifest?.body?.name), secret: entry.secret, entry });
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

/**
 * Write a referee pass file: everything needed to referee the realm for a
 * while, without the realm's own key. With a folder, its current version is
 * signed first.
 * @param {{ realmDir?: string, keysFile: string, address?: string }} options @param {string} destination @param {number} days
 */
export async function writePass(options, destination, days) {
  // Writing the pass over the key file would destroy the realm's own key for good.
  const same = await Promise.all([options.keysFile, destination].map((f) => Deno.realPath(f).catch(() => f)));
  if (same[0] === same[1]) throw new Error("Give the pass a file of its own, not the key file.");
  const there = await Deno.readTextFile(destination).then(JSON.parse, () => null);
  if (there?.realms?.some((/** @type {any} */ r) => !r.pass)) throw new Error(`${destination} holds a realm's own key. Give the pass a file of its own.`);
  const { manifest, secret, files, keyFile } = await loadRealm(options);
  if (!secret) throw new Error("Only the realm's own key can make a pass, and this file does not hold it.");
  const made = await makePass(await keyPairFromSecret(secret), days * 24 * 60 * 60 * 1000);
  const entry = {
    secret: made.secret,
    pass: made.pass,
    manifest,
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, encodeFile(bytes)])),
    storage: keyFile.realms.find((r) => r.address === manifest.from)?.entry.storage,
  };
  await writeKeyFile(destination, { format: FORMAT, realms: [] }, undefined, entry);
  return manifest.from;
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
  if (args.pass && args.keys) {
    const days = Number(args.days ?? 30);
    await writePass({ realmDir: args.realm, keysFile: args.keys, address: args.address }, args.pass, days);
    console.log(`Wrote a referee pass good for ${days} days to ${args.pass}. Host with: deno task host --server <address> --keys ${args.pass}`);
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
