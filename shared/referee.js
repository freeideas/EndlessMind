// Refereeing a realm: the loop that lets visitors in, passes their moves to the
// rules, and sends each one their view. Whoever holds the realm's key runs it:
// the browser app (rules in a sandbox) or the host program (rules run directly).
// The message kinds are the "entering and leaving" extension in specs/RUNTIME.md.

/** @typedef {import("./relay.js").Relay} Relay */
/** @typedef {import("./envelope.js").Envelope} Envelope */

/**
 * The rules, however they are run.
 * @typedef {object} RulesDriver
 * @property {number} ticksPerSecond
 * @property {(player: string, character: unknown) => Promise<{ ok: boolean, reason?: string }>} enter
 * @property {(player: string, action: unknown) => void} act
 * @property {(player: string) => void} leave
 * @property {() => void} step  one tick; the views follow through onViews
 * @property {(fn: (views: Record<string, unknown>) => void) => void} onViews
 * @property {() => void} stop
 */

const VISITOR_TIMEOUT_MS = 20_000;
const RENEW_ANNOUNCEMENT_MS = 60 * 60 * 1000;

/**
 * @param {object} options
 * @param {string} options.address  the realm's address
 * @param {CryptoKeyPair} options.keys  the realm's key
 * @param {string} options.name
 * @param {RulesDriver} options.rules
 * @param {Relay} options.relay
 * @param {() => Promise<void>} options.announce  announce (or renew) the realm on the server
 * @param {(text: string) => void} options.status
 */
export async function referee({ address, keys, name, rules, relay, announce, status }) {
  await relay.addKey(keys);

  /** Players inside, and how to reach each. @type {Map<string, {deliver: (view: unknown) => void, lastHeard: number, local: boolean}>} */
  const players = new Map();

  rules.onViews((views) => {
    for (const [player, view] of Object.entries(views)) players.get(player)?.deliver(view);
  });

  /** @param {Event} event */
  async function onMessage(event) {
    const env = /** @type {CustomEvent<Envelope>} */ (event).detail;
    if (env.to !== address) return;
    const body = /** @type {any} */ (env.body) ?? {};
    const known = players.get(env.from);
    if (known) known.lastHeard = Date.now();
    if (env.kind === "emind.enter" && !known) {
      const verdict = await rules.enter(env.from, body.character ?? {});
      if (!verdict.ok) {
        await relay.send(keys, env.from, "emind.refused", { reason: verdict.reason ?? "" });
        return;
      }
      players.set(env.from, {
        local: false,
        lastHeard: Date.now(),
        deliver: (view) => relay.send(keys, env.from, "emind.state", { view }),
      });
      await relay.send(keys, env.from, "emind.welcome", { name });
      status(`${String(body.character?.name ?? "Someone").slice(0, 40)} came in.`);
    } else if (env.kind === "emind.enter" && known) {
      await relay.send(keys, env.from, "emind.welcome", { name });
    } else if (env.kind === "emind.act" && known) {
      rules.act(env.from, body.action);
    } else if (env.kind === "emind.leave" && known) {
      players.delete(env.from);
      rules.leave(env.from);
    }
  }
  relay.addEventListener("message", onMessage);

  /** A key can be carried anywhere; if another holder starts hosting, this copy stops. @param {Event} event */
  function onReplaced(event) {
    if (/** @type {CustomEvent<string>} */ (event).detail !== address) return;
    halt();
    status(`${name} is now being hosted from somewhere else, so this copy has stopped.`);
  }
  relay.addEventListener("replaced", onReplaced);

  const ticker = setInterval(() => {
    const now = Date.now();
    for (const [player, p] of players) {
      if (!p.local && now - p.lastHeard > VISITOR_TIMEOUT_MS) {
        players.delete(player);
        rules.leave(player);
      }
    }
    rules.step();
  }, 1000 / rules.ticksPerSecond);

  const renewer = setInterval(() => announce().catch(console.error), RENEW_ANNOUNCEMENT_MS);

  function halt() {
    clearInterval(ticker);
    clearInterval(renewer);
    relay.removeEventListener("message", onMessage);
    relay.removeEventListener("replaced", onReplaced);
  }

  return {
    /**
     * Let a player on this device in, without the network.
     * @param {string} player @param {unknown} character @param {(view: unknown) => void} deliver
     */
    async addLocalPlayer(player, character, deliver) {
      const verdict = await rules.enter(player, character);
      if (verdict.ok) players.set(player, { local: true, lastHeard: Date.now(), deliver });
      return verdict;
    },
    /** @param {string} player @param {unknown} action */
    act(player, action) {
      rules.act(player, action);
    },
    stop() {
      halt();
      relay.release(address);
      rules.stop();
    },
  };
}

/**
 * Run a rules module directly, with no sandbox: for the realm's own maker
 * running their own rules on their own machine. Here `enter`, `act` and `tick`
 * may take their time (return promises), for example to ask an AI model.
 * @param {any} rules  the module's default export (see specs/RUNTIME.md)
 * @returns {Promise<RulesDriver>}
 */
export async function directRules(rules) {
  const state = await rules.init({ seed: Math.floor(Math.random() * 2 ** 31) });
  /** @type {Set<string>} */
  const players = new Set();
  /** @type {(views: Record<string, unknown>) => void} */
  let onViews = () => {};
  let stepping = false;
  /** @param {() => unknown} call */
  const safely = (call) => (async () => await call())().catch((error) => console.error("[rules]", error));
  return {
    ticksPerSecond: Math.min(Math.max(Number(rules.ticksPerSecond) || 10, 1), 60),
    async enter(player, character) {
      let verdict;
      try {
        verdict = rules.enter ? await rules.enter(state, player, character) : true;
      } catch (error) {
        console.error("[rules]", error);
        return { ok: false, reason: "The realm's rules failed." };
      }
      const ok = verdict === true || verdict === undefined;
      if (ok) players.add(player);
      return { ok, reason: typeof verdict === "string" ? verdict : undefined };
    },
    act(player, action) {
      if (players.has(player) && rules.act) safely(() => rules.act(state, player, action));
    },
    leave(player) {
      if (players.delete(player) && rules.leave) safely(() => rules.leave(state, player));
    },
    step() {
      if (stepping) return;
      stepping = true;
      safely(async () => {
        if (rules.tick) await rules.tick(state);
        /** @type {Record<string, unknown>} */
        const views = {};
        for (const p of players) views[p] = rules.view(state, p);
        onViews(views);
      }).finally(() => (stepping = false));
    },
    onViews(fn) {
      onViews = fn;
    },
    stop() {},
  };
}
