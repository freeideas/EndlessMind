// A visit has one lifetime, one handshake and one ordered stream of views.
import { randomId } from "./encoding.js";
import { countersign } from "./claim.js";
import { addressOf, ENTERING, lock, newExchangeKey, sessionKey, TO_REALM, TO_VISITOR, unlock } from "./crypto.js";
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
 * patienceMs?: number, onCheck?: (check: unknown, view: unknown, hasView: boolean, first: boolean) => void,
 * shown?: unknown[], onClaim?: (signed: unknown) => unknown, enterKey?: string}} options
 *   `address` is whoever referees; `patienceMs` is how long silence is borne; `onCheck` receives what a
 *   referee of repeatable rules sends with each view (see shared/check.js); `shown` are claims the
 *   player chose to show this realm, and `onClaim` receives ones the realm signs for the player, returning (or resolving to) true for each
 *   it keeps; those are signed in return, so the realm holds a claim signed by both
 *   (see shared/claim.js); `enterKey` is the referee's exchange key from the realm's announcement, with
 *   which the character and anything shown are locked on the way in
 */
export async function visit(
  { server, servers = server ? [server] : [], address, keys, release, character, onView, status, signal, patienceMs = 15_000, onCheck, shown, onClaim, enterKey },
) {
  const me = await addressOf(keys.publicKey);
  // Offered to the referee so the session can be private (see "Private sessions" in shared/crypto.js).
  const exchange = await newExchangeKey();
  /** @type {CryptoKey | undefined} */
  let cipher;
  /** Keeps arriving messages, and outgoing moves, each in their order while they are unlocked or locked. */
  let incoming = Promise.resolve(), outgoing = Promise.resolve();
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
    // The key is given first, so a connection that fails now and comes back later still speaks for it.
    await relay.addKey(keys);
    await relay.connect();
  }
  function forget() {
    request = randomId();
    session = "";
    instance = "";
    cipher = undefined;
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
  /** Claims kept, each with this player's own signature, to send the referee with the next ping. @type {{ sig: string, seen: string }[]} */
  let seen = [];
  async function enter() {
    const personal = { character, ...(shown?.length ? { shown } : {}) };
    const asked = request;
    if (!exchange || !enterKey) return send("emind.enter", { request, release, ...personal, ...(exchange ? { key: exchange.publicText } : {}) });
    // Who the player is, and what they show, is for the referee alone: a relay sees only a locked box.
    const key = await sessionKey(exchange.privateKey, enterKey, `enter\n${address}\n${me}\n${asked}`).catch(() => null);
    if (!key) return send("emind.enter", { request: asked, release, ...personal, key: exchange.publicText });
    return send("emind.enter", { request: asked, release, key: exchange.publicText, box: await lock(key, ENTERING, 0, JSON.stringify(personal)) });
  }
  const message = (/** @type {Event} */ event) => {
    incoming = incoming.then(() => handle(/** @type {CustomEvent} */ (event).detail)).catch(() => {});
  };
  /** @param {import("./envelope.js").Envelope} env */
  async function handle(env) {
    if (stopped || env.from !== address || env.to !== me) return;
    const b = /** @type {any} */ (env.body) ?? {};
    if (
      env.kind === "emind.welcome" && b.request === request && b.release === release &&
      typeof b.session === "string" && typeof b.instance === "string"
    ) {
      if (session && (session !== b.session || instance !== b.instance)) return;
      if (!session && exchange && b.key !== undefined) {
        const key = await sessionKey(exchange.privateKey, b.key, `${address}\n${me}\n${b.session}`);
        if (stopped || b.request !== request) return;
        cipher = key;
      }
      session = b.session;
      instance = b.instance;
      lastHeard = Date.now();
      status(`You are in ${b.name}.`);
    } else if (env.kind === "emind.key" && b.request === request && !session) {
      // The referee could not open the locked entry request: it has a newer exchange key than the announcement said.
      enterKey = typeof b.key === "string" ? b.key : undefined;
      enter();
    } else if (env.kind === "emind.pong" && session && b.session === session) {
      lastHeard = Date.now();
    } else if (env.kind === "emind.refused" && b.request === request) {
      status(`The realm refused you: ${b.reason || "no reason given"}`);
      stop();
    } else if (
      env.kind === "emind.state" && session && b.session === session &&
      Number.isSafeInteger(b.seq) && b.seq > seq
    ) {
      // In a private session only locked views count: one that fails to unlock is ignored.
      const inner = cipher ? JSON.parse(await unlock(cipher, TO_VISITOR, b.seq, b.box)) : b;
      if (stopped || b.session !== session || b.seq <= seq) return;
      if (onCheck && inner.check && b.seq !== seq + 1) {
        // A message was lost, and with it moves the checking copy needs: start a fresh session, which
        // begins from a full copy of the state.
        forget();
        enter();
        return;
      }
      const first = seq === 0;
      seq = b.seq;
      lastHeard = Date.now();
      const hasView = Object.hasOwn(inner, "view");
      if (hasView) onView(inner.view);
      for (const signed of Array.isArray(inner.claims) ? inner.claims.slice(0, 16) : []) {
        // A claim the player keeps is signed in return: both parties then hold the same claim.
        if (signed?.to !== me || typeof signed.sig !== "string" || seen.length >= 64) continue;
        if (await onClaim?.(signed) === true) seen.push({ sig: signed.sig, seen: await countersign(keys, signed) });
      }
      onCheck?.(inner.check, inner.view, hasView, first);
    }
  }
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
        if (session) {
          send("emind.ping", { session, ...(seen.length ? { seen } : {}) });
          seen = [];
        } else enter();
      }, Math.min(5000, patienceMs / 3));
    }
    return {
      stop,
      /** @param {unknown} action */
      act(action) {
        if (stopped || !session) return;
        const n = ++actionSeq, to = session, key = cipher;
        if (!key) return void send("emind.act", { session: to, seq: n, action });
        const text = JSON.stringify({ action });
        outgoing = outgoing.then(async () => {
          await send("emind.act", { session: to, seq: n, box: await lock(key, TO_REALM, n, text) });
        }).catch(() => {});
      },
    };
  } catch (e) {
    stop();
    throw e;
  }
}
