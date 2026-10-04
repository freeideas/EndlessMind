// Opening a realm always visits. Hosting has a separate, explicit lifetime.
import { addressOf, keyPairForRealm } from "../shared/crypto.js";
import { releaseOf } from "../shared/announce.js";
import { fromUtf8 } from "../shared/encoding.js";
import { Relay } from "../shared/relay.js";
import { referee } from "../shared/referee.js";
import { relayUrl, visit } from "../shared/visitor.js";
import { announce, fetchFile, lookUp, publishOwned } from "./realms.js";
import { startRenderer, startRules } from "./sandbox.js";
import { realmStorage } from "./store.js";

/** @param {string} address @param {import('./character.js').Character} character @param {HTMLElement} container
 * @param {{server: string, status: (text: string) => void, release?: string, signal: AbortSignal}} ui */
export async function play(address, character, container, ui) {
  const found = await lookUp(address, ui.server, ui.signal);
  if (!found) throw new Error("No realm with this address is announced on this server.");
  if (ui.release && ui.release !== found.release) {
    throw Object.assign(new Error("This link's version has changed."), { code: "release-changed" });
  }
  const { manifest } = found;
  if (manifest.needs.length) throw new Error(`Unknown permissions: ${manifest.needs.join(", ")}`);
  if (!manifest.renderer) {
    throw Object.assign(new Error(`${manifest.name} cannot be played in a browser.`), {
      app: manifest.app,
    });
  }
  const code = await fetchFile(manifest.files[manifest.renderer], ui.server, ui.signal);
  const keys = await keyPairForRealm(character.secret, address);
  const me = await addressOf(keys.publicKey);
  ui.signal.throwIfAborted();
  /** @type {Awaited<ReturnType<typeof visit>> | undefined} */
  let session;
  const renderer = await startRenderer(
    container,
    code,
    me,
    character.info,
    (action) => session?.act(action),
    ui.signal,
  );
  try {
    session = await visit({
      server: ui.server,
      address,
      keys,
      release: found.release,
      character: character.info,
      signal: ui.signal,
      status: (text) => ui.status(text + (manifest.main ? "" : " Its rules are private.")),
      onView: (view) => {
        /** @type {any} */ (globalThis).endlessmindLastView = view;
        renderer.show(view);
      },
    });
    ui.signal.throwIfAborted();
    return {
      name: manifest.name,
      release: found.release,
      stop() {
        session?.stop();
        renderer.stop();
      },
    };
  } catch (e) {
    session?.stop();
    renderer.stop();
    throw e;
  }
}

/** @param {import('./realms.js').OwnedRealm} realm @param {string} server @param {HTMLElement} container
 * @param {(text: string) => void} status @param {() => void} onStop */
export async function startHosting(realm, server, container, status, onStop) {
  const body = /** @type {import('../shared/announce.js').ManifestBody} */ (realm.manifest.body);
  if (!body.main) throw new Error("Private rules need the host program.");
  await publishOwned(realm, server);
  const rules = await startRules(
    container,
    fromUtf8(/** @type {NonNullable<typeof realm.files>} */ (realm.files)[body.main]),
    realmStorage(realm.address),
  );
  const relay = new Relay(relayUrl(server));
  try {
    await relay.connect();
    const ref = await referee({
      address: realm.address,
      keys: realm.keys,
      name: realm.name,
      release: await releaseOf(realm.manifest),
      rules,
      relay,
      announce: () => announce(realm, server),
      status,
      onStop: () => {
        relay.close();
        onStop();
      },
    });
    return { stop: ref.stop };
  } catch (e) {
    rules.stop();
    relay.close();
    throw e;
  }
}
