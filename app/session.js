// Opening a realm always visits. Hosting has a separate, explicit lifetime.
import { addressOf, generateKeyPair, isHash, keyPairForRealm } from "../shared/crypto.js";
import { isManifestBody, makeManifest, releaseOf } from "../shared/announce.js";
import { fromUtf8, parseStrictJson } from "../shared/encoding.js";
import { Relay } from "../shared/relay.js";
import { referee } from "../shared/referee.js";
import { relayUrl, visit } from "../shared/visitor.js";
import { announce, fetchBytes, fetchFile, lookUp, postRelease, publishOwned } from "./realms.js";
import { startRenderer, startRules } from "./sandbox.js";
import { realmStorage } from "./store.js";

/** @param {string} address @param {import('./character.js').Character} character @param {HTMLElement} container
 * @param {{server: string, status: (text: string) => void, release?: string, signal: AbortSignal}} ui */
export async function play(address, character, container, ui) {
  if (isHash(address)) return playAlone(address, character, container, ui);
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
    if (!found.online && manifest.main) {
      ui.status(`${manifest.name} has no referee online. Its rules are public, so you can choose Play alone to run your own copy.`);
    }
    return {
      name: manifest.name,
      release: found.release,
      // With public rules, the same release can be played with no referee.
      alone: manifest.main ? found.release : undefined,
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

/**
 * A realm with no key: its release hash names it, and its rules are public, so
 * this app runs the rules and the renderer itself. No referee, no relay, and
 * nothing anyone else can take away.
 * @param {string} release @param {import('./character.js').Character} character @param {HTMLElement} container
 * @param {{server: string, status: (text: string) => void, signal: AbortSignal}} ui
 */
async function playAlone(release, character, container, ui) {
  const body = parseStrictJson(fromUtf8(await fetchBytes(release, ui.server, ui.signal)));
  if (!isManifestBody(body) || !body.main) throw new Error("This link does not name a realm that can be played alone.");
  if (body.needs.length) throw new Error(`Unknown permissions: ${body.needs.join(", ")}`);
  if (!body.renderer) throw Object.assign(new Error(`${body.name} cannot be played in a browser.`), { app: body.app });
  const [rulesCode, code] = await Promise.all(
    [body.main, body.renderer].map((name) => fetchFile(body.files[name], ui.server, ui.signal)),
  );
  // Using a release keeps it on the server: posting it again renews it.
  postRelease(body, ui.server).catch(() => {});
  const me = await addressOf((await keyPairForRealm(character.secret, release)).publicKey);
  ui.signal.throwIfAborted();
  const rules = await startRules(container, rulesCode, realmStorage(release), ui.signal);
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;
  /** @type {Awaited<ReturnType<typeof startRenderer>> | undefined} */
  let renderer;
  const stop = () => {
    clearInterval(timer);
    rules.stop();
    renderer?.stop();
  };
  try {
    renderer = await startRenderer(container, code, me, character.info, (action) => rules.act(me, action), ui.signal);
    const verdict = await rules.enter(me, character.info);
    if (!verdict.ok) throw new Error(`The realm refused you: ${verdict.reason || "no reason given"}`);
    rules.onViews((views) => {
      if (!Object.hasOwn(views, me)) return;
      /** @type {any} */ (globalThis).endlessmindLastView = views[me];
      renderer?.show(views[me]);
    });
    rules.onRemove((_player, reason) => {
      stop();
      ui.status(`The realm ended your visit: ${reason || "no reason given"}`);
    });
    timer = setInterval(() => rules.step(), 1000 / rules.ticksPerSecond);
    ui.signal.addEventListener("abort", stop, { once: true });
    ui.status(`You are in ${body.name}, playing your own copy.`);
    return { name: body.name, release, alone: release, source: { body, files: { [body.main]: rulesCode } }, stop };
  } catch (e) {
    stop();
    throw e;
  }
}

/**
 * A room: this tab referees a release under a key made on the spot and never
 * saved. When the tab closes the room is gone, and anyone can start another.
 * @param {{body: import('../shared/announce.js').ManifestBody, files: Record<string, string>}} source
 * @param {string} server @param {HTMLElement} container @param {(text: string) => void} status @param {() => void} onStop
 */
export async function startRoom(source, server, container, status, onStop) {
  const keys = await generateKeyPair();
  const address = await addressOf(keys.publicKey);
  const manifest = await makeManifest(keys, source.body);
  const room = { address, name: source.body.name, keys, manifest };
  const lifetime = 2 * 60 * 60 * 1000;
  // The files are already on this server, listed by the release this room was started from.
  await announce(room, server, lifetime);
  /** @type {Map<string, unknown>} A room keeps nothing after it ends. */
  const memory = new Map();
  const storage = {
    get: (/** @type {string} */ key) => Promise.resolve(memory.get(key)),
    put: (/** @type {string} */ key, /** @type {unknown} */ value) => Promise.resolve(void memory.set(key, JSON.parse(JSON.stringify(value)))),
  };
  const rules = await startRules(container, source.files[/** @type {string} */ (source.body.main)], storage);
  return { address, ...await runReferee(room, rules, server, () => announce(room, server, lifetime), status, onStop) };
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
  return runReferee(realm, rules, server, () => announce(realm, server), status, onStop);
}

/**
 * @param {{address: string, name: string, keys: CryptoKeyPair, manifest: import('../shared/envelope.js').Envelope}} realm
 * @param {Awaited<ReturnType<typeof startRules>>} rules @param {string} server @param {() => Promise<void>} renew
 * @param {(text: string) => void} status @param {() => void} onStop
 */
async function runReferee(realm, rules, server, renew, status, onStop) {
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
      announce: renew,
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
