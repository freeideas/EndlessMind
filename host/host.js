// Runs one game: serves its display, keeps its game server sealed in a process of its own, and passes
// messages between the two. Sign-in and records come from the realm library. See host/README.md.
//
//   const running = await runGame({ folder: "examples/maze" });
//   ... running.base is the address to play at; running.stop() ends it.
//
// openGame is the same without a web server of its own, for a server that answers for several things
// (see hosting.js): give its `handle` each request that arrives for the game's address.

import { Buffer } from "node:buffer";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extname, join, sep } from "node:path";
import { isId, signerFromWords } from "../shared/keys.js";
import { DEFAULT_PORTAL, openRealm, secretWords } from "../realm/realm.js";
import { dial, relayedBase } from "./relay.js";
import { checkWasm } from "./sealed.js";

const MEMORY_MB = 64; // a game server that needs more memory than this is stopped
const PING_MS = 2000; // how often a game server is asked whether it is still answering
const DEAF_MS = 6000; // one that has not answered for this long is stopped
const RESTART_MS = 1000; // a stopped game server is not started again sooner than this
const IDLE_MS = 60 * 1000; // a game server with nobody playing for this long rests until someone comes
const SHARE = 0.5; // the part of one processor a game server may use, measured over SHARE_MS
const SHARE_MS = 30 * 1000;
const SHARE_CHECK_MS = 5000; // how often its use of the processor is measured
const PENALTY_MS = 5 * 60 * 1000; // the longest a game server stopped for that waits before starting again
const RELAY_MS = 5000; // how long starting waits for a relay before carrying on without it
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
 *   folder?: string,
 *   release?: import("./release.js").Release,
 *   secretFile?: string,
 *   base?: string,
 *   relay?: string,
 *   portal?: string,
 *   data?: string,
 *   memory?: number,
 *   idle?: number,
 *   share?: { part: number, over: number, every: number },
 *   watch?: boolean,
 *   log?: (text: string) => void,
 * }} GameOptions
 * `folder` holds the game: `game.js` or `game.wasm` (the game server), `card.json` (its name and description) and the
 * display's files, starting at `index.html`. `base` is the address players use, ending in "/". `relay`
 * is the address of a relay to be reached through instead: it gives the game an address of its own, so
 * players anywhere can join a game on this computer. `data` is where the realm's secret phrase and
 * everything the game saves are kept: `.data/` in the folder unless given. `watch` restarts the game
 * server when a file in the folder changes.
 *
 * Instead of `folder`, `release` runs a checked release of someone else's game. Its realm's secret is
 * not here, so the host signs under an ID of its own, kept in `secretFile`, and `data` must be given.
 * @typedef {GameOptions & { port?: number, hostname?: string }} RunOptions
 * @typedef {import("./relay.js").Line} Line
 * @typedef {import("./relay.js").Seat} Seat
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
  // Only what the code loads counts. A file named just for its types, in a comment, is never loaded
  // when the game server runs, so it may be anywhere, or missing.
  /** @type {Map<string, any>} */
  const modules = new Map((graph.modules ?? []).map((/** @type {any} */ module) => [module.specifier, module]));
  /** @type {Set<string>} */
  const wanted = new Set();
  const next = [...(graph.roots ?? [])];
  for (let specifier = next.pop(); specifier !== undefined; specifier = next.pop()) {
    specifier = graph.redirects?.[specifier] ?? specifier;
    if (wanted.has(specifier)) continue;
    wanted.add(specifier);
    const module = modules.get(specifier);
    if (module?.error) throw new Error(String(module.error));
    for (const dependency of module?.dependencies ?? []) {
      if (dependency.code?.error) throw new Error(String(dependency.code.error));
      if (dependency.code?.specifier) next.push(dependency.code.specifier);
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

/** Run a game with a web server of its own. @param {RunOptions} options */
export async function runGame(options) {
  const port = options.port ?? 8000;
  const game = await openGame({ ...options, base: options.relay ? options.base : (options.base ?? `http://localhost:${port}/`) });
  const server = Deno.serve({ port, hostname: options.hostname ?? "127.0.0.1", onListen() {} }, game.handle);
  return {
    realm: game.realm,
    base: game.base,
    /** Whether the game server is running now. */
    get awake() {
      return game.awake;
    },
    async stop() {
      await game.stop();
      await server.shutdown();
    },
  };
}

/** @param {GameOptions} options */
export async function openGame(options) {
  const { release } = options;
  if (!release === !options.folder) throw new Error("A game is a folder or a release: give one of them.");
  if (release && !(options.data && options.secretFile)) throw new Error("A release needs somewhere to keep its data, and its host's secret phrase.");
  const folder = await Deno.realPath(release?.folder ?? /** @type {string} */ (options.folder));
  const data = options.data ?? join(folder, ".data");
  await Deno.mkdir(data, { recursive: true });
  const log = options.log ?? ((text) => console.log(text));
  const encoder = new TextEncoder();
  const secretFile = options.secretFile ?? join(data, "realm-secret.txt");
  if (options.relay && options.base) throw new Error("A relay gives the game its address, so give a relay or a base, not both.");
  // A relayed game's address holds the ID it signs under, so the secret is read before the realm opens.
  if (!options.relay && !options.base) throw new Error("A game needs an address: give a base or a relay.");
  const base = options.relay ? relayedBase(options.relay, (await signerFromWords(await secretWords(secretFile))).id) : /** @type {string} */ (options.base);

  const basePath = new URL(base).pathname;

  const realm = await openRealm({
    base,
    portal: options.portal ?? DEFAULT_PORTAL,
    secretFile,
    dataFile: join(data, "realm-data.json"),
    card: release ? release.note.card : JSON.parse(await Deno.readTextFile(join(folder, "card.json"))),
    ...(release ? { runs: { realm: release.realm, release: release.id } } : {}),
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

  /** The displays connected now. @type {Map<number, Line>} */
  const seated = new Map();
  let connections = 0;

  /** The sealed process, while it runs. @type {{ child: Deno.ChildProcess, writer: WritableStreamDefaultWriter<Uint8Array>, heard: number } | null} */
  let sealed = null;
  let started = 0;
  /** When the last display left, or 0 while someone is playing. */
  let emptySince = Date.now();
  /** True while the game server is being stopped only because nobody is playing. */
  let resting = false;
  /** When the game's one timer is due, kept here so that it rings even after a rest. @type {number | null} */
  let due = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let ringing;
  /** How long a game server stopped for using too much of the processor waits before it starts again. */
  let penalty = 0;
  let notBefore = 0;
  const share = options.share ?? { part: SHARE, over: SHARE_MS, every: SHARE_CHECK_MS };
  const idle = options.idle ?? IDLE_MS;

  /** Set, or with null clear, the game's one timer. @param {number | null} at */
  function setTimer(at) {
    clearTimeout(ringing);
    due = at;
    if (at === null || stopped) return;
    // Timers cannot be set further ahead than about 24 days, so a longer wait is taken in steps.
    ringing = setTimeout(async () => {
      if (due === null || Date.now() < due) return setTimer(due);
      due = null;
      await awake();
      tell({ t: "timer" });
    }, Math.min(Math.max(0, at - Date.now()), 2 ** 31 - 1));
  }
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
      const text = JSON.stringify(m.data);
      if (text.length <= MAX_MESSAGE) seated.get(m.conn)?.send(text);
    } else if (m.t === "save" && typeof m.key === "string") {
      if (m.value === undefined) delete kept[m.key];
      else kept[m.key] = m.value;
      writing ||= setTimeout(() => write().catch((error) => log(String(error))), 200);
    } else if (m.t === "offer" && isId(m.id) && Array.isArray(m.records)) {
      realm.offer(m.id, m.records).catch((error) => log(String(error)));
    } else if (m.t === "timer") {
      setTimer(typeof m.ms === "number" && Number.isFinite(m.ms) ? Date.now() + Math.max(0, m.ms) : null);
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
    const names = (await Promise.all(["game.js", "game.wasm"].map((name) => Deno.stat(join(folder, name)).then(() => name, () => "")))).filter(Boolean);
    if (names.length !== 1) throw new Error("A game's folder holds game.js or game.wasm, one of them.");
    const pages = Math.floor(((options.memory ?? MEMORY_MB) * 1024) / 64);
    /** @type {Uint8Array | null} */
    let module = null;
    if (names[0] === "game.wasm") {
      // A module imports nothing from anywhere, so there are no files to check. Its bytes go in over its input.
      module = await Deno.readFile(join(folder, "game.wasm"));
      checkWasm(module, pages);
      await Deno.writeTextFile(entry, `import { sealWasm } from ${JSON.stringify(SEALED_JS)};\nsealWasm();\n`);
    } else {
      const game = pathToFileURL(join(folder, "game.js")).href;
      await Deno.writeTextFile(entry, `import server from ${JSON.stringify(game)};\nimport { seal } from ${JSON.stringify(SEALED_JS)};\nseal(server);\n`);
      await checkImports(entry, folder);
    }
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
      const rested = resting;
      resting = false;
      if (rested) return;
      // A game server that stopped for any other reason starts from what it saved, with no timer set.
      setTimer(null);
      if (!stopped) log(`The game server stopped (${status.signal ?? "exit " + status.code}). ${said.join(" ")}`.trim());
      for (const line of [...seated.values()]) line.close(1012, "the game server stopped");
      seated.clear();
      emptySince = Date.now();
    });
    emptySince = Date.now();
    if (module) tell({ t: "module", wasm: Buffer.from(module).toString("base64"), pages });
    tell({ t: "start", data: kept });
  }

  /** Make sure the game server is running, waiting a moment if it has only just stopped. */
  function awake() {
    if (sealed) return Promise.resolve();
    return (starting ??= (async () => {
      const wait = Math.max(started + RESTART_MS, notBefore) - Date.now();
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

  /** Let the game server rest: nobody is playing, and its timer, if set, is not due soon. */
  function rest() {
    if (!sealed || resting) return;
    resting = true;
    sealed.writer.close().catch(() => {});
  }

  const pinging = setInterval(() => {
    if (!sealed || resting) return;
    if (Date.now() - sealed.heard > DEAF_MS) return halt("The game server stopped answering, so it was stopped.");
    const quiet = emptySince && Date.now() - emptySince > idle && seated.size === 0 && (due === null || due - Date.now() > idle);
    if (quiet) return rest();
    tell({ t: "ping", n: Date.now() });
  }, Math.min(PING_MS, Math.max(100, idle)));

  /** The processor time a process has used so far, in seconds, or null if it cannot be told. @param {number} pid */
  async function used(pid) {
    try {
      if (Deno.build.os === "linux") {
        const fields = (await Deno.readTextFile(`/proc/${pid}/stat`)).split(") ").pop()?.split(" ") ?? [];
        return (Number(fields[11]) + Number(fields[12])) / 100;
      }
      if (Deno.build.os === "windows") return null;
      const out = await new Deno.Command("ps", { args: ["-o", "time=", "-p", String(pid)], stderr: "null" }).output();
      const parts = new TextDecoder().decode(out.stdout).trim().split(/[-:]/).map(Number);
      if (!out.success || !parts.length || parts.some(Number.isNaN)) return null;
      return parts.reduce((total, part, i) => total * (i === parts.length - 3 && parts.length === 4 ? 24 : 60) + part, 0);
    } catch {
      return null;
    }
  }

  // A game server may keep answering while using a whole processor, so its use is measured from
  // outside. One that takes more than its share is stopped, and waits longer each time before it may
  // start again.
  /** @type {{ pid: number, at: number, cpu: number }[]} */
  let samples = [];
  let measuring = false;
  const sharing = setInterval(async () => {
    const mine = sealed;
    if (!mine || resting || measuring) return;
    measuring = true;
    const cpu = await used(mine.child.pid);
    measuring = false;
    if (cpu === null || sealed !== mine) return;
    const now = Date.now();
    samples = samples.filter((sample) => sample.pid === mine.child.pid && now - sample.at <= share.over + share.every);
    samples.push({ pid: mine.child.pid, at: now, cpu });
    const first = samples[0];
    if (now - first.at < share.over) return;
    if ((cpu - first.cpu) / ((now - first.at) / 1000) <= share.part) return void (penalty = 0);
    penalty = Math.min(Math.max(penalty * 2, 5000), PENALTY_MS);
    notBefore = now + penalty;
    samples = [];
    halt(`The game server used more than its share of the processor, so it was stopped. It may start again in ${Math.round(penalty / 1000)} seconds.`);
  }, share.every);

  /**
   * A display asks for its line to the game server: refuse it, or say what to do with the line.
   * @param {Request} request
   * @returns {Promise<Response | Seat>}
   */
  async function seat(request) {
    const url = new URL(request.url);
    if (url.pathname !== basePath + "endlessmind/play") return new Response("Not found", { status: 404 });
    const guest = url.searchParams.get("guest") ?? "";
    if (!/^[a-f0-9]{32}$/.test(guest)) return new Response("Bad guest name", { status: 400 });
    // Browsers send the player's session with a connection opened by any page, so only this game's own
    // pages may connect.
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(base).origin && new URL(origin).host !== request.headers.get("host")) {
      return new Response("Not from this game's pages", { status: 403 });
    }
    const id = await realm.player(request);
    const conn = ++connections;
    let open = true;
    /** @type {Line | null} */
    let mine = null;
    return {
      async open(line) {
        await awake();
        if (!open) return;
        if (!sealed) return line.close(1012, "the game server is not running");
        seated.set(conn, (mine = line));
        emptySince = 0;
        const records = id ? realm.records(id).map(({ text, data, time, notes }) => ({ text, data, time, note: notes?.[id]?.text })) : [];
        tell({ t: "join", p: { conn, who: id ? "player:" + id : "guest:" + guest, id, name: id ? realm.playerName(id) : "Guest", guest: "guest:" + guest, records } });
      },
      message(text) {
        if (text.length > MAX_MESSAGE || !seated.has(conn)) return;
        try {
          tell({ t: "message", conn, data: JSON.parse(text) });
        } catch {
          // Not JSON: nothing a game server could use.
        }
      },
      close() {
        open = false;
        if (mine && seated.get(conn) === mine && seated.delete(conn)) tell({ t: "leave", conn });
        if (seated.size === 0 && !emptySince) emptySince = Date.now();
      },
    };
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

  /** Answer a request that is not a display's line. @param {Request} request */
  async function answer(request) {
    const mine = await realm.handle(request);
    if (mine) return mine;
    const url = new URL(request.url);
    if (!url.pathname.startsWith(basePath) || (request.method !== "GET" && request.method !== "HEAD")) return new Response("Not found", { status: 404 });
    const name = decodeURIComponent(url.pathname.slice(basePath.length));
    if (name === "endlessmind/play.js") {
      return new Response(await Deno.readFile(PLAY_JS), { headers: { "content-type": TYPES[".js"], "cache-control": "no-cache" } });
    }
    return (await file(name)) ?? new Response("Not found", { status: 404 });
  }

  /** Answer any request for the game's address. @param {Request} request @returns {Promise<Response>} */
  async function handle(request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return answer(request);
    const place = await seat(request);
    if (place instanceof Response) return place;
    const { socket, response } = Deno.upgradeWebSocket(request);
    socket.onopen = () => place.open({ send: (text) => socket.readyState === WebSocket.OPEN && socket.send(text), close: (code, reason) => socket.close(code, reason) });
    socket.onmessage = (event) => typeof event.data === "string" && place.message(event.data);
    socket.onclose = () => place.close();
    return response;
  }

  // Players who cannot connect to this computer reach the game through a relay.
  const relayed = options.relay ? dial({ relay: options.relay, signer: realm.signer, answer, seat, log }) : null;
  if (relayed) {
    // Wait a little for the relay, so that the address is good by the time it is shown.
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let slow;
    await Promise.race([relayed.ready, new Promise((later) => (slow = setTimeout(later, RELAY_MS)))]);
    clearTimeout(slow);
  }

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
    handle,
    /** Whether the game server is running now. */
    get awake() {
      return sealed !== null;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(pinging);
      clearInterval(sharing);
      clearTimeout(ringing);
      watcher?.close();
      relayed?.stop();
      for (const line of [...seated.values()]) line.close(1001, "the game is closing");
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
