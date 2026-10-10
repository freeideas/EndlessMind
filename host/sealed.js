// The inside of the seal. A game server runs in a process of its own that may not touch files, the
// network or other programs; this file is all that stands between it and the host. The host writes one
// JSON message per line to this process, and this file turns them into the calls a game server answers
// (start, join, leave, message, timer) and turns what the game asks for (send, save, timer, offer) back
// into lines. See "Game servers" in specs/PROTOCOL.md.

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
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
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
    timer(ms) {
      clearTimeout(timer);
      if (ms !== null) timer = setTimeout(() => run(() => server.timer?.(game)), Math.max(0, ms));
    },
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

  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of Deno.stdin.readable) {
    const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) if (line) handle(JSON.parse(line));
  }
  Deno.exit(0);
}
