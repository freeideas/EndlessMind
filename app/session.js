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
const REFEREE_SILENT_MS = 15_000;
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
    if (env.kind === "emind.enter" && !known) {
      const verdict = await rules.enter(env.from, body.character ?? {});
      if (!verdict.ok) {
        await relay.send(realm.keys, env.from, "emind.refused", { reason: verdict.reason ?? "" });
        return;
      }
      players.set(env.from, {
        local: false,
        lastHeard: Date.now(),
        deliver: (view) => relay.send(realm.keys, env.from, "emind.state", { view }),
      });
      await relay.send(realm.keys, env.from, "emind.welcome", { name: manifest.name });
      status(`${body.character?.name ?? "Someone"} came in.`);
    } else if (env.kind === "emind.enter" && known) {
      await relay.send(realm.keys, env.from, "emind.welcome", { name: manifest.name });
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
    if (/** @type {CustomEvent<string>} */ (event).detail !== realm.address) return;
    halt();
    status(`${manifest.name} is now being hosted from somewhere else, so this copy has stopped.`);
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

  const renewer = setInterval(() => announce(realm).catch(console.error), RENEW_ANNOUNCEMENT_MS);
  announce(realm).catch(console.error);

  function halt() {
    clearInterval(ticker);
    clearInterval(renewer);
    relay.removeEventListener("message", onMessage);
    relay.removeEventListener("replaced", onReplaced);
  }

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
      halt();
      relay.release(realm.address);
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
 * @param {{ status: (text: string, ms?: number) => void, owned?: OwnedRealm, release?: string }} ui
 */
export async function play(address, character, relay, container, ui) {
  const found = await lookUp(address);
  if (!found) {
    throw Object.assign(new Error("No realm with this address is announced on this server."), { code: "not-here" });
  }
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
    relay.send(character.keys, address, "emind.act", { action }));

  let welcomed = false;
  let lastHeard = Date.now();
  /** @param {Event} event */
  function onMessage(event) {
    const env = /** @type {CustomEvent<Envelope>} */ (event).detail;
    if (env.from !== address || env.to !== character.address) return;
    const body = /** @type {any} */ (env.body) ?? {};
    lastHeard = Date.now();
    if (env.kind === "emind.welcome" && !welcomed) {
      welcomed = true;
      ui.status(`You are in ${manifest.name}.`);
    } else if (env.kind === "emind.refused") {
      ui.status(`The realm refused you: ${body.reason || "no reason given"}`);
    } else if (env.kind === "emind.state") {
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
  /** @param {Event} event */
  function onReplaced(event) {
    if (/** @type {CustomEvent<string>} */ (event).detail !== character.address) return;
    clearInterval(pinger);
    ui.status("Your character is now playing from another tab or device, so this one has stopped.", 60_000);
  }
  relay.addEventListener("replaced", onReplaced);

  const enter = () => relay.send(character.keys, address, "emind.enter", { character: character.info });
  await enter();
  ui.status(found.online ? `Entering ${manifest.name}...` : "This realm's referee is not online right now. Waiting for it...");
  const pinger = setInterval(() => {
    // A referee that restarted or moved no longer knows us: ask to come in again.
    if (welcomed && Date.now() - lastHeard > REFEREE_SILENT_MS) welcomed = false;
    if (welcomed) relay.send(character.keys, address, "emind.ping", {});
    else enter();
  }, PING_EVERY_MS);

  return {
    name: manifest.name,
    release: found.release,
    stop() {
      clearInterval(pinger);
      relay.send(character.keys, address, "emind.leave", {});
      relay.removeEventListener("message", onMessage);
      relay.removeEventListener("undeliverable", onUndeliverable);
      relay.removeEventListener("replaced", onReplaced);
      view.stop();
    },
  };
}

/** Keep the latest view where tests and debugging tools can see it. @param {unknown} view */
function lastView(view) {
  /** @type {any} */ (globalThis).endlessmindLastView = view;
}
