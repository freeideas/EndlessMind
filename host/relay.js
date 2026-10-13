// The relay: how players reach a game that runs on a computer they cannot connect to, such as its
// maker's computer at home. The maker's host program dials out to a relay and proves which realm it is;
// the relay then gives the game a site of its own, `<realm ID>.<the relay's name>`, and passes every
// request and every display's line for that site down the connection the maker opened.
// See "Relays" in specs/PROTOCOL.md.
//
//   openRelay({ base })  the relay's side, for a server that answers other things too (see hosting.js)
//   runRelay({ base })   the same with a web server of its own
//   dial({ relay, ... }) the game's side, used by openGame

import { hex, isId } from "../shared/keys.js";
import { addSignature, isComplete } from "../shared/signed.js";

const CHUNK = 32 * 1024; // an answer's body travels in pieces of this many bytes
const MAX_BODY = 1024 * 1024; // the longest body a relay passes on from a player
const MAX_MESSAGE = 64 * 1024; // the longest message on a display's line, in characters
const MAX_OPEN = 200; // how many requests and lines one game may have open at once
const ANSWER_MS = 60 * 1000; // how long a relay waits for a game to start answering a request
const BUFFER = 1024 * 1024; // the game waits while this many bytes are still on their way to the relay

/** Headers that belong to one connection and are never passed on. */
const OWN = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "host", "content-length", "te", "trailer"]);

/** @param {Headers} headers @returns {[string, string][]} */
const passable = (headers) => [...headers].filter(([name]) => !OWN.has(name) && !name.startsWith("sec-websocket-") && !name.startsWith("proxy-"));

/** @param {Uint8Array} bytes */
function toBase64(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

/** @param {string} text */
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** A plain page of the host program's own. @param {string} title @param {string} text @param {number} status */
export function page(title, text, status) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>` +
    `<body style="font: 1.1rem system-ui, sans-serif; max-width: 34rem; margin: 3rem auto; padding: 0 1rem"><h1>${title}</h1><p>${text}</p>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * The address a relay gives a realm: a site of its own under the relay's name.
 * @param {string} relay the relay's address, such as "https://relay.example/"
 * @param {string} id the realm's ID
 */
export function relayedBase(relay, id) {
  const url = new URL(relay);
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("A relay's address is a site's root, such as https://relay.example/");
  return `${url.protocol}//${id}.${url.host}/`;
}

/**
 * @typedef {{ answer?: (response: Response) => void, timer?: ReturnType<typeof setTimeout>, body?: ReadableStreamDefaultController<Uint8Array>, socket?: WebSocket }} Open
 * One request or one display's line that a relay is passing to a game.
 * @typedef {{ socket: WebSocket, next: number, open: Map<number, Open> }} Passage
 * A game's connection to the relay.
 */

/**
 * A relay without a web server of its own: give `handle` each request that arrives. The relay must be
 * reachable at `base` and at every name under it, with HTTPS in front of both.
 * @param {{ base: string, games?: number, log?: (text: string) => void }} options
 * `games` is how many games it passes at once.
 */
export function openRelay(options) {
  const own = new URL(options.base);
  relayedBase(own.href, "x");
  const most = options.games ?? 20;
  const log = options.log ?? ((text) => console.log(text));
  /** The games here now, by realm ID. @type {Map<string, Passage>} */
  const games = new Map();

  /** @param {Passage} game @param {Record<string, unknown>} message */
  const tell = (game, message) => game.socket.readyState === WebSocket.OPEN && game.socket.send(JSON.stringify(message));

  /** The game's connection ended: nothing it was answering can finish. @param {Passage} game */
  function drop(game) {
    for (const open of game.open.values()) {
      clearTimeout(open.timer);
      open.answer?.(page("This game just left", "It runs on its maker's computer, so it is here only while that computer is on.", 502));
      try {
        open.body?.error(new Error("the game left"));
        open.socket?.close(1012, "the game left");
      } catch {
        // Already closed.
      }
    }
    game.open.clear();
  }

  /** A game's host program asks to be relayed. @param {Request} request */
  function welcome(request) {
    const { socket, response } = Deno.upgradeWebSocket(request);
    /** @type {Passage} */
    const game = { socket, next: 0, open: new Map() };
    const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
    /** @type {string | null} */
    let id = null;
    let checking = false;
    socket.onopen = () => tell(game, { t: "hello", nonce });
    socket.onmessage = async (event) => {
      /** @type {any} */
      let m;
      try {
        m = JSON.parse(event.data);
      } catch {
        return socket.close(1008, "not JSON");
      }
      if (id) return heard(game, m);
      if (checking) return;
      checking = true;
      const note = m?.note;
      const signer = note?.signers?.[0];
      const good = m.t === "note" && note.v === 1 && note.type === "relay" && note.signers.length === 1 && isId(signer) &&
        note.relay === own.href && note.nonce === nonce && (await isComplete(note));
      if (!good) return socket.close(1008, "that note does not prove a realm");
      const before = games.get(signer);
      if (!before && games.size >= most) {
        tell(game, { t: "full" });
        return socket.close(1013, "no room");
      }
      // The same realm dialing again takes over: its maker started the game again.
      before?.socket.close(1000, "the game connected again");
      games.set((id = signer), game);
      tell(game, { t: "ready", base: relayedBase(own.href, signer) });
      log(`Relaying ${relayedBase(own.href, signer)}`);
    };
    socket.onclose = () => {
      if (id && games.get(id) === game) games.delete(id);
      drop(game);
    };
    return response;
  }

  /** What a game sent back. @param {Passage} game @param {any} m */
  function heard(game, m) {
    const open = game.open.get(m.n);
    if (!open) return;
    if (m.t === "response") {
      if (open.socket) {
        // The game refused this display's line.
        game.open.delete(m.n);
        return open.socket.close(1008, "refused");
      }
      if (!open.answer) return;
      clearTimeout(open.timer);
      const status = Number.isInteger(m.status) && m.status >= 200 && m.status <= 599 ? m.status : 502;
      const empty = status === 204 || status === 205 || status === 304;
      const body = empty ? null : new ReadableStream({
        start: (controller) => void (open.body = controller),
        cancel() {
          if (game.open.delete(m.n)) tell(game, { t: "close", n: m.n });
        },
      });
      let headers;
      try {
        headers = new Headers(passable(new Headers(m.headers)));
      } catch {
        headers = new Headers();
      }
      open.answer(new Response(body, { status, headers }));
      open.answer = undefined;
    } else if (m.t === "body" && open.body && typeof m.data === "string") {
      try {
        open.body.enqueue(fromBase64(m.data));
      } catch {
        // Not base64, or the player stopped listening.
      }
    } else if (m.t === "end" && !open.socket && !open.answer) {
      game.open.delete(m.n);
      open.body?.close();
    } else if (m.t === "text" && open.socket?.readyState === WebSocket.OPEN && typeof m.data === "string" && m.data.length <= MAX_MESSAGE) {
      open.socket.send(m.data);
    } else if (m.t === "close" && open.socket) {
      game.open.delete(m.n);
      const code = m.code === 1000 || (m.code >= 3000 && m.code <= 4999) ? m.code : 1012;
      open.socket.close(code, typeof m.reason === "string" ? m.reason.slice(0, 100) : "");
    }
  }

  /** Pass one of a player's requests to a game. @param {Passage} game @param {Request} request @param {URL} url */
  async function pass(game, request, url) {
    if (game.open.size >= MAX_OPEN) return page("This game is busy", "Try again in a moment.", 503);
    const n = ++game.next;
    const path = url.pathname + url.search;
    const headers = passable(request.headers);

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const { socket, response } = Deno.upgradeWebSocket(request);
      game.open.set(n, { socket });
      socket.onopen = () => {
        if (game.open.has(n)) tell(game, { t: "open", n, path, headers });
        else socket.close(1012, "the game left");
      };
      socket.onmessage = (event) => {
        if (typeof event.data === "string" && event.data.length <= MAX_MESSAGE && game.open.has(n)) tell(game, { t: "text", n, data: event.data });
      };
      socket.onclose = () => {
        if (game.open.delete(n)) tell(game, { t: "close", n });
      };
      return response;
    }

    /** @type {string | undefined} */
    let body;
    if (request.body) {
      if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("Too much", { status: 413 });
      const parts = [];
      let size = 0;
      for await (const part of request.body) {
        if ((size += part.length) > MAX_BODY) return new Response("Too much", { status: 413 });
        parts.push(part);
      }
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const part of parts) {
        bytes.set(part, at);
        at += part.length;
      }
      body = toBase64(bytes);
    }
    return await new Promise((answer) => {
      const timer = setTimeout(() => {
        game.open.delete(n);
        answer(page("This game is not answering", "Try again in a moment.", 504));
      }, ANSWER_MS);
      game.open.set(n, { answer, timer });
      tell(game, { t: "request", n, method: request.method, path, headers, ...(body ? { body } : {}) });
    });
  }

  return {
    base: own.href,
    /** The IDs of the realms relayed now. */
    games: () => [...games.keys()],
    /**
     * Answer a request that is the relay's: a game asking to be relayed, or anything for a name under
     * the relay's own. Returns null for everything else at the relay's own name.
     * @param {Request} request
     * @returns {Response | Promise<Response> | null}
     */
    handle(request) {
      const url = new URL(request.url);
      const host = (request.headers.get("host") ?? "").toLowerCase();
      if (host === own.host) {
        const asks = url.pathname === "/endlessmind/relay" && request.headers.get("upgrade")?.toLowerCase() === "websocket";
        return asks ? welcome(request) : null;
      }
      if (!host.endsWith("." + own.host)) return null;
      const game = games.get(host.slice(0, -own.host.length - 1));
      if (!game) return page("This game is not running now", "It runs on its maker's computer, so it is here only while that computer is on.", 503);
      return pass(game, request, url);
    },
    stop() {
      for (const game of games.values()) game.socket.close(1001, "the relay is closing");
    },
  };
}

/**
 * Run a relay with a web server of its own.
 * @param {{ base: string, port?: number, hostname?: string, games?: number, log?: (text: string) => void }} options
 */
export function runRelay(options) {
  const relay = openRelay(options);
  const server = Deno.serve({ port: options.port ?? 8100, hostname: options.hostname ?? "127.0.0.1", onListen() {} }, (request) => {
    const answer = relay.handle(request);
    if (answer) return answer;
    if (new URL(request.url).pathname !== "/") return new Response("Not found", { status: 404 });
    return page("An Endless Mind relay", "This passes players to games that run on their makers' own computers. Each game has an address of its own here while its maker's computer is on.", 200);
  });
  return {
    base: relay.base,
    games: relay.games,
    async stop() {
      relay.stop();
      await server.shutdown();
    },
  };
}

/**
 * @typedef {{ send(text: string): void, close(code?: number, reason?: string): void }} Line
 * A display's connection, whether it came straight to this computer or through a relay.
 * @typedef {{ open(line: Line): unknown, message(text: string): void, close(): void }} Seat
 * What a game does with one display's line.
 */

/**
 * Keep a game connected to a relay, dialing again whenever the connection drops.
 * @param {{
 *   relay: string,
 *   signer: import("../shared/keys.js").Signer,
 *   answer: (request: Request) => Promise<Response>,
 *   seat: (request: Request) => Promise<Response | Seat>,
 *   log?: (text: string) => void,
 * }} options
 * `answer` answers a player's request; `seat` accepts or refuses a display's line.
 */
export function dial(options) {
  const relay = new URL(options.relay).href;
  const base = relayedBase(relay, options.signer.id);
  const log = options.log ?? ((text) => console.log(text));
  /** @type {WebSocket} */
  let socket;
  let stopped = false;
  let wait = 500;
  let quiet = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let again;
  /** @type {() => void} */
  let isReady = () => {};
  /** @type {Promise<void>} */
  const ready = new Promise((done) => (isReady = done));
  /** The displays' lines open now. @type {Map<number, { seat: Promise<Seat | null> }>} */
  const seats = new Map();
  /** The requests being answered now. @type {Set<number>} */
  const answering = new Set();

  /** @param {WebSocket} mine @param {Record<string, unknown>} message */
  const send = (mine, message) => mine.readyState === WebSocket.OPEN && mine.send(JSON.stringify(message));

  /** @param {any} m */
  const asked = (m) => {
    if (typeof m.path !== "string" || !m.path.startsWith("/")) throw new Error("bad path");
    return new Request(base.slice(0, -1) + m.path, { method: m.method ?? "GET", headers: m.headers, body: m.body ? fromBase64(m.body) : undefined });
  };

  /** @param {WebSocket} mine @param {any} m */
  async function request(mine, m) {
    answering.add(m.n);
    try {
      const response = await options.answer(asked(m));
      send(mine, { t: "response", n: m.n, status: response.status, headers: passable(response.headers) });
      for await (const part of response.body ?? []) {
        for (let at = 0; at < part.length; at += CHUNK) {
          while (mine.bufferedAmount > BUFFER && mine.readyState === WebSocket.OPEN) await new Promise((later) => setTimeout(later, 10));
          if (!answering.has(m.n) || mine.readyState !== WebSocket.OPEN) return;
          send(mine, { t: "body", n: m.n, data: toBase64(part.subarray(at, at + CHUNK)) });
        }
      }
    } catch (error) {
      log(`A request through the relay failed. ${error instanceof Error ? error.message : error}`);
      send(mine, { t: "response", n: m.n, status: 500, headers: [] });
    } finally {
      if (answering.delete(m.n)) send(mine, { t: "end", n: m.n });
    }
  }

  /** @param {WebSocket} mine @param {any} m */
  function hear(mine, m) {
    if (m.t === "hello") {
      const note = { v: 1, type: "relay", signers: [options.signer.id], time: Date.now(), relay, nonce: m.nonce };
      addSignature(note, options.signer).then((signed) => send(mine, { t: "note", note: signed }));
    } else if (m.t === "ready") {
      if (m.base !== base) {
        log(`The relay offered ${m.base}, not ${base}, so it is not used.`);
        stopped = true;
        return mine.close();
      }
      if (quiet) log("Connected to the relay again.");
      wait = 500;
      quiet = false;
      isReady();
    } else if (m.t === "full") {
      if (!quiet) log("The relay has no room for another game now. Still trying.");
      quiet = true;
    } else if (m.t === "request") {
      request(mine, m);
    } else if (m.t === "open") {
      const n = m.n;
      /** @type {Line} */
      const line = {
        send: (text) => seats.has(n) && send(mine, { t: "text", n, data: text }),
        close(code, reason) {
          const entry = seats.get(n);
          if (!entry) return;
          seats.delete(n);
          send(mine, { t: "close", n, code, reason });
          entry.seat.then((seat) => seat?.close());
        },
      };
      const seat = (async () => {
        try {
          const seat = await options.seat(asked(m));
          if (!(seat instanceof Response)) {
            // The line may have closed while the game was deciding.
            if (seats.has(n)) await seat.open(line);
            return seat;
          }
          send(mine, { t: "response", n, status: seat.status, headers: [] });
        } catch (error) {
          log(`A display's line through the relay failed. ${error instanceof Error ? error.message : error}`);
          send(mine, { t: "response", n, status: 500, headers: [] });
        }
        seats.delete(n);
        return null;
      })();
      seats.set(n, { seat });
    } else if (m.t === "text") {
      const entry = seats.get(m.n);
      if (entry && typeof m.data === "string") entry.seat = entry.seat.then((seat) => (seat?.message(m.data), seat));
    } else if (m.t === "close") {
      const entry = seats.get(m.n);
      seats.delete(m.n);
      entry?.seat.then((seat) => seat?.close());
      answering.delete(m.n);
    }
  }

  function open() {
    const mine = (socket = new WebSocket(relay.replace(/^http/, "ws") + "endlessmind/relay"));
    mine.onmessage = (event) => {
      try {
        hear(mine, JSON.parse(event.data));
      } catch {
        // Nothing this game can use.
      }
    };
    mine.onerror = () => {};
    mine.onclose = () => {
      for (const entry of seats.values()) entry.seat.then((seat) => seat?.close());
      seats.clear();
      answering.clear();
      if (stopped) return;
      if (!quiet) log(`The relay at ${relay} is not answering. Still trying.`);
      quiet = true;
      again = setTimeout(open, wait);
      wait = Math.min(wait * 2, 10000);
    };
  }
  open();

  return {
    /** The address players use. */
    base,
    /** Settles once the relay has first accepted this game. */
    ready,
    stop() {
      stopped = true;
      clearTimeout(again);
      socket.close();
    },
  };
}
