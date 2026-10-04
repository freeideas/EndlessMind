// One referee and one session path for every visitor, including its owner.
import { randomId } from "./encoding.js";

/** @typedef {import("./relay.js").Relay | import("./relay.js").Relays} Relay */
/** @typedef {import("./envelope.js").Envelope} Envelope */
/** @typedef {{get: (key: string) => Promise<any>, put: (key: string, value: unknown) => Promise<unknown>}} RealmStorage */
/**
 * @typedef {object} RulesDriver
 * @property {number} ticksPerSecond
 * @property {(player: string, character: unknown) => Promise<{ok: boolean, reason?: string}>} enter
 * @property {(player: string, action: unknown) => void} act
 * @property {(player: string) => void} leave
 * @property {() => void} step
 * @property {(fn: (views: Record<string, unknown>) => void) => void} onViews
 * @property {(fn: (player: string, reason: string) => void) => void} onRemove  the rules ended a visit
 * @property {() => void} stop
 */

/**
 * @param {{address: string, keys: CryptoKeyPair, name: string, release: string, rules: RulesDriver,
 * relay: Relay, announce: () => Promise<void>, status: (text: string) => void, onStop?: () => void}} options
 */
export async function referee(
  { address, keys, name, release, rules, relay, announce, status, onStop },
) {
  await relay.addKey(keys);
  const instance = randomId();
  let stopped = false;
  /** @type {Map<string, {request: string, session: string, seq: number, actionSeq: number, lastHeard: number}>} */
  const players = new Map();
  /** @type {Map<string, Promise<{ok: boolean, reason?: string}>>} */
  const entering = new Map();
  /** @param {string} to @param {string} kind @param {unknown} body */
  const send = (to, kind, body) => relay.send(keys, to, kind, body).catch(console.error);
  rules.onViews((views) => {
    if (stopped) return;
    for (const [player, view] of Object.entries(views)) {
      const p = players.get(player);
      if (p) send(player, "emind.state", { session: p.session, seq: ++p.seq, view });
    }
  });

  rules.onRemove((player, reason) => {
    const p = players.get(player);
    if (stopped || !p) return;
    players.delete(player);
    send(player, "emind.refused", { request: p.request, reason });
  });

  /** @param {Event} event */
  async function onMessage(event) {
    const env = /** @type {CustomEvent<Envelope>} */ (event).detail;
    if (stopped || env.to !== address) return;
    const b = /** @type {any} */ (env.body) ?? {};
    let p = players.get(env.from);
    if (env.kind === "emind.enter") {
      if (typeof b.request !== "string" || b.request.length < 16 || b.request.length > 64) return;
      if (b.release !== release) {
        send(env.from, "emind.refused", {
          request: b.request,
          reason: "The realm's version changed. Open its current link.",
        });
        return;
      }
      // Repeated requests while enter waits must not run realm entry twice.
      if (!p) {
        let pending = entering.get(env.from);
        if (!pending) {
          pending = rules.enter(env.from, b.character ?? {}).catch((error) => ({
            ok: false,
            reason: String(error),
          }));
          entering.set(env.from, pending);
        }
        const verdict = await pending;
        if (stopped) return;
        entering.delete(env.from);
        if (!verdict.ok) {
          send(env.from, "emind.refused", { request: b.request, reason: verdict.reason ?? "" });
          return;
        }
        p = players.get(env.from);
      }
      if (!p || p.request !== b.request) {
        p = {
          request: b.request,
          session: randomId(),
          seq: 0,
          actionSeq: 0,
          lastHeard: Date.now(),
        };
        players.set(env.from, p);
      }
      p.lastHeard = Date.now();
      send(env.from, "emind.welcome", {
        request: p.request,
        session: p.session,
        instance,
        release,
        name,
      });
    } else if (p && b.session === p.session) {
      p.lastHeard = Date.now();
      if (env.kind === "emind.act" && Number.isSafeInteger(b.seq) && b.seq > p.actionSeq) {
        p.actionSeq = b.seq;
        rules.act(env.from, b.action);
      } else if (env.kind === "emind.leave") {
        players.delete(env.from);
        rules.leave(env.from);
      }
    }
  }
  const listener = (/** @type {Event} */ e) => {
    onMessage(e).catch(console.error);
  };
  relay.addEventListener("message", listener);
  const replaced = (/** @type {Event} */ e) => {
    if (/** @type {CustomEvent} */ (e).detail === address) {
      stop();
      status(`${name} is now being hosted from somewhere else, so this copy has stopped.`);
    }
  };
  relay.addEventListener("replaced", replaced);
  const ticker = setInterval(() => {
    for (const [player, p] of players) {
      if (Date.now() - p.lastHeard > 20_000) {
        players.delete(player);
        rules.leave(player);
      }
    }
    rules.step();
  }, 1000 / rules.ticksPerSecond);
  const renewer = setInterval(() => announce().catch(console.error), 60 * 60 * 1000);
  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(ticker);
    clearInterval(renewer);
    relay.removeEventListener("message", listener);
    relay.removeEventListener("replaced", replaced);
    relay.release(address);
    rules.stop();
    players.clear();
    onStop?.();
  }
  return { stop, instance };
}

/**
 * The one driver for a rules module (specs/RUNTIME.md), used by the host
 * program directly and by the browser inside a sandbox. It must stay
 * self-contained: app/sandbox.js inserts this function's source text into
 * the sandbox, so it may use nothing outside itself.
 * @param {any} rules
 * @param {RealmStorage} [storage]
 * @param {(error: unknown) => void} [report] where errors thrown by the rules go
 * @returns {Promise<RulesDriver>}
 */
export async function directRules(rules, storage, report = (error) => console.error("[rules]", error)) {
  const players = new Set();
  /** @type {(views: Record<string, unknown>) => void} */
  let onViews = () => {};
  /** @type {(player: string, reason: string) => void} */
  let onRemove = () => {};
  let stepping = false;
  let stopped = false;
  /** @param {() => unknown} call */
  const safely = (call) => (async () => await call())().catch(report);
  /** The rules end a player's visit. @param {string} player @param {unknown} [reason] */
  const remove = (player, reason) => {
    if (players.delete(player)) onRemove(player, typeof reason === "string" ? reason : "");
  };
  const seed = Math.floor(Math.random() * 2 ** 31);
  const state = rules.init ? await rules.init({ seed, storage, remove }) : {};
  return {
    ticksPerSecond: Math.min(Math.max(Number(rules.ticksPerSecond) || 10, 1), 60),
    async enter(player, character) {
      try {
        const verdict = rules.enter ? await rules.enter(state, player, character) : true;
        const ok = verdict === true || verdict === undefined;
        if (ok && !stopped) players.add(player);
        return { ok, reason: typeof verdict === "string" ? verdict : undefined };
      } catch (e) {
        return { ok: false, reason: String(e) };
      }
    },
    act(player, action) {
      if (!stopped && players.has(player) && rules.act) {
        safely(() => rules.act(state, player, action));
      }
    },
    leave(player) {
      if (players.delete(player) && rules.leave) safely(() => rules.leave(state, player));
    },
    step() {
      if (stepping || stopped) return;
      stepping = true;
      safely(async () => {
        if (rules.tick) await rules.tick(state);
        /** @type {Record<string, unknown>} */
        const views = {};
        for (const player of [...players]) {
          // One player's view failing must not blank everyone else's. No view means nothing to send.
          try {
            const view = rules.view ? rules.view(state, player) : state;
            if (view !== undefined) views[player] = view;
          } catch (e) {
            report(e);
          }
        }
        if (!stopped) onViews(views);
      }).finally(() => stepping = false);
    },
    onViews(fn) {
      onViews = fn;
    },
    onRemove(fn) {
      onRemove = fn;
    },
    stop() {
      stopped = true;
      players.clear();
    },
  };
}
