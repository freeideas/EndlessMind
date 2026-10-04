// One referee and one session path for every visitor, including its owner.
import { lock, newExchangeKey, sessionKey, TO_REALM, TO_VISITOR, unlock } from "./crypto.js";
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
 * @property {(fn: (views: Record<string, unknown>, checks?: Record<string, unknown>) => void) => void} onViews
 *   `checks` is given by repeatable rules: for each player, what their app needs to check the referee
 * @property {boolean} [repeatable]  the rules promise: the same moves in the same order always give the same state
 * @property {(player: string) => void} [resync]  send this player a fresh starting point with the next tick
 * @property {(check: any, me: string) => unknown} [replay]  apply a check to this copy; returns the view it gives `me`
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
  /**
   * @typedef {object} Session
   * @property {string} request
   * @property {string} session
   * @property {number} seq
   * @property {number} actionSeq
   * @property {number} lastHeard
   * @property {boolean} welcomed       nothing is sent in a session before its welcome
   * @property {Promise<void>} ready   settles once the session's key (if any) is worked out
   * @property {string} [key]          this side's public half, when the visitor offered one
   * @property {CryptoKey} [cipher]    locks views and unlocks moves for this session
   * @property {Promise<unknown>} work keeps this player's locked messages in order
   */
  /** @type {Map<string, Session>} */
  const players = new Map();
  /** @type {Map<string, Promise<{ok: boolean, reason?: string}>>} */
  const entering = new Map();
  /** @param {string} to @param {string} kind @param {unknown} body */
  const send = (to, kind, body) => relay.send(keys, to, kind, body).catch(console.error);
  rules.onViews((views, checks) => {
    if (stopped) return;
    // With repeatable rules every player hears every tick, view or not, so their copy never misses a move.
    for (const player of Object.keys(checks ?? views)) {
      const p = players.get(player);
      // Until the welcome has gone out the session's key may not be ready, and a view must never go unlocked.
      if (!p?.welcomed) continue;
      const seq = ++p.seq, cipher = p.cipher;
      const inner = {
        ...(Object.hasOwn(views, player) ? { view: views[player] } : {}),
        ...(checks ? { check: checks[player] } : {}),
      };
      if (!cipher) {
        send(player, "emind.state", { session: p.session, seq, ...inner });
        continue;
      }
      // Copy the view as text now, lock it, and send in order: the relay sees only the locked box.
      const text = JSON.stringify(inner);
      p.work = p.work.then(async () => send(player, "emind.state", { session: p.session, seq, box: await lock(cipher, TO_VISITOR, seq, text) }))
        .catch(console.error);
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
        /** @type {Session} */
        const fresh = p = {
          request: b.request,
          session: randomId(),
          seq: 0,
          actionSeq: 0,
          lastHeard: Date.now(),
          welcomed: false,
          ready: Promise.resolve(),
          work: Promise.resolve(),
        };
        // A visitor that offers an exchange key gets a private session: moves and views are locked
        // with a key only the two ends can work out. Without one, the session is in the clear.
        if (b.key !== undefined) {
          fresh.ready = (async () => {
            const mine = await newExchangeKey();
            if (!mine) return;
            fresh.cipher = await sessionKey(mine.privateKey, b.key, `${address}\n${env.from}\n${fresh.session}`);
            fresh.key = mine.publicText;
          })().catch(() => {});
        }
        players.set(env.from, p);
      }
      p.lastHeard = Date.now();
      const current = p;
      await current.ready;
      if (stopped || players.get(env.from) !== current) return;
      current.welcomed = true;
      // A session starts from a full copy of the state, when the rules can be checked.
      rules.resync?.(env.from);
      send(env.from, "emind.welcome", {
        request: current.request,
        session: current.session,
        instance,
        release,
        name,
        ...(current.key ? { key: current.key } : {}),
      });
    } else if (p && b.session === p.session) {
      p.lastHeard = Date.now();
      if (env.kind === "emind.act" && Number.isSafeInteger(b.seq) && b.seq > p.actionSeq) {
        p.actionSeq = b.seq;
        const cipher = p.cipher, session = p;
        if (!cipher) rules.act(env.from, b.action);
        else {
          // In a private session only locked moves count, taken in the order they came.
          p.work = p.work.then(async () => {
            const { action } = JSON.parse(await unlock(cipher, TO_REALM, b.seq, b.box));
            if (!stopped && players.get(env.from) === session) rules.act(env.from, action);
          }).catch(() => {});
        }
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
  /** @type {(views: Record<string, unknown>, checks?: Record<string, unknown>) => void} */
  let onViews = () => {};
  /** @type {(player: string, reason: string) => void} */
  let onRemove = () => {};
  let stepping = false;
  let stopped = false;
  // Repeatable rules can be checked: the driver notes every move it applies, in order, and hands each
  // player those moves (or, to start, a full copy of the state) so their own copy of the rules can follow.
  const repeatable = Boolean(rules.repeatable);
  /** @type {unknown[][]} */
  let inputs = [];
  const fresh = new Set();
  /** @param {() => unknown} call */
  const safely = (call) => (async () => await call())().catch(report);
  /** The rules end a player's visit. @param {string} player @param {unknown} [reason] */
  const remove = (player, reason) => {
    if (!players.delete(player)) return;
    fresh.delete(player);
    onRemove(player, typeof reason === "string" ? reason : "");
  };
  const seed = Math.floor(Math.random() * 2 ** 31);
  let state = rules.init ? await rules.init({ seed, storage, remove }) : {};
  /** Apply one noted move to this copy, exactly as the referee did. @param {unknown[]} input */
  const apply = ([kind, player, data]) => {
    if (kind === "enter") {
      const verdict = rules.enter ? rules.enter(state, player, data) : true;
      if (verdict === true || verdict === undefined) players.add(player);
    } else if (kind === "act") {
      if (players.has(player) && rules.act) rules.act(state, player, data);
    } else if (kind === "leave") {
      if (players.delete(player) && rules.leave) rules.leave(state, player);
    } else if (kind === "tick" && rules.tick) rules.tick(state);
  };
  return {
    repeatable,
    resync(player) {
      if (repeatable && players.has(player)) fresh.add(player);
    },
    replay(check, me) {
      if (typeof check?.start === "string") {
        const from = JSON.parse(check.start);
        state = from.state;
        players.clear();
        for (const player of from.players) players.add(player);
      } else {
        for (const input of check?.inputs ?? []) {
          // The referee carries on past rules that throw, so this copy does too.
          try { apply(input); } catch { /* same as the referee */ }
        }
      }
      return rules.view ? rules.view(state, me) : state;
    },
    ticksPerSecond: Math.min(Math.max(Number(rules.ticksPerSecond) || 10, 1), 60),
    async enter(player, character) {
      try {
        if (repeatable) inputs.push(["enter", player, character]);
        const verdict = rules.enter ? await rules.enter(state, player, character) : true;
        const ok = verdict === true || verdict === undefined;
        if (ok && !stopped) {
          players.add(player);
          if (repeatable) fresh.add(player);
        }
        return { ok, reason: typeof verdict === "string" ? verdict : undefined };
      } catch (e) {
        return { ok: false, reason: String(e) };
      }
    },
    act(player, action) {
      if (!stopped && players.has(player) && rules.act) {
        if (repeatable) inputs.push(["act", player, action]);
        safely(() => rules.act(state, player, action));
      }
    },
    leave(player) {
      if (!players.delete(player)) return;
      fresh.delete(player);
      if (repeatable) inputs.push(["leave", player]);
      if (rules.leave) safely(() => rules.leave(state, player));
    },
    step() {
      if (stepping || stopped) return;
      stepping = true;
      safely(async () => {
        if (repeatable) inputs.push(["tick"]);
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
        /** @type {Record<string, unknown> | undefined} */
        let checks;
        if (repeatable) {
          const start = fresh.size ? JSON.stringify({ state, players: [...players] }) : "";
          checks = {};
          for (const player of players) checks[player] = fresh.has(player) ? { start } : { inputs };
          inputs = [];
          fresh.clear();
        }
        if (!stopped) onViews(views, checks);
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
