// The EveryGame helper server: a small program anyone can run.
//
// It serves the app's web page, keeps signed announcements, stores files by
// hash, and relays signed messages between peers that cannot reach each other
// directly. It holds no game state and makes no rules. Everything it keeps is
// signed or named by hash, so it cannot forge anything. See specs/DESIGN.md
// ("The server: a small program anyone can run").
//
// Usage: deno task start [--port 8000] [--hostname 0.0.0.0] [--data ./data]
//                        [--cert cert.pem --key key.pem]

import { checkAnnouncement } from "../shared/announce.js";
import { hashOf, isAddress, isHash, verify } from "../shared/crypto.js";
import { open, PROTOCOL_VERSION } from "../shared/envelope.js";

const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const MAX_MESSAGE_BYTES = 256 * 1024;
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
 */

/** @param {ServerOptions} options */
export async function startServer(options = {}) {
  const dataDir = options.dataDir ?? "./data";
  const blobDir = `${dataDir}/blobs`;
  const announcementsFile = `${dataDir}/announcements.json`;
  await Deno.mkdir(blobDir, { recursive: true });

  /** Latest announcement per realm address. @type {Map<string, any>} */
  const announcements = new Map();
  try {
    const saved = JSON.parse(await Deno.readTextFile(announcementsFile));
    for (const value of saved) {
      const checked = await checkAnnouncement(value);
      if (checked) announcements.set(checked.announcement.from, checked.announcement);
    }
  } catch { /* first run, or unreadable file: start empty */ }

  let saving = Promise.resolve();
  function saveAnnouncements() {
    const text = JSON.stringify([...announcements.values()]);
    saving = saving.then(() => Deno.writeTextFile(announcementsFile, text)).catch(console.error);
  }

  /** Sockets that proved they hold each address. @type {Map<string, Set<WebSocket>>} */
  const claims = new Map();

  /** @param {string} address */
  function isOnline(address) {
    return (claims.get(address)?.size ?? 0) > 0;
  }

  /** @param {WebSocket} socket @param {unknown} message */
  function sendTo(socket, message) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  /** @param {WebSocket} socket */
  function handleSocket(socket) {
    /** Addresses this socket has proved. @type {Set<string>} */
    const mine = new Set();
    /** Challenges sent, by address. @type {Map<string, string>} */
    const challenges = new Map();

    socket.onopen = () => sendTo(socket, { type: "welcome", versions: [PROTOCOL_VERSION] });

    socket.onmessage = async (event) => {
      if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE_BYTES) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;

      // Claiming an address: the socket proves it holds the private key by
      // signing a random challenge. Then messages for that address come here.
      if (msg.type === "claim" && isAddress(msg.address)) {
        const nonce = crypto.randomUUID();
        challenges.set(msg.address, nonce);
        sendTo(socket, { type: "challenge", address: msg.address, nonce });
      } else if (msg.type === "prove" && challenges.has(msg.address)) {
        const nonce = challenges.get(msg.address);
        challenges.delete(msg.address);
        if (await verify(msg.address, "everygame-claim:" + nonce, msg.sig)) {
          mine.add(msg.address);
          if (!claims.has(msg.address)) claims.set(msg.address, new Set());
          claims.get(msg.address)?.add(socket);
          sendTo(socket, { type: "claimed", address: msg.address });
        } else {
          sendTo(socket, { type: "error", error: "bad proof", address: msg.address });
        }
      } else if (msg.type === "send") {
        // Relay. The server checks only that the sender claimed the "from"
        // address; receivers check the signature themselves.
        const env = msg.envelope;
        if (!env || !mine.has(env.from) || !isAddress(env.to)) {
          sendTo(socket, { type: "error", error: "cannot send", ref: msg.ref });
          return;
        }
        const targets = claims.get(env.to);
        if (!targets || targets.size === 0) {
          sendTo(socket, { type: "undeliverable", to: env.to, ref: msg.ref });
          return;
        }
        for (const target of targets) sendTo(target, { type: "deliver", envelope: env });
      }
    };

    socket.onclose = () => {
      for (const address of mine) {
        const set = claims.get(address);
        set?.delete(socket);
        if (set && set.size === 0) claims.delete(address);
      }
    };
  }

  /** @param {Request} request */
  async function handleAnnounce(request) {
    const url = new URL(request.url);
    if (request.method === "POST") {
      const text = await request.text();
      if (text.length > MAX_MESSAGE_BYTES) return json({ error: "too large" }, 413);
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        return json({ error: "not JSON" }, 400);
      }
      const checked = await checkAnnouncement(value);
      if (!checked) return json({ error: "invalid announcement" }, 400);
      const existing = announcements.get(checked.announcement.from);
      if (existing && existing.time > checked.announcement.time) {
        return json({ error: "older than the one kept" }, 409);
      }
      announcements.set(checked.announcement.from, checked.announcement);
      saveAnnouncements();
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
    const list = [...announcements.values()]
      .filter((a) => a.body.expires >= now)
      .filter((a) => !tag || a.body.tags.some((/** @type {string} */ t) => t.toLowerCase() === tag))
      .map((a) => ({ address: a.from, name: a.body.name, tags: a.body.tags, online: isOnline(a.from), time: a.time }))
      .sort((a, b) => Number(b.online) - Number(a.online) || b.time - a.time)
      .slice(0, 200);
    return json({ realms: list });
  }

  /** @param {Request} request @param {string} hash */
  async function handleBlob(request, hash) {
    if (!isHash(hash)) return json({ error: "bad hash" }, 400);
    const path = `${blobDir}/${hash.replace(":", "-")}`;
    if (request.method === "PUT") {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > MAX_BLOB_BYTES) return json({ error: "too large" }, 413);
      if ((await hashOf(bytes)) !== hash) return json({ error: "hash does not match" }, 400);
      await Deno.writeFile(path, bytes);
      return json({ ok: true });
    }
    try {
      const bytes = await Deno.readFile(path);
      return new Response(bytes, {
        headers: { "content-type": "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
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
      try {
        const bytes = await Deno.readFile(file);
        const ext = rest.slice(rest.lastIndexOf("."));
        return new Response(bytes, {
          headers: {
            "content-type": CONTENT_TYPES[/** @type {keyof typeof CONTENT_TYPES} */ (ext)] ?? "application/octet-stream",
            "cache-control": "no-cache",
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
      const { socket, response } = Deno.upgradeWebSocket(request);
      handleSocket(socket);
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
  const server = Deno.serve(serveOptions, handle);
  return {
    server,
    port: /** @type {Deno.NetAddr} */ (server.addr).port,
    async shutdown() {
      await server.shutdown();
      await saving;
    },
  };
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
    cert: tls ? await Deno.readTextFile(args.cert) : undefined,
    key: tls ? await Deno.readTextFile(args.key) : undefined,
    onListen() {
      const scheme = tls ? "https" : "http";
      console.log(`EveryGame server running.`);
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
