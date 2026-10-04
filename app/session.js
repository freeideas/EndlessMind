// Being in a realm: as its referee (this browser holds the realm's key and its
// rules are public) or as a visitor. The referee loop itself is shared with the
// host program (shared/referee.js); the message kinds are the "entering and
// leaving" extension in specs/RUNTIME.md.

import { referee } from "../shared/referee.js";
import { announce, fetchFile, lookUp } from "./realms.js";
import { startRenderer, startRules } from "./sandbox.js";

/** @typedef {import("../shared/relay.js").Relay} Relay */
/** @typedef {import("./character.js").Character} Character */
/** @typedef {import("./realms.js").OwnedRealm} OwnedRealm */
/** @typedef {import("../shared/envelope.js").Envelope} Envelope */

const PING_EVERY_MS = 5_000;
const REFEREE_SILENT_MS = 15_000;

/**
 * Play in a realm: as a local player if this browser referees it (it holds the
 * key and the rules are public), otherwise as a visitor through the relay.
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
  if (!manifest.renderer) {
    throw Object.assign(new Error(`${manifest.name} cannot be played in a browser.`), { app: manifest.app });
  }
  const rendererCode = await fetchFile(manifest.files[manifest.renderer]);

  // A realm with private rules is refereed by its host program; here its key holder is a visitor like anyone.
  const owned = ui.owned;
  const ownManifest = /** @type {import("../shared/announce.js").ManifestBody | undefined} */ (owned?.manifest.body);
  if (owned && ownManifest?.main) {
    const rules = await startRules(container, await fetchFile(ownManifest.files[ownManifest.main]));
    const ref = await referee({
      address: owned.address,
      keys: owned.keys,
      name: ownManifest.name,
      rules,
      relay,
      announce: () => announce(owned),
      status: ui.status,
    });
    announce(owned).catch(console.error);
    const view = await startRenderer(container, rendererCode, character.address, character.info, (action) =>
      ref.act(character.address, action));
    const verdict = await ref.addLocalPlayer(character.address, character.info, (v) => (lastView(v), view.show(v)));
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
      ui.status(`You are in ${manifest.name}.` + (manifest.main ? "" : " Its rules are private: only its referee knows them."));
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
