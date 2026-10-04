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
 * @param {{server: string, address: string, keys: CryptoKeyPair, release: string, character: unknown,
 * onView: (view: any) => void, status: (text: string) => void, signal?: AbortSignal}} options
 */
export async function visit({ server, address, keys, release, character, onView, status, signal }) {
  const relay = new Relay(relayUrl(server));
  const me = await addressOf(keys.publicKey);
  let request = randomId(), session = "", instance = "";
  let seq = 0, actionSeq = 0, lastHeard = Date.now();
  let stopped = false;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;
  const send = (/** @type {string} */ kind, /** @type {unknown} */ body) =>
    relay.send(keys, address, kind, body).catch(() => {});
  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    signal?.removeEventListener("abort", stop);
    relay.removeEventListener("message", message);
    relay.removeEventListener("replaced", replaced);
    if (session) send("emind.leave", { session }).finally(() => relay.close());
    else relay.close();
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
    await relay.connect();
    signal?.throwIfAborted();
    await relay.addKey(keys);
    signal?.throwIfAborted();
    relay.addEventListener("message", message);
    relay.addEventListener("replaced", replaced);
    status("Waiting for the realm's referee...");
    await enter();
    if (!stopped) {
      timer = setInterval(() => {
        if (session && Date.now() - lastHeard > 15_000) {
          request = randomId();
          session = "";
          instance = "";
          seq = 0;
          actionSeq = 0;
        }
        if (session) send("emind.ping", { session });
        else enter();
      }, 5000);
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
