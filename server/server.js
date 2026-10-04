// The Endless Mind helper server: a small program anyone can run.
//
// It serves the app's web page, keeps signed announcements and key-free
// releases, stores the files they list by hash, and relays signed messages
// between peers. It holds no game state and makes no rules. Everything it
// keeps is signed or named by hash, so it cannot forge anything. See
// specs/DESIGN.md ("The server: a small program anyone can run").
//
// Usage: deno task start [--port 8000] [--hostname 0.0.0.0] [--data ./data]
//                        [--cert cert.pem --key key.pem]
//                        [--origin https://example.org[,https://other.example]]

import { ANNOUNCEMENT_LIFETIME_MS, checkAnnouncement, isManifestBody, releaseOfBody } from "../shared/announce.js";
import { hashOf, isAddress, isHash, verify } from "../shared/crypto.js";
import { canonicalJson, MAX_MESSAGE_BYTES, parseStrictJson, utf8 } from "../shared/encoding.js";
import { PROTOCOL_VERSION } from "../shared/envelope.js";

const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const ROOT = new URL("..", import.meta.url);

/** Folders served as plain files, by URL prefix. The app is served at the root. */
/** @type {[string, URL][]} */
const STATIC_DIRS = [
  ["/shared/", new URL("shared/", ROOT)],
  ["/examples/", new URL("examples/", ROOT)],
  ["/", new URL("app/", ROOT)],
];

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8",
};

/**
 * @typedef {object} ServerOptions
 * @property {number} [port]
 * @property {string} [hostname]
 * @property {string} [dataDir]
 * @property {string} [cert]  PEM text
 * @property {string} [key]   PEM text
 * @property {(addr: Deno.NetAddr) => void} [onListen]
 * @property {number} [maxStoredBytes]
 * @property {number} [maxFiles]
 * @property {number} [maxAnnouncements]
 * @property {number} [maxConnections]
 * @property {number} [messagesPerSecond]
 * @property {number} [bytesPerSecond]
 * @property {number} [maxRealmBytes]
 * @property {number} [sweepMs]  how long after a change unlisted files are deleted
 * @property {string[]} [origins]  the addresses this server goes by, e.g. "https://example.org"
 */

/** @param {ServerOptions} options */
export async function startServer(options = {}) {
  const dataDir = options.dataDir ?? "./data";
  const blobDir = `${dataDir}/blobs`;
  const announcementsFile = `${dataDir}/announcements.json`;
  await Deno.mkdir(blobDir, { recursive: true });
  const limits = {
    bytes: options.maxStoredBytes ?? 256 * 1024 * 1024,
    files: options.maxFiles ?? 10_000,
    announcements: options.maxAnnouncements ?? 1000,
    connections: options.maxConnections ?? 256,
    messages: options.messagesPerSecond ?? 1000,
    traffic: options.bytesPerSecond ?? 4 * 1024 * 1024,
    realmBytes: options.maxRealmBytes ?? 32 * 1024 * 1024,
  };
  const sockets = new Set();
  const blobs = new Map();
  let storedBytes = 0, activeWrites = 0;
  for await (const file of Deno.readDir(blobDir)) {
    if (file.isFile && isHash(file.name)) {
      const size = (await Deno.stat(`${blobDir}/${file.name}`)).size;
      blobs.set(file.name, size); storedBytes += size;
    }
  }
  let blobWriting = Promise.resolve();

  /** Latest announcement per realm address. @type {Map<string, any>} */
  const announcements = new Map();
  /** For each realm: who referees it, and when its own key last spoke. @type {Map<string, { referee: string, authority: number }>} */
  const spoken = new Map();
  /**
   * Realms with no key: a manifest body, named by its hash. Anyone may post
   * one, and posting it again renews it. @type {Map<string, { body: any, expires: number }>}
   */
  const releases = new Map();
  try {
    const saved = JSON.parse(await Deno.readTextFile(announcementsFile));
    for (const value of Array.isArray(saved) ? saved : saved.announcements ?? []) {
      const checked = await checkAnnouncement(value);
      if (!checked) continue;
      announcements.set(checked.realm, checked.announcement);
      spoken.set(checked.realm, { referee: checked.referee, authority: checked.authority });
    }
    for (const r of saved.releases ?? []) {
      if (isManifestBody(r?.body) && r.expires > Date.now()) releases.set(await releaseOfBody(r.body), r);
    }
  } catch { /* first run, or unreadable file: start empty */ }

  /** The file lists of everything still wanted here: announced realms and key-free releases. */
  function* roots() {
    const now = Date.now();
    for (const a of announcements.values()) if (a.body.expires >= now) yield a.body.manifest.body.files;
    for (const r of releases.values()) if (r.expires >= now) yield r.body.files;
  }

  /**
   * A file is kept only while something wanted lists it, and each realm has a
   * size budget, so every stored byte belongs to a realm someone answers for.
   * @param {string} hash @param {number} size
   */
  function mayStore(hash, size) {
    if (releases.has(hash)) return true;
    for (const files of roots()) {
      const listed = new Set(Object.values(files));
      if (!listed.has(hash)) continue;
      let used = size;
      for (const h of listed) used += blobs.get(h) ?? 0;
      if (used <= limits.realmBytes) return true;
    }
    return false;
  }

  /** Forget what has expired. Cheap, so it can run on any request. */
  function expire() {
    const now = Date.now();
    // What a realm's key last said is remembered past its announcement, so an older pass stays refused.
    for (const [address, a] of announcements) if (a.body.expires < now) announcements.delete(address);
    for (const [hash, r] of releases) if (r.expires < now) releases.delete(hash);
    while (spoken.size > 10_000) spoken.delete(/** @type {string} */ (spoken.keys().next().value));
  }

  /** Delete files nothing lists any more. This walks everything stored, so it runs seldom. */
  function sweep() {
    sweepTimer = undefined;
    expire();
    const keep = new Set(releases.keys());
    for (const files of roots()) for (const h of Object.values(files)) keep.add(h);
    blobWriting = blobWriting.then(async () => {
      for (const [hash, size] of blobs) {
        if (keep.has(hash)) continue;
        await Deno.remove(`${blobDir}/${hash}`).catch(() => {});
        blobs.delete(hash); storedBytes -= size;
      }
    }).catch(() => {});
  }
  const sweeper = setInterval(sweep, 60 * 60 * 1000);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let sweepTimer;
  /** Sweep a little later, however many requests ask: no single request pays for it. */
  function sweepSoon() {
    sweepTimer ??= setTimeout(sweep, options.sweepMs ?? 60_000);
  }

  /** @param {string} hash @param {Uint8Array<ArrayBuffer>} bytes @returns {Promise<boolean>} false when a quota is full */
  async function storeBlob(hash, bytes) {
    let accepted = false;
    const write = blobWriting.then(async () => {
      if (blobs.has(hash)) { accepted = true; return; }
      if (storedBytes + bytes.length > limits.bytes || blobs.size >= limits.files) return;
      const path = `${blobDir}/${hash}`, temp = path + ".tmp";
      try {
        await Deno.writeFile(temp, bytes);
        await Deno.rename(temp, path);
      } finally { await Deno.remove(temp).catch(() => {}); }
      blobs.set(hash, bytes.length); storedBytes += bytes.length; accepted = true;
    });
    blobWriting = write.catch(() => {});
    await write;
    return accepted;
  }

  let saving = Promise.resolve(), dirty = false, writing = false;
  function saveAnnouncements() {
    dirty = true;
    if (!writing) {
      writing = true;
      saving = (async () => {
        while (dirty) {
          dirty = false;
          await Deno.writeTextFile(announcementsFile + ".tmp", JSON.stringify({ announcements: [...announcements.values()], releases: [...releases.values()] }));
          await Deno.rename(announcementsFile + ".tmp", announcementsFile);
        }
      })().finally(() => writing = false);
    }
    return saving;
  }

  /**
   * The socket that most recently proved it holds each address. A key can be
   * carried anywhere, so two holders may turn up; the most recent claim wins
   * and the earlier holder is told it was replaced.
   * @type {Map<string, WebSocket>}
   */
  const claims = new Map();

  /** @param {string} address */
  function isOnline(address) {
    return claims.has(spoken.get(address)?.referee ?? address);
  }

  /**
   * A receiver that cannot keep up misses messages; it is never disconnected
   * for it, or anyone could knock a realm offline by flooding it.
   * @param {WebSocket} socket @param {unknown} message @returns {boolean} false if not sent
   */
  function sendTo(socket, message) {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 2 * MAX_BLOB_BYTES) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  /**
   * The names this server goes by, as clients write them ("example.org:8000").
   * A claim must be signed for one of them, so the server cannot take its name
   * from the request: a dishonest server could then pass a player's claim on.
   * @type {Set<string> | undefined}
   */
  let names;
  /** @param {string} host */
  function isMyName(host) {
    if (!names) {
      const port = /** @type {Deno.NetAddr} */ (server.addr).port;
      names = new Set((options.origins ?? []).map((o) => new URL(o.includes("://") ? o : `http://${o}`).host));
      // Told its names, the server goes by those alone. Left to itself it goes by this computer's local
      // names, which many computers share, so a server open to strangers should be told (--origin).
      if (!names.size) {
        const local = ["localhost", "127.0.0.1", "[::1]"];
        if (options.hostname && options.hostname !== "0.0.0.0") local.push(options.hostname);
        try {
          for (const nic of Deno.networkInterfaces()) if (nic.family === "IPv4") local.push(nic.address);
        } catch { /* not allowed to look: local names only */ }
        for (const name of local) {
          names.add(`${name}:${port}`);
          // Clients leave out the usual port of plain and secure web addresses.
          if (port === 80 || port === 443) names.add(name);
        }
      }
    }
    return names.has(host);
  }

  /**
   * @param {WebSocket} socket
   * @param {string} host  this server's name as the client used it, e.g. "example.org:8000"
   */
  function handleSocket(socket, host) {
    sockets.add(socket);
    let windowStart = Date.now(), messages = 0, bytes = 0;
    /** Addresses this socket has proved. @type {Set<string>} */
    const mine = new Set();
    /** Challenges sent, by address. @type {Map<string, string>} */
    const challenges = new Map();

    socket.onopen = () => sendTo(socket, { type: "welcome", versions: [PROTOCOL_VERSION], time: Date.now() });

    socket.onmessage = async (event) => {
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messages = 0; bytes = 0; }
      const size = typeof event.data === "string" ? event.data.length : MAX_MESSAGE_BYTES;
      const over = messages >= limits.messages || bytes + size > limits.traffic;
      messages++; bytes += size;
      if (over || typeof event.data !== "string" || size > MAX_MESSAGE_BYTES) {
        // The sender pays for its own traffic: the message is dropped and it is told.
        if (messages <= limits.messages + 1) sendTo(socket, { type: "error", error: over ? "traffic limit" : "message too large" });
        return;
      }
      const msg = /** @type {any} */ (parseStrictJson(event.data));
      if (!msg || typeof msg !== "object") return;

      // Claiming an address: the socket proves it holds the private key by
      // signing a random challenge together with this server's name, so a
      // dishonest server cannot pass the signature on to claim the address
      // elsewhere. Then messages for that address come here.
      if (msg.type === "claim" && isAddress(msg.address)) {
        if (!isMyName(host)) {
          const error = `This server does not go by the name ${host}. Its operator must start it with --origin ${host}.`;
          console.warn(error);
          sendTo(socket, { type: "error", error, address: msg.address });
          return;
        }
        if (challenges.size + mine.size >= 64) { socket.close(1008, "Address limit"); return; }
        const nonce = crypto.randomUUID();
        challenges.set(msg.address, nonce);
        sendTo(socket, { type: "challenge", address: msg.address, nonce });
      } else if (msg.type === "prove" && challenges.has(msg.address)) {
        const nonce = challenges.get(msg.address);
        challenges.delete(msg.address);
        if (await verify(msg.address, "claim", `${host}\n${nonce}`, msg.sig)) {
          if (socket.readyState !== WebSocket.OPEN) return;
          mine.add(msg.address);
          const earlier = claims.get(msg.address);
          if (earlier && earlier !== socket) sendTo(earlier, { type: "replaced", address: msg.address });
          claims.set(msg.address, socket);
          sendTo(socket, { type: "claimed", address: msg.address });
        } else {
          sendTo(socket, { type: "error", error: "bad proof", address: msg.address });
        }
      } else if (msg.type === "release" && mine.has(msg.address)) {
        // Giving an address up, for example a referee leaving its realm.
        mine.delete(msg.address);
        if (claims.get(msg.address) === socket) claims.delete(msg.address);
      } else if (msg.type === "send") {
        // Relay. The server checks only that the sender claimed the "from"
        // address; receivers check the signature themselves.
        const env = msg.envelope;
        if (!env || claims.get(env.from) !== socket || !isAddress(env.to)) {
          sendTo(socket, { type: "error", error: "cannot send", ref: msg.ref });
          return;
        }
        const target = claims.get(env.to);
        if (!target || !sendTo(target, { type: "deliver", envelope: env })) {
          sendTo(socket, { type: "undeliverable", to: env.to, ref: msg.ref });
        }
      }
    };

    socket.onclose = () => {
      sockets.delete(socket);
      for (const address of mine) {
        if (claims.get(address) === socket) claims.delete(address);
      }
    };
  }

  /** @param {Request} request */
  async function handleAnnounce(request) {
    const url = new URL(request.url);
    if (request.method === "POST") {
      const body = await readLimited(request, MAX_MESSAGE_BYTES);
      if (!body) return json({ error: "too large" }, 413);
      const text = new TextDecoder().decode(body);
      const value = parseStrictJson(text);
      if (value === undefined) return json({ error: "not acceptable JSON" }, 400);
      // Realms with a key and releases without one have separate room, so neither can crowd out the other.
      if (isManifestBody(value) && !("sig" in value)) {
        // A key-free release: the manifest body itself, kept as a file under its hash.
        if (!value.main) return json({ error: "a release without a key needs public rules (main)" }, 400);
        const bytes = utf8(canonicalJson(value)), release = await hashOf(bytes);
        expire();
        if (!releases.has(release) && releases.size >= limits.announcements) return json({ error: "Announcement quota reached" }, 507);
        releases.set(release, { body: value, expires: Date.now() + ANNOUNCEMENT_LIFETIME_MS });
        if (!await storeBlob(release, bytes)) {
          releases.delete(release);
          return json({ error: "File storage quota reached" }, 507);
        }
        await saveAnnouncements();
        return json({ ok: true, release });
      }
      const checked = await checkAnnouncement(value);
      if (!checked) return json({ error: "invalid announcement" }, 400);
      const from = checked.realm, existing = announcements.get(from), before = spoken.get(from);
      // The realm's own key decides: an announcement under an older pass cannot replace one under a newer.
      if (before && (before.authority > checked.authority ||
        (before.authority === checked.authority && existing && existing.time > checked.announcement.time))) {
        return json({ error: "older than the one kept" }, 409);
      }
      expire();
      if (!announcements.has(from) && announcements.size >= limits.announcements) return json({ error: "Announcement quota reached" }, 507);
      announcements.set(from, checked.announcement);
      spoken.delete(from);
      spoken.set(from, { referee: checked.referee, authority: checked.authority });
      sweepSoon();
      await saveAnnouncements();
      return json({ ok: true });
    }

    const address = decodeURIComponent(url.pathname.slice("/announce/".length));
    const now = Date.now();
    if (address) {
      const a = announcements.get(address);
      if (!a || a.body.expires < now) return json({ error: "not found" }, 404);
      return json({ announcement: a, online: isOnline(address) });
    }
    // Listing, optionally by tag. Realms with a referee online come first.
    const tag = url.searchParams.get("tag")?.toLowerCase();
    const list = [...announcements]
      .filter(([, a]) => a.body.expires >= now)
      .map(([address, a]) => ({ address, name: a.body.name, tags: a.body.tags, online: isOnline(address), time: a.time }))
      // A key-free release needs no referee, so it always counts as online. It is listed beside any realm
      // that announces the same files: were it hidden then, anyone could hide it by announcing them.
      .concat([...releases].filter(([, r]) => r.expires >= now).map(([hash, r]) => (
        { address: hash, name: r.body.name, tags: r.body.tags, online: true, alone: true, time: r.expires - ANNOUNCEMENT_LIFETIME_MS }
      )))
      .filter((r) => !tag || r.tags.some((/** @type {string} */ t) => t.toLowerCase() === tag))
      .sort((a, b) => Number(b.online) - Number(a.online) || b.time - a.time)
      .slice(0, 200);
    return json({ realms: list });
  }

  /** @param {Request} request @param {string} hash */
  async function handleBlob(request, hash) {
    if (!isHash(hash)) return json({ error: "bad hash" }, 400);
    const path = `${blobDir}/${hash}`;
    if (request.method === "PUT") {
      const bytes = await readLimited(request, MAX_BLOB_BYTES);
      if (!bytes) return json({ error: "too large" }, 413);
      if ((await hashOf(bytes)) !== hash) return json({ error: "hash does not match" }, 400);
      if (!blobs.has(hash) && !mayStore(hash, bytes.length)) {
        return json({ error: "No realm announced here lists this file, or its realm is over its size budget. Announce the realm first." }, 403);
      }
      if (!await storeBlob(hash, bytes)) return json({ error: "File storage quota reached" }, 507);
      return json({ ok: true });
    }
    try {
      const bytes = await Deno.readFile(path);
      return new Response(bytes, {
        headers: {
          "content-type": "application/octet-stream",
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      return json({ error: "not found" }, 404);
    }
  }

  /** @param {URL} url */
  async function handleStatic(url) {
    for (const [prefix, dir] of STATIC_DIRS) {
      if (!url.pathname.startsWith(prefix)) continue;
      let rest = decodeURIComponent(url.pathname.slice(prefix.length));
      if (rest === "" || rest.endsWith("/")) rest += "index.html";
      if (rest.split("/").some((part) => part === ".." || part.startsWith("."))) break;
      const file = new URL(rest, dir);
      // `rest` can itself be a whole address ("file:///etc/hosts"), which would replace the folder.
      if (!file.href.startsWith(dir.href)) break;
      try {
        const bytes = await Deno.readFile(file);
        const ext = rest.slice(rest.lastIndexOf("."));
        return new Response(bytes, {
          headers: {
            "content-type": CONTENT_TYPES[/** @type {keyof typeof CONTENT_TYPES} */ (ext)] ?? "application/octet-stream",
            "cache-control": "no-cache",
            "x-content-type-options": "nosniff",
          },
        });
      } catch {
        break;
      }
    }
    return new Response("Not found", { status: 404 });
  }

  /** @param {Request} request */
  async function handle(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("upgrade") !== "websocket") return new Response("WebSocket only", { status: 400 });
      if (sockets.size >= limits.connections) return json({error:"Connection quota reached"}, 503);
      const host = request.headers.get("host") ?? url.host;
      const { socket, response } = Deno.upgradeWebSocket(request);
      handleSocket(socket, host);
      return response;
    }
    if (url.pathname === "/announce" || url.pathname.startsWith("/announce/")) return handleAnnounce(request);
    if (url.pathname.startsWith("/blob/")) return handleBlob(request, decodeURIComponent(url.pathname.slice(6)));
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    return handleStatic(url);
  }

  /** @type {Deno.ServeTcpOptions & Partial<Deno.TlsCertifiedKeyPem>} */
  const serveOptions = {
    port: options.port ?? 8000,
    hostname: options.hostname ?? "0.0.0.0",
    onListen: options.onListen ?? (() => {}),
  };
  if (options.cert && options.key) Object.assign(serveOptions, { cert: options.cert, key: options.key });
  const server = Deno.serve(serveOptions, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/ws") return handle(request);
    const api = url.pathname === "/announce" || url.pathname.startsWith("/announce/") || url.pathname.startsWith("/blob/");
    if (!api) return handle(request);
    const cors = {"access-control-allow-origin":"*", "access-control-allow-methods":"GET, HEAD, POST, PUT, OPTIONS", "access-control-allow-headers":"content-type"};
    if (request.method === "OPTIONS") return new Response(null, {status:204, headers:cors});
    const writes = request.method === "POST" || request.method === "PUT";
    if (writes && activeWrites >= 16) return new Response(JSON.stringify({error:"Too many uploads"}), {status:429,headers:cors});
    if (writes) activeWrites++;
    try {
      const response = await handle(request);
      for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
      return response;
    } finally { if (writes) activeWrites--; }
  });
  return {
    server,
    port: /** @type {Deno.NetAddr} */ (server.addr).port,
    async shutdown() {
      clearInterval(sweeper);
      clearTimeout(sweepTimer);
      for (const socket of sockets) socket.close();
      await server.shutdown();
      await saving;
      await blobWriting;
    },
  };
}

/**
 * Read a request's body, giving up as soon as it passes the limit.
 * @param {Request} request @param {number} max
 * @returns {Promise<Uint8Array<ArrayBuffer> | null>} null if too large
 */
async function readLimited(request, max) {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  const chunks = [];
  let size = 0;
  if (request.body) {
    for await (const chunk of request.body) {
      size += chunk.length;
      if (size > max) return null;
      chunks.push(chunk);
    }
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** @param {unknown} value @param {number} [status] */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** @param {string[]} args */
function parseArgs(args) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) out[args[i].slice(2)] = args[i + 1] ?? "";
  }
  return out;
}

if (import.meta.main) {
  const args = parseArgs(Deno.args);
  const tls = Boolean(args.cert && args.key);
  const port = Number(args.port ?? 8000);
  await startServer({
    port,
    hostname: args.hostname,
    dataDir: args.data,
    maxStoredBytes: args["max-storage-mb"] ? Number(args["max-storage-mb"]) * 1024 * 1024 : undefined,
    maxFiles: args["max-files"] ? Number(args["max-files"]) : undefined,
    maxAnnouncements: args["max-announcements"] ? Number(args["max-announcements"]) : undefined,
    maxConnections: args["max-connections"] ? Number(args["max-connections"]) : undefined,
    messagesPerSecond: args["messages-per-second"] ? Number(args["messages-per-second"]) : undefined,
    bytesPerSecond: args["bytes-per-second"] ? Number(args["bytes-per-second"]) : undefined,
    maxRealmBytes: args["max-realm-mb"] ? Number(args["max-realm-mb"]) * 1024 * 1024 : undefined,
    origins: args.origin ? args.origin.split(",") : undefined,
    cert: tls ? await Deno.readTextFile(args.cert) : undefined,
    key: tls ? await Deno.readTextFile(args.key) : undefined,
    onListen() {
      const scheme = tls ? "https" : "http";
      console.log(`Endless Mind server running.`);
      console.log(`  On this computer: ${scheme}://localhost:${port}/`);
      const nics = (() => { try { return Deno.networkInterfaces(); } catch { return []; } })();
      for (const nic of nics) {
        if (nic.family === "IPv4" && !nic.address.startsWith("127.")) {
          console.log(`  On your network:  ${scheme}://${nic.address}:${port}/`);
        }
      }
      if (!tls) {
        console.log("Other devices need https (browsers allow key functions only on https or localhost).");
        console.log("See specs/RUNNING.md.");
      }
    },
  });
}
