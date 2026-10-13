// The inside of the seal. A game server runs in a process of its own that may not touch files, the
// network or other programs; this file is all that stands between it and the host. The host writes one
// JSON message per line to this process, and this file turns them into the calls a game server answers
// (start, join, leave, message, timer) and turns what the game asks for (send, save, timer, offer) back
// into lines. Nothing here can be relied on by the host: the game shares this process, so the host
// checks every line it reads and measures the process from outside. See "Game servers" in specs/PROTOCOL.md.

/**
 * @typedef {{ text: string, data?: Record<string, unknown>, time?: number }} RecordText
 * @typedef {{ conn: number, who: string, id: string | null, name: string, guest: string, records: RecordText[] }} Player
 * `who` names the person: "player:<ID>" once signed in, otherwise the same as `guest`. `guest` is the
 * name this browser had before anyone signed in, so a game can carry a guest's progress over.
 * `records` are the records this realm has signed with the player.
 * @typedef {{
 *   send(player: Player, data: unknown): void,
 *   load(key: string): any,
 *   save(key: string, value: unknown): void,
 *   timer(ms: number | null): void,
 *   offer(player: Player, records: RecordText[]): void,
 *   players(): Player[],
 * }} Game
 * @typedef {{
 *   start?: (game: Game) => unknown,
 *   join?: (game: Game, player: Player) => unknown,
 *   leave?: (game: Game, player: Player) => unknown,
 *   message?: (game: Game, player: Player, data: any) => unknown,
 *   timer?: (game: Game) => unknown,
 * }} GameServer
 */

const encoder = new TextEncoder();

/** @param {Record<string, unknown>} message */
function out(message) {
  const bytes = encoder.encode(JSON.stringify(message) + "\n");
  for (let sent = 0; sent < bytes.length;) sent += Deno.stdout.writeSync(bytes.subarray(sent));
}

/** @param {unknown} value */
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** Run a game server until the host closes this process's input. @param {GameServer} server */
export async function seal(server) {
  /** @type {Map<number, Player>} */
  const players = new Map();
  /** @type {Record<string, unknown>} */
  let data = {};
  /** Calls run one at a time, in the order they arrived. */
  let queue = Promise.resolve();

  /** @param {() => unknown} call */
  const run = (call) =>
    (queue = queue.then(async () => {
      try {
        await call();
      } catch (error) {
        out({ t: "error", text: String(error instanceof Error ? (error.stack ?? error.message) : error) });
      }
    }));

  /** @type {Game} */
  const game = {
    send: (player, message) => out({ t: "send", conn: player.conn, data: message }),
    load: (key) => copy(data[key]),
    save(key, value) {
      if (value === undefined) delete data[key];
      else data[key] = copy(value);
      out({ t: "save", key, value });
    },
    // The host keeps the timer, so that it still rings after the game server has rested and started again.
    timer: (ms) => out({ t: "timer", ms }),
    offer(player, records) {
      if (player.id) out({ t: "offer", id: player.id, records });
    },
    players: () => [...players.values()],
  };

  // Whatever the game prints goes to the host as a log line, never onto the line protocol.
  for (const level of /** @type {const} */ (["log", "info", "warn", "error", "debug"])) {
    console[level] = (...parts) => out({ t: "log", text: parts.map((part) => (typeof part === "string" ? part : Deno.inspect(part))).join(" ") });
  }

  /** @param {any} m */
  function handle(m) {
    if (m.t === "ping") return out({ t: "pong", n: m.n });
    if (m.t === "start") {
      data = m.data ?? {};
      return run(() => server.start?.(game));
    }
    if (m.t === "timer") return run(() => server.timer?.(game));
    if (m.t === "join") {
      players.set(m.p.conn, m.p);
      return run(() => server.join?.(game, m.p));
    }
    const player = players.get(m.conn);
    if (!player) return;
    if (m.t === "leave") {
      players.delete(m.conn);
      return run(() => server.leave?.(game, player));
    }
    if (m.t === "message") return run(() => server.message?.(game, player, m.data));
  }

  await lines(handle);
}

/** Read the host's lines until it closes this process's input, give each to `handle`, then exit. @param {(message: any) => void} handle */
async function lines(handle) {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of Deno.stdin.readable) {
    const parts = (rest + decoder.decode(chunk, { stream: true })).split("\n");
    rest = parts.pop() ?? "";
    for (const line of parts) if (line) handle(JSON.parse(line));
  }
  Deno.exit(0);
}

const ASK_MOST = 8 * 1024 * 1024; // the longest request a module may make of its host, in bytes
const TABLE_MOST = 100000; // the most entries a module's table may start with

/**
 * Check a WebAssembly module against the surface a game server may have, reading its bytes directly:
 * it imports only `host.ask`, exports `memory`, `alloc` and `call`, and declares the most memory it may
 * ever use, no more than `pages` pages of 64 KB (an engine flag does not limit WebAssembly memory).
 * Throws an error that says what is wrong.
 * @param {Uint8Array} bytes @param {number} pages
 */
export function checkWasm(bytes, pages) {
  /** @param {string} why @returns {never} */
  const bad = (why) => {
    throw new Error(`The WebAssembly module ${why}.`);
  };
  if (bytes.length < 8 || [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0].some((byte, i) => bytes[i] !== byte)) bad("is not a WebAssembly module");
  let at = 8;
  const u32 = () => {
    for (let value = 0, shift = 0; ; shift += 7) {
      if (at >= bytes.length || shift > 28) bad("is malformed");
      const byte = bytes[at++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
    }
  };
  const name = () => {
    const length = u32();
    if (at + length > bytes.length) bad("is malformed");
    return new TextDecoder().decode(bytes.subarray(at, (at += length)));
  };
  const limits = () => {
    const flag = bytes[at++];
    if (flag > 1) bad("uses shared or 64-bit memory");
    const min = u32();
    return { min, max: flag ? u32() : null };
  };
  /** @type {Map<string, number>} */
  const exported = new Map();
  while (at < bytes.length) {
    const id = bytes[at++];
    const size = u32();
    const end = at + size;
    if (end > bytes.length) bad("is malformed");
    if (id === 2) {
      for (let n = u32(); n > 0; n--) {
        const from = name() + "." + name();
        if (from !== "host.ask" || bytes[at++] !== 0) bad(`imports ${from}, but may import only host.ask`);
        u32();
      }
    } else if (id === 4) {
      for (let n = u32(); n > 0; n--) {
        at++;
        if (limits().min > TABLE_MOST) bad("starts with too large a table");
      }
    } else if (id === 5) {
      for (let n = u32(); n > 0; n--) {
        const { min, max } = limits();
        if (max === null) bad("must declare the most memory it may use");
        if (max > pages || min > max) bad(`may use up to ${max} pages of memory (64 KB each), more than the ${pages} allowed`);
      }
    } else if (id === 7) {
      for (let n = u32(); n > 0; n--) {
        const exports = name();
        exported.set(exports, bytes[at++]);
        u32();
      }
    }
    at = end;
  }
  for (const [needed, kind] of /** @type {const} */ ([["memory", 2], ["alloc", 0], ["call", 0]])) {
    if (exported.get(needed) !== kind) bad(`must export ${needed}`);
  }
}

/**
 * Run a game server compiled to WebAssembly until the host closes this process's input. The host's
 * first line carries the module's bytes; the rest are the same lines a JavaScript game server gets.
 */
export async function sealWasm() {
  /** @type {Map<number, Player>} */
  const players = new Map();
  /** @type {{ memory: WebAssembly.Memory, alloc(length: number): number, call(pointer: number, length: number): void } | null} */
  let wasm = null;
  const decoder = new TextDecoder();
  let queue = Promise.resolve();

  /** @param {number} pointer @param {number} length @returns {Uint8Array} */
  function view(pointer, length) {
    const bytes = new Uint8Array(/** @type {NonNullable<typeof wasm>} */ (wasm).memory.buffer);
    if (length > ASK_MOST || pointer + length > bytes.length) throw new Error("A pointer and length point outside the module's memory.");
    return bytes.subarray(pointer, pointer + length);
  }

  /** What the module asks of its host: one JSON request. @param {number} pointer @param {number} length */
  function ask(pointer, length) {
    const m = JSON.parse(decoder.decode(view(pointer >>> 0, length >>> 0)));
    if (m.t === "send") out({ t: "send", conn: m.conn, data: m.data });
    else if (m.t === "save" && typeof m.key === "string") out({ t: "save", key: m.key, value: m.value });
    else if (m.t === "timer") out({ t: "timer", ms: m.ms ?? null });
    else if (m.t === "offer") out({ t: "offer", id: m.id, records: m.records });
    else if (m.t === "log") out({ t: "log", text: String(m.text) });
    else throw new Error("The module asked for something unknown: " + JSON.stringify(m.t));
  }

  /** One call to the module. @param {Record<string, unknown>} message */
  function call(message) {
    const module = /** @type {NonNullable<typeof wasm>} */ (wasm);
    const bytes = encoder.encode(JSON.stringify(message));
    const pointer = module.alloc(bytes.length) >>> 0;
    view(pointer, bytes.length).set(bytes);
    module.call(pointer, bytes.length);
  }

  /** @param {() => unknown} work */
  const run = (work) =>
    (queue = queue.then(async () => {
      try {
        await work();
      } catch (error) {
        out({ t: "error", text: String(error instanceof Error ? (error.stack ?? error.message) : error) });
      }
    }));

  /** @param {any} m */
  function handle(m) {
    if (m.t === "ping") return out({ t: "pong", n: m.n });
    if (m.t === "module") {
      return run(async () => {
        try {
          const bytes = Uint8Array.from(atob(m.wasm), (char) => char.charCodeAt(0));
          checkWasm(bytes, m.pages);
          wasm = /** @type {any} */ ((await WebAssembly.instantiate(bytes, { host: { ask } })).instance.exports);
        } catch (error) {
          out({ t: "error", text: String(error) });
          Deno.exit(1); // without its module there is nothing to run
        }
      });
    }
    if (m.t === "join") {
      players.set(m.p.conn, m.p);
      return run(() => call({ t: "join", player: m.p }));
    }
    if (m.t === "start") return run(() => call({ t: "start", data: m.data ?? {} }));
    if (m.t === "timer") return run(() => call({ t: "timer" }));
    const player = players.get(m.conn);
    if (!player) return;
    if (m.t === "leave") {
      players.delete(m.conn);
      return run(() => call({ t: "leave", player }));
    }
    if (m.t === "message") return run(() => call({ t: "message", player, data: m.data }));
  }

  await lines(handle);
}
