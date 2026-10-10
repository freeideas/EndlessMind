// The display's line to its game server. The host serves this file at `<base>endlessmind/play.js`.
//
//   import { play } from "./endlessmind/play.js";
//   const server = play({ onMessage: (data) => draw(data) });
//   server.send({ type: "move", to: 7 });
//
// The line comes back by itself when it drops, as it does whenever a phone looks away: the game server
// then sees the player leave and join again. Call `server.reconnect()` after the player signs in or
// out, so the game server learns who they now are.

const BASE = new URL(".", import.meta.url).href.replace(/endlessmind\/$/, "");

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

  function open() {
    const mine = (socket = new WebSocket(address));
    mine.onopen = () => {
      wait = 250;
      for (const text of unsent.splice(0)) mine.send(text);
      options.onOpen?.();
    };
    mine.onmessage = (event) => mine === socket && options.onMessage(JSON.parse(event.data));
    mine.onclose = () => {
      if (mine !== socket) return;
      options.onClose?.();
      setTimeout(open, wait);
      wait = Math.min(wait * 2, 5000);
    };
  }
  open();

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
