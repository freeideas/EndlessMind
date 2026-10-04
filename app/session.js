// Being in a realm: as its referee (this device holds the realm's key) or as a
// visitor. The message kinds used here (enter, act, leave, ping, welcome,
// refused, state) are the "entering and leaving" extension in specs/RUNTIME.md.

import { fetchFile, announce, lookUp } from "./realms.js";
import { startRenderer, startRules } from "./sandbox.js";

/** @typedef {import("./net.js").Relay} Relay */
/** @typedef {import("./character.js").Character} Character */
/** @typedef {import("./realms.js").OwnedRealm} OwnedRealm */
/** @typedef {import("../shared/envelope.js").Envelope} Envelope */

const VISITOR_TIMEOUT_MS = 20_000;
const PING_EVERY_MS = 5_000;
const RENEW_ANNOUNCEMENT_MS = 60 * 60 * 1000;

/**
 * Referee a realm this device owns. The rules run in a hidden sandbox here;
 * visitors send signed moves through the relay and get signed views back.
 * @param {OwnedRealm} realm
 * @param {Relay} relay
 * @param {HTMLElement} container
 * @param {(text: string) => void} status
 */
export async function referee(realm, relay, container, status) {
  const manifest = /** @type {import("../shared/announce.js").ManifestBody} */ (realm.manifest.body);
  const rules = await startRules(container, await fetchFile(manifest.files[manifest.main]));
  await relay.addKey(realm.keys);

  /** Players inside, and how to reach each. @type {Map<string, {deliver: (view: unknown) => void, lastHeard: number, local: boolean}>} */
  const players = new Map();

  rules.onViews((views) => {
    for (const [player, view] of Object.entries(views)) players.get(player)?.deliver(view);
  });

  /** @param {Event} event */
  async function onMessage(event) {
    const env = /** @type {CustomEvent<Envelope>} */ (event).detail;
    if (env.to !== realm.address) return;
    const body = /** @type {any} */ (env.body) ?? {};
    const known = players.get(env.from);
    if (known) known.lastHeard = Date.now();
    if (env.kind === "wwg.enter" && !known) {
      const verdict = await rules.enter(env.from, body.character ?? {});
      if (!verdict.ok) {
        await relay.send(realm.keys, env.from, "wwg.refused", { reason: verdict.reason ?? "" });
        return;
      }
      players.set(env.from, {
        local: false,
        lastHeard: Date.now(),
        deliver: (view) => relay.send(realm.keys, env.from, "wwg.state", { view }),
      });
      await relay.send(realm.keys, env.from, "wwg.welcome", { name: manifest.name });
      status(`${body.character?.name ?? "Someone"} came in.`);
    } else if (env.kind === "wwg.enter" && known) {
      await relay.send(realm.keys, env.from, "wwg.welcome", { name: manifest.name });
    } else if (env.kind === "wwg.act" && known) {
      rules.act(env.from, body.action);
    } else if (env.kind === "wwg.leave" && known) {
      players.delete(env.from);
      rules.leave(env.from);
    }
  }
  relay.addEventListener("message", onMessage);

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

  const renewer = setInterval(() => announce(realm).catch(console.error), RENEW_ANNOUNCEMENT_MS);
  announce(realm).catch(console.error);

  return {
    /**
     * Let a player on this device in, without the network.
     * @param {Character} character @param {(view: unknown) => void} deliver
     */
    async addLocalPlayer(character, deliver) {
      const verdict = await rules.enter(character.address, character.info);
      if (verdict.ok) players.set(character.address, { local: true, lastHeard: Date.now(), deliver });
      return verdict;
    },
    /** @param {string} player @param {unknown} action */
    act(player, action) {
      rules.act(player, action);
    },
    stop() {
      clearInterval(ticker);
      clearInterval(renewer);
      relay.removeEventListener("message", onMessage);
      rules.stop();
    },
  };
}

/**
 * Play in a realm: as a local player if this device referees it, otherwise as
 * a visitor through the relay.
 * @param {string} address realm address
 * @param {Character} character
 * @param {Relay} relay
 * @param {HTMLElement} container
 * @param {{ status: (text: string) => void, owned?: OwnedRealm, release?: string }} ui
 */
export async function play(address, character, relay, container, ui) {
  const found = await lookUp(address);
  if (!found) throw new Error("No realm with this address is announced on this server.");
  const { manifest } = found;
  if (ui.release && ui.release !== found.release) {
    throw Object.assign(new Error("This link is for an earlier version of this realm, which has changed since."), {
      code: "release-changed",
    });
  }
  if (manifest.needs.length) {
    throw new Error(`This realm asks for permissions this app does not know: ${manifest.needs.join(", ")}.`);
  }
  const rendererCode = await fetchFile(manifest.files[manifest.renderer]);

  if (ui.owned) {
    const ref = await referee(ui.owned, relay, container, ui.status);
    const view = await startRenderer(container, rendererCode, character.address, character.info, (action) =>
      ref.act(character.address, action));
    const verdict = await ref.addLocalPlayer(character, (v) => (lastView(v), view.show(v)));
    if (!verdict.ok) throw new Error(`The realm refused you: ${verdict.reason ?? "no reason given"}`);
    ui.status(`You are hosting ${manifest.name}. Keep this tab open so others can play.`);
    return { name: manifest.name, release: found.release, stop: () => (ref.stop(), view.stop()) };
  }

  await relay.addKey(character.keys);
  const view = await startRenderer(container, rendererCode, character.address, character.info, (action) =>
    relay.send(character.keys, address, "wwg.act", { action }));

  let welcomed = false;
  /** @param {Event} event */
  function onMessage(event) {
    const env = /** @type {CustomEvent<Envelope>} */ (event).detail;
    if (env.from !== address || env.to !== character.address) return;
    const body = /** @type {any} */ (env.body) ?? {};
    if (env.kind === "wwg.welcome" && !welcomed) {
      welcomed = true;
      ui.status(`You are in ${manifest.name}.`);
    } else if (env.kind === "wwg.refused") {
      ui.status(`The realm refused you: ${body.reason || "no reason given"}`);
    } else if (env.kind === "wwg.state") {
      welcomed = true;
      lastView(body.view);
      view.show(body.view);
    }
  }
  /** @param {Event} event */
  function onUndeliverable(event) {
    if (/** @type {CustomEvent<string>} */ (event).detail === address && !welcomed) {
      ui.status("This realm's referee is not online right now. Waiting for it...");
    }
  }
  relay.addEventListener("message", onMessage);
  relay.addEventListener("undeliverable", onUndeliverable);

  const enter = () => relay.send(character.keys, address, "wwg.enter", { character: character.info });
  await enter();
  ui.status(found.online ? `Entering ${manifest.name}...` : "This realm's referee is not online right now. Waiting for it...");
  const pinger = setInterval(() => {
    if (welcomed) relay.send(character.keys, address, "wwg.ping", {});
    else enter();
  }, PING_EVERY_MS);

  return {
    name: manifest.name,
    release: found.release,
    stop() {
      clearInterval(pinger);
      relay.send(character.keys, address, "wwg.leave", {});
      relay.removeEventListener("message", onMessage);
      relay.removeEventListener("undeliverable", onUndeliverable);
      view.stop();
    },
  };
}

/** Keep the latest view where tests and debugging tools can see it. @param {unknown} view */
function lastView(view) {
  /** @type {any} */ (globalThis).everygameLastView = view;
}
