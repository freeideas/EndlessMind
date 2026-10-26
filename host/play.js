// The display's line to its game server. The host serves this file at `<base>endlessmind/play.js`.
//
//   import { play } from "./endlessmind/play.js";
//   const server = play({ onMessage: (data) => draw(data) });
//   server.send({ type: "move", to: 7 });
//
// The line comes back by itself when it drops, as it does whenever a phone looks away: the game server
// then sees the player leave and join again. Call `server.reconnect()` after the player signs in or
// out, so the game server learns who they now are.
//
// A line can also die without closing, when a network between here and the host forgets it: a page
// left open for an hour, or a laptop that slept. It still looks open, and whatever is sent on it is
// lost. So the line asks the host "ping" now and then, and when the page comes back into view, and
// starts a new line when no answer comes.

const BASE = new URL(".", import.meta.url).href.replace(/endlessmind\/$/, "");
const CHECK_MS = 15000; // how often a quiet line asks whether the host still hears it
const ANSWER_MS = 5000; // how long an answer may take before the line is taken for dead

/** The name this browser plays under until someone signs in: 32 random hex characters, kept here. */
function guestName() {
  const fresh = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  try {
    const kept = localStorage.getItem("endlessmind-guest");
    if (kept && /^[a-f0-9]{32}$/.test(kept)) return kept;
    localStorage.setItem("endlessmind-guest", fresh);
  } catch {
    // No storage (a private window, perhaps): this visit plays under a name of its own.
  }
  return fresh;
}

/**
 * @param {{ onMessage: (data: any) => void, onOpen?: () => void, onClose?: () => void }} options
 * @returns {{ send(data: unknown): void, reconnect(): void }}
 */
export function play(options) {
  const address = BASE.replace(/^http/, "ws") + "endlessmind/play?guest=" + guestName();
  /** @type {WebSocket} */
  let socket;
  /** @type {string[]} */
  let unsent = [];
  let wait = 250;
  let heard = Date.now();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let deadline;

  function open() {
    const mine = (socket = new WebSocket(address));
    clearTimeout(deadline);
    deadline = undefined;
    mine.onopen = () => {
      wait = 250;
      heard = Date.now();
      for (const text of unsent.splice(0)) mine.send(text);
      options.onOpen?.();
    };
    mine.onmessage = (event) => {
      if (mine !== socket) return;
      heard = Date.now();
      clearTimeout(deadline);
      deadline = undefined;
      if (event.data !== "pong") options.onMessage(JSON.parse(event.data));
    };
    mine.onclose = () => {
      if (mine !== socket) return;
      options.onClose?.();
      setTimeout(open, wait);
      wait = Math.min(wait * 2, 5000);
    };
  }

  /** Ask whether the host still hears this line; if no answer comes, start a new one. */
  function check() {
    const mine = socket;
    if (mine.readyState !== WebSocket.OPEN || deadline !== undefined) return;
    mine.send("ping");
    deadline = setTimeout(() => {
      if (mine !== socket) return;
      options.onClose?.();
      open();
      mine.close();
    }, ANSWER_MS);
  }

  open();
  setInterval(() => Date.now() - heard >= CHECK_MS && check(), CHECK_MS / 3);
  globalThis.document?.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
  globalThis.addEventListener?.("online", check);

  return {
    send(data) {
      const text = JSON.stringify(data);
      if (socket.readyState === WebSocket.OPEN) socket.send(text);
      else unsent.push(text);
    },
    reconnect() {
      const old = socket;
      unsent = [];
      open();
      old.close();
    },
  };
}
