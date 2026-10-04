// One referee and one session path for every visitor, including its owner.
import { lock, newExchangeKey, sessionKey, TO_REALM, TO_VISITOR, unlock } from "./crypto.js";
import { randomId } from "./encoding.js";
import { checkShown, makeExperience } from "./experience.js";

/** @typedef {import("./relay.js").Relay | import("./relay.js").Relays} Relay */
/** @typedef {import("./envelope.js").Envelope} Envelope */
/** @typedef {{get: (key: string) => Promise<any>, put: (key: string, value: unknown) => Promise<unknown>}} RealmStorage */
/**
 * @typedef {object} RulesDriver
 * @property {number} ticksPerSecond
 * @property {(player: string, character: unknown, experiences?: unknown[]) => Promise<{ok: boolean, reason?: string}>} enter
 *   `experiences` are the ones the visitor chose to show, already checked
 * @property {(fn: (player: string, says: unknown, days?: number) => Promise<unknown>) => void} [onRecord]  the
 *   rules want an experience signed about a player; the function returns the signed experience
 * @property {(player: string, action: unknown) => void} act
 * @property {(player: string) => void} leave
 * @property {() => void} step
 * @property {(fn: (views: Record<string, unknown>, checks?: Record<string, unknown>) => void) => void} onViews
 *   `checks` is given by repeatable rules: for each player, what their app needs to check the referee
 * @property {boolean} [repeatable]  the rules promise: the same moves in the same order always give the same state
 * @property {(player: string) => void} [resync]  send this player a fresh starting point with the next tick
 * @property {(check: any, me: string, adopt: boolean) => { view: unknown, differs: boolean } | Promise<{ view: unknown, differs: boolean }>} [replay]  apply a check
 *   to this copy and return the view it gives `me`. With `adopt`, a starting point in the check becomes this
 *   copy's state; without, the copy applies the moves and `differs` tells whether its state then matches
 * @property {(fn: (player: string, reason: string) => void) => void} onRemove  the rules ended a visit
 * @property {() => void} stop
 */

/**
 * @param {{address: string, keys: CryptoKeyPair, name: string, release: string, rules: RulesDriver,
 * relay: Relay, announce: () => Promise<void>, status: (text: string) => void, onStop?: () => void,
 * realm?: string, pass?: Envelope}} options  `address` and `keys` are the referee's. `realm` is the address the
 *   realm is known by and `pass` its word that this referee may speak for it, when they differ.
 */
export async function referee(
  { address, keys, name, release, rules, relay, announce, status, onStop, realm = address, pass },
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
  /** Experiences signed for players and not yet handed over. @type {Map<string, Envelope[]>} */
  const owed = new Map();
  rules.onRecord?.(async (player, says, days) => {
    const signed = await makeExperience(keys, player, says, days ? days * 24 * 60 * 60 * 1000 : undefined, pass);
    // The rules get the signed experience to keep if they wish. The player gets it too if they are here
    // or on their way in, inside their session; what they do with it is up to them.
    const list = owed.get(player) ?? [];
    if (!stopped && (players.has(player) || entering.has(player)) && list.length < 16) owed.set(player, [...list, signed]);
    return signed;
  });
  rules.onViews((views, checks) => {
    if (stopped) return;
    // With repeatable rules every player hears every tick, view or not, so their copy never misses a move.
    for (const player of new Set([...Object.keys(checks ?? views), ...owed.keys()])) {
      const p = players.get(player);
      if (!p && !entering.has(player)) owed.delete(player);
      // Until the welcome has gone out the session's key may not be ready, and a view must never go unlocked.
      if (!p?.welcomed) continue;
      const seq = ++p.seq, cipher = p.cipher;
      const experiences = owed.get(player);
      owed.delete(player);
      const inner = {
        ...(Object.hasOwn(views, player) ? { view: views[player] } : {}),
        ...(checks && Object.hasOwn(checks, player) ? { check: checks[player] } : {}),
        ...(experiences ? { experiences } : {}),
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
          // Experiences the visitor chose to show are checked here, so the rules see only true ones:
          // signed by their issuer, in date, about this visitor, and shown to this realm.
          const shown = Array.isArray(b.shown) ? b.shown.slice(0, 16) : [];
          pending = Promise.all(shown.map((/** @type {unknown} */ one) => checkShown(one, `${realm}\n${env.from}`).catch(() => null)))
            .then((checked) => rules.enter(env.from, b.character ?? {}, checked.filter(Boolean)))
            .catch((error) => ({ ok: false, reason: String(error) }));
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
      if (env.kind === "emind.act" && Number.isSafeInteger(b.seq) && b.seq > p.actionSeq && (!p.cipher || typeof b.box === "string")) {
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
      } else if (env.kind === "emind.ping") {
        // Answered, so a visitor can tell a quiet realm (no views to send) from a dead referee.
        send(env.from, "emind.pong", { session: p.session });
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
  /** @type {(player: string, says: unknown, days?: number) => Promise<unknown>} */
  let onRecord = () => Promise.resolve(null);
  /**
   * The rules ask for a signed experience about a player. It resolves to the signed experience, which the
   * rules may keep, or to null if it could not be signed.
   * @param {string} player @param {unknown} says @param {number} [days]
   */
  const record = (player, says, days) => {
    if (typeof player !== "string" || stopped) return Promise.resolve(null);
    return Promise.resolve()
      .then(() => onRecord(player, JSON.parse(JSON.stringify(says ?? null)), typeof days === "number" && days > 0 ? days : undefined))
      .catch((error) => (report(error), null));
  };
  let stepping = false;
  let stopped = false;
  // Repeatable rules can be checked: the driver notes every move it applies, in order, and hands each
  // player those moves (or, to start, a full copy of the state) so their own copy of the rules can follow.
  const repeatable = Boolean(rules.repeatable);
  /** @type {unknown[][]} */
  let inputs = [];
  const fresh = new Set();
  // Every move is passed on to every player, so one player's moves must stay small: at most 4,096
  // characters each as JSON, and 65,536 in all per tick. Larger ones are not applied.
  let noted = 0;
  /**
   * Note a move for the players who check. What travels is JSON, so the referee applies the same plain
   * copy their copies will get, and a later change by the rules cannot alter what was noted.
   * @param {string} kind @param {string} player @param {unknown} data @param {number} [limit]
   * @returns {{ value: unknown } | null} null when the move is too large
   */
  const note = (kind, player, data, limit = 4096) => {
    const text = JSON.stringify(data ?? null);
    if (text.length > limit || noted + text.length > 65536) return null;
    noted += text.length;
    inputs.push([kind, player, JSON.parse(text)]);
    return { value: JSON.parse(text) };
  };
  const snapshot = () => JSON.stringify({ state, players: [...players] });
  /** @param {() => unknown} call */
  const safely = (call) => (async () => await call())().catch(report);
  /** The rules end a player's visit. @param {string} player @param {unknown} [reason] */
  const remove = (player, reason) => {
    if (!players.delete(player)) return;
    fresh.delete(player);
    onRemove(player, typeof reason === "string" ? reason : "");
  };
  const seed = Math.floor(Math.random() * 2 ** 31);
  let state = rules.init ? await rules.init({ seed, storage, remove, record }) : {};
  /** Apply one noted move to this copy, exactly as the referee did. @param {unknown[]} input */
  const apply = ([kind, player, data, more]) => {
    if (kind === "enter") {
      const verdict = rules.enter ? rules.enter(state, player, data, more ?? []) : true;
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
    replay(check, me, adopt) {
      let differs = false;
      if (adopt && typeof check?.start === "string") {
        const from = JSON.parse(check.start);
        state = from.state;
        players.clear();
        for (const player of from.players) players.add(player);
      } else {
        for (const input of check?.inputs ?? []) {
          // The referee carries on past rules that throw, so this copy does too.
          try { apply(input); } catch { /* same as the referee */ }
        }
        // A copy that has followed every move must arrive at the very state the referee describes.
        if (typeof check?.start === "string") differs = snapshot() !== check.start;
      }
      // A view that throws sends nothing on the referee, so it gives nothing here.
      let view;
      try { view = rules.view ? rules.view(state, me) : state; } catch { /* no view */ }
      return { view, differs };
    },
    ticksPerSecond: Math.min(Math.max(Number(rules.ticksPerSecond) || 10, 1), 60),
    async enter(player, character, experiences = []) {
      try {
        if (repeatable) {
          // Every player's copy needs what the rules were given, so the signed originals stay behind.
          const kept = note("enter", player, [character, experiences.map((/** @type {any} */ e) => ({ ...e, signed: undefined }))], 16384);
          if (!kept) return { ok: false, reason: "Your character's description and shown experiences are too large for this realm, or the realm is too busy just now." };
          [character, experiences] = /** @type {any[]} */ (kept.value);
          inputs[inputs.length - 1] = ["enter", player, character, experiences];
        }
        const verdict = rules.enter ? await rules.enter(state, player, character, experiences) : true;
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
        if (repeatable) {
          const kept = note("act", player, action);
          if (!kept) return;
          action = kept.value;
        }
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
          // A starting point comes with the moves that led to it, so a copy already following can
          // confirm it instead of taking it on trust. A state too large to send cannot be checked.
          const start = fresh.size ? snapshot() : "";
          const first = start.length > 180_000 ? { unchecked: "its state is too large to send" } : { start, inputs };
          checks = {};
          for (const player of players) checks[player] = fresh.has(player) ? first : { inputs };
          inputs = [];
          noted = 0;
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
    onRecord(fn) {
      onRecord = fn;
    },
    stop() {
      stopped = true;
      players.clear();
    },
  };
}
