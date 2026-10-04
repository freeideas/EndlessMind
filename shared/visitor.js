// A visit has one lifetime, one handshake and one ordered stream of views.
import { randomId } from "./encoding.js";
import { addressOf } from "./crypto.js";
import { Relay } from "./relay.js";

/** @param {string} server */
export function relayUrl(server) {
  const url = new URL("/ws", server);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

/**
 * Visit a realm. With several servers, the visit starts on the first that
 * answers and moves to the next whenever the referee goes quiet, so losing
 * one server does not end it.
 * @param {{server?: string, servers?: string[], address: string, keys: CryptoKeyPair, release: string,
 * character: unknown, onView: (view: any) => void, status: (text: string) => void, signal?: AbortSignal,
 * patienceMs?: number}} options  `address` is whoever referees; `patienceMs` is how long silence is borne
 */
export async function visit(
  { server, servers = server ? [server] : [], address, keys, release, character, onView, status, signal, patienceMs = 15_000 },
) {
  const me = await addressOf(keys.publicKey);
  let at = 0;
  /** @type {Relay | undefined} */
  let relay;
  let request = randomId(), session = "", instance = "";
  let seq = 0, actionSeq = 0, lastHeard = Date.now();
  let stopped = false, moving = false;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;
  const send = (/** @type {string} */ kind, /** @type {unknown} */ body) =>
    relay ? relay.send(keys, address, kind, body).catch(() => {}) : Promise.resolve();
  function detach() {
    relay?.removeEventListener("message", message);
    relay?.removeEventListener("replaced", replaced);
    relay?.close();
  }
  /** Connect to the server at this place in the list. @param {number} index */
  async function attach(index) {
    at = index;
    relay = new Relay(relayUrl(servers[at]));
    relay.addEventListener("message", message);
    relay.addEventListener("replaced", replaced);
    await relay.connect();
    await relay.addKey(keys);
  }
  function forget() {
    request = randomId();
    session = "";
    instance = "";
    seq = 0;
    actionSeq = 0;
    lastHeard = Date.now();
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    signal?.removeEventListener("abort", stop);
    const old = relay;
    old?.removeEventListener("message", message);
    old?.removeEventListener("replaced", replaced);
    if (session && old) send("emind.leave", { session }).finally(() => old.close());
    else old?.close();
  }
  function enter() {
    return send("emind.enter", { request, release, character });
  }
  const message = (/** @type {Event} */ event) => {
    const env = /** @type {CustomEvent} */ (event).detail;
    if (stopped || env.from !== address || env.to !== me) return;
    const b = env.body ?? {};
    if (
      env.kind === "emind.welcome" && b.request === request && b.release === release &&
      typeof b.session === "string" && typeof b.instance === "string"
    ) {
      if (session && (session !== b.session || instance !== b.instance)) return;
      session = b.session;
      instance = b.instance;
      lastHeard = Date.now();
      status(`You are in ${b.name}.`);
    } else if (env.kind === "emind.refused" && b.request === request) {
      status(`The realm refused you: ${b.reason || "no reason given"}`);
      stop();
    } else if (
      env.kind === "emind.state" && session && b.session === session &&
      Number.isSafeInteger(b.seq) && b.seq > seq
    ) {
      seq = b.seq;
      lastHeard = Date.now();
      onView(b.view);
    }
  };
  const replaced = (/** @type {Event} */ event) => {
    if (/** @type {CustomEvent} */ (event).detail === me) {
      // Do not send a leave for the new holder's player.
      session = "";
      stop();
      status(
        "Your character is now playing from another tab or device, so this visit has stopped.",
      );
    }
  };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    signal?.throwIfAborted();
    // Start on the first server that answers.
    for (let i = 0;; i++) {
      try {
        await attach(i);
        break;
      } catch (e) {
        detach();
        if (i + 1 >= servers.length) throw e;
      }
      signal?.throwIfAborted();
    }
    signal?.throwIfAborted();
    const minutes = Math.round(Math.abs(/** @type {Relay} */ (relay).clockOff) / 60_000);
    status(
      minutes >= 5
        ? `This device's clock is about ${minutes} minutes off. Realms ignore messages stamped more than 10 minutes off, so set the clock automatically.`
        : "Waiting for the realm's referee...",
    );
    lastHeard = Date.now();
    await enter();
    if (!stopped) {
      timer = setInterval(async () => {
        if (moving) return;
        if (Date.now() - lastHeard > patienceMs) {
          // Quiet too long: start a fresh handshake, on the next server if there is one.
          forget();
          if (servers.length > 1) {
            moving = true;
            detach();
            await attach((at + 1) % servers.length).catch(() => {});
            moving = false;
            if (stopped) return detach();
          }
        }
        if (session) send("emind.ping", { session });
        else enter();
      }, Math.min(5000, patienceMs / 3));
    }
    return {
      stop,
      /** @param {unknown} action */
      act(action) {
        if (!stopped && session) send("emind.act", { session, seq: ++actionSeq, action });
      },
    };
  } catch (e) {
    stop();
    throw e;
  }
}
