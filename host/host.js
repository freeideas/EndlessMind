// Runs one game: serves its display, keeps its game server sealed in a process of its own, and passes
// messages between the two. Sign-in and records come from the realm library. See host/README.md.
//
//   const running = await runGame({ folder: "examples/maze" });
//   ... running.base is the address to play at; running.stop() ends it.

import { fileURLToPath, pathToFileURL } from "node:url";
import { extname, join, sep } from "node:path";
import { isId } from "../shared/keys.js";
import { DEFAULT_PORTAL, openRealm } from "../realm/realm.js";

const MEMORY_MB = 64; // a game server that needs more memory than this is stopped
const PING_MS = 2000; // how often a game server is asked whether it is still answering
const DEAF_MS = 6000; // one that has not answered for this long is stopped
const RESTART_MS = 1000; // a stopped game server is not started again sooner than this
const MAX_MESSAGE = 64 * 1024; // the longest message a display or a game server may send, in characters
const MAX_DATA = 4 * 1024 * 1024; // the most a game server may keep with save(), as JSON
const SEAL = ["--no-prompt", "--no-remote", "--no-npm", "--no-config", "--no-lock"]; // and no --allow flags at all
const SEALED_JS = new URL("./sealed.js", import.meta.url).href;
const PLAY_JS = new URL("./play.js", import.meta.url);

/** @type {Record<string, string>} */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".woff2": "font/woff2",
};

/**
 * @typedef {{
 *   folder: string,
 *   port?: number,
 *   hostname?: string,
 *   base?: string,
 *   portal?: string,
 *   data?: string,
 *   memory?: number,
 *   watch?: boolean,
 *   log?: (text: string) => void,
 * }} RunOptions
 * `folder` holds the game: `game.js` (the game server), `card.json` (its name and description) and the
 * display's files, starting at `index.html`. `base` is the address players use, ending in "/". `data`
 * is where the realm's secret phrase and everything the game saves are kept: `.data/` in the folder
 * unless given. `watch` restarts the game server when a file in the folder changes.
 */

/** @param {string} path a name with a part that starts with a dot is never served and never loaded */
const hidden = (path) => path.split(/[\\/]/).some((part) => part.startsWith("."));

/**
 * Refuse a game server that loads anything from outside its own folder. A sealed process may not read
 * files, but the files it imports are loaded for it before it starts, so those are checked here.
 * @param {string} entry
 * @param {string} folder
 */
async function checkImports(entry, folder) {
  const info = await new Deno.Command(Deno.execPath(), { args: ["info", "--json", ...SEAL.slice(1), entry], stderr: "piped" }).output();
  if (!info.success) throw new Error(new TextDecoder().decode(info.stderr).trim());
  const graph = JSON.parse(new TextDecoder().decode(info.stdout));
  /** @type {Set<string>} */
  const wanted = new Set();
  for (const module of graph.modules ?? []) {
    if (module.error) throw new Error(String(module.error));
    wanted.add(module.specifier);
    for (const dependency of module.dependencies ?? []) {
      for (const use of [dependency.code, dependency.type]) {
        if (use?.error) throw new Error(String(use.error));
        if (use?.specifier) wanted.add(use.specifier);
      }
    }
  }
  const own = pathToFileURL(folder + sep).href;
  for (const specifier of wanted) {
    if (specifier === SEALED_JS || specifier === pathToFileURL(entry).href) continue;
    const inside = specifier.startsWith(own) && !hidden(decodeURIComponent(specifier.slice(own.length)));
    const real = inside ? await Deno.realPath(fileURLToPath(specifier)) : "";
    if (!real.startsWith(folder + sep) || hidden(real.slice(folder.length))) {
      throw new Error(`The game server may only load files from its own folder, not ${specifier}`);
    }
  }
}

/** @param {RunOptions} options */
export async function runGame(options) {
  const folder = await Deno.realPath(options.folder);
  const data = options.data ?? join(folder, ".data");
  await Deno.mkdir(data, { recursive: true });
  const port = options.port ?? 8000;
  const base = options.base ?? `http://localhost:${port}/`;
  const log = options.log ?? ((text) => console.log(text));
  const encoder = new TextEncoder();

  const realm = await openRealm({
    base,
    portal: options.portal ?? DEFAULT_PORTAL,
    secretFile: join(data, "realm-secret.txt"),
    dataFile: join(data, "realm-data.json"),
    card: JSON.parse(await Deno.readTextFile(join(folder, "card.json"))),
  });

  // What the game server keeps with save(): one JSON file, written a moment after each change.
  const dataFile = join(data, "game-data.json");
  /** @type {Record<string, unknown>} */
  let kept = {};
  try {
    kept = JSON.parse(await Deno.readTextFile(dataFile));
  } catch {
    kept = {};
  }
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let writing;
  async function write() {
    writing = undefined;
    const text = JSON.stringify(kept);
    if (text.length > MAX_DATA) return log(`The game keeps more than ${MAX_DATA} characters of data, so its latest changes are not saved.`);
    await Deno.writeTextFile(dataFile + ".new", text);
    await Deno.rename(dataFile + ".new", dataFile);
  }

  /** The displays connected now. @type {Map<number, WebSocket>} */
  const sockets = new Map();
  let connections = 0;

  /** The sealed process, while it runs. @type {{ child: Deno.ChildProcess, writer: WritableStreamDefaultWriter<Uint8Array>, heard: number } | null} */
  let sealed = null;
  let started = 0;
  /** @type {Promise<void> | null} */
  let starting = null;
  let stopped = false;

  /** @param {Record<string, unknown>} message */
  const tell = (message) => void sealed?.writer.write(encoder.encode(JSON.stringify(message) + "\n")).catch(() => {});

  /** @param {any} m a line from the game server */
  function hear(m) {
    if (!sealed) return;
    if (m.t === "pong") sealed.heard = Date.now();
    else if (m.t === "send") {
      const socket = sockets.get(m.conn);
      const text = JSON.stringify(m.data);
      if (socket?.readyState === WebSocket.OPEN && text.length <= MAX_MESSAGE) socket.send(text);
    } else if (m.t === "save" && typeof m.key === "string") {
      if (m.value === undefined) delete kept[m.key];
      else kept[m.key] = m.value;
      writing ||= setTimeout(() => write().catch((error) => log(String(error))), 200);
    } else if (m.t === "offer" && isId(m.id) && Array.isArray(m.records)) {
      realm.offer(m.id, m.records).catch((error) => log(String(error)));
    } else if (m.t === "log" || m.t === "error") log(`[game] ${m.text}`);
  }

  /** @param {ReadableStream<Uint8Array>} stream @param {(line: string) => void} each */
  async function lines(stream, each) {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of stream) {
      const parts = (rest + decoder.decode(chunk, { stream: true })).split("\n");
      rest = parts.pop() ?? "";
      for (const line of parts) if (line) each(line);
    }
    if (rest) each(rest);
  }

  async function start() {
    started = Date.now();
    const entry = join(data, "sealed-entry.js");
    const game = pathToFileURL(join(folder, "game.js")).href;
    await Deno.writeTextFile(entry, `import server from ${JSON.stringify(game)};\nimport { seal } from ${JSON.stringify(SEALED_JS)};\nseal(server);\n`);
    await checkImports(entry, folder);
    const child = new Deno.Command(Deno.execPath(), {
      args: ["run", ...SEAL, `--v8-flags=--max-old-space-size=${options.memory ?? MEMORY_MB}`, entry],
      cwd: folder,
      clearEnv: true,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const mine = (sealed = { child, writer: child.stdin.getWriter(), heard: Date.now() });
    lines(child.stdout, (line) => {
      try {
        if (sealed === mine) hear(JSON.parse(line));
      } catch {
        log(`[game] ${line}`);
      }
    });
    const said = /** @type {string[]} */ ([]);
    lines(child.stderr, (line) => said.length < 5 && said.push(line.replace(/\x1b\[[0-9;]*m/g, "")));
    child.status.then((status) => {
      if (sealed !== mine) return;
      sealed = null;
      if (!stopped) log(`The game server stopped (${status.signal ?? "exit " + status.code}). ${said.join(" ")}`.trim());
      for (const socket of sockets.values()) socket.close(1012, "the game server stopped");
      sockets.clear();
    });
    tell({ t: "start", data: kept });
  }

  /** Make sure the game server is running, waiting a moment if it has only just stopped. */
  function awake() {
    if (sealed) return Promise.resolve();
    return (starting ??= (async () => {
      const wait = started + RESTART_MS - Date.now();
      if (wait > 0) await new Promise((done) => setTimeout(done, wait));
      try {
        if (!sealed && !stopped) await start();
      } catch (error) {
        log(`The game server did not start. ${error instanceof Error ? error.message : error}`);
      } finally {
        starting = null;
      }
    })());
  }

  /** @param {string} why */
  function halt(why) {
    if (!sealed) return;
    log(why);
    sealed.child.kill("SIGKILL");
  }

  const pinging = setInterval(() => {
    if (!sealed) return;
    if (Date.now() - sealed.heard > DEAF_MS) return halt("The game server stopped answering, so it was stopped.");
    tell({ t: "ping", n: Date.now() });
  }, PING_MS);

  /** @param {Request} request @param {URL} url */
  async function connect(request, url) {
    const guest = url.searchParams.get("guest") ?? "";
    if (!/^[a-f0-9]{32}$/.test(guest)) return new Response("Bad guest name", { status: 400 });
    // Browsers send the player's session with a connection opened by any page, so only this game's own
    // pages may connect.
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(base).origin && new URL(origin).host !== request.headers.get("host")) {
      return new Response("Not from this game's pages", { status: 403 });
    }
    const id = await realm.player(request);
    const { socket, response } = Deno.upgradeWebSocket(request);
    const conn = ++connections;
    let open = true;
    socket.onopen = async () => {
      await awake();
      if (!open || !sealed) return socket.close(1012, "the game server is not running");
      sockets.set(conn, socket);
      const records = id ? realm.records(id).map(({ text, data, time }) => ({ text, data, time })) : [];
      tell({ t: "join", p: { conn, who: id ? "player:" + id : "guest:" + guest, id, name: id ? realm.playerName(id) : "Guest", guest: "guest:" + guest, records } });
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE || !sockets.has(conn)) return;
      try {
        tell({ t: "message", conn, data: JSON.parse(event.data) });
      } catch {
        // Not JSON: nothing a game server could use.
      }
    };
    socket.onclose = () => {
      open = false;
      if (sockets.get(conn) === socket && sockets.delete(conn)) tell({ t: "leave", conn });
    };
    return response;
  }

  /** One of the display's files. @param {string} name its path under the game's address */
  async function file(name) {
    if (name === "" || name.endsWith("/")) name += "index.html";
    if (hidden(name) || name.includes("\\")) return null;
    try {
      const path = await Deno.realPath(join(folder, name));
      if (!path.startsWith(folder + sep) || hidden(path.slice(folder.length))) return null;
      return new Response(await Deno.readFile(path), {
        headers: { "content-type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" },
      });
    } catch {
      return null;
    }
  }

  const basePath = new URL(base).pathname;
  const server = Deno.serve({ port, hostname: options.hostname ?? "127.0.0.1", onListen() {} }, async (request) => {
    const answer = await realm.handle(request);
    if (answer) return answer;
    const url = new URL(request.url);
    if (!url.pathname.startsWith(basePath)) return new Response("Not found", { status: 404 });
    const name = decodeURIComponent(url.pathname.slice(basePath.length));
    if (name === "endlessmind/play" && request.headers.get("upgrade")?.toLowerCase() === "websocket") return connect(request, url);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Not found", { status: 404 });
    if (name === "endlessmind/play.js") {
      return new Response(await Deno.readFile(PLAY_JS), { headers: { "content-type": TYPES[".js"], "cache-control": "no-cache" } });
    }
    return (await file(name)) ?? new Response("Not found", { status: 404 });
  });

  // While a game is being made, a changed file restarts its game server; displays reconnect by themselves.
  const watcher = options.watch ? Deno.watchFs(folder) : null;
  if (watcher) {
    (async () => {
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let soon;
      for await (const event of watcher) {
        if (event.kind === "access" || event.paths.every((path) => hidden(path.slice(folder.length)))) continue;
        clearTimeout(soon);
        soon = setTimeout(() => halt("A file changed, so the game server starts again."), 200);
      }
    })().catch(() => {});
  }

  await awake();
  return {
    realm,
    base,
    /** Whether the game server is running now. */
    get awake() {
      return sealed !== null;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(pinging);
      watcher?.close();
      for (const socket of sockets.values()) socket.close(1001, "the game is closing");
      await server.shutdown();
      const child = sealed?.child;
      await sealed?.writer.close().catch(() => {});
      await child?.status;
      if (writing) {
        clearTimeout(writing);
        await write();
      }
    },
  };
}
