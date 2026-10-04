// Opening a realm always visits. Hosting has a separate, explicit lifetime.
import { addressOf, generateKeyPair, isHash, newExchangeKey } from "../shared/crypto.js";
import { addressesIn, keysIn } from "./character.js";
import { isManifestBody, makeManifest, releaseOf } from "../shared/announce.js";
import { fromUtf8, parseStrictJson } from "../shared/encoding.js";
import { Relay } from "../shared/relay.js";
import { referee } from "../shared/referee.js";
import { relayUrl, visit } from "../shared/visitor.js";
import { makeChecker } from "../shared/check.js";
import { showClaim } from "../shared/claim.js";
import { held, keep } from "./claims.js";
import { announce, fetchBytes, fetchFile, lookUp, postRelease, publishOwned } from "./realms.js";
import { startRenderer, startRules } from "./sandbox.js";
import { put, realmStorage } from "./store.js";

/**
 * Try each server in turn and keep the first that has what is asked for.
 * @template T
 * @param {string[]} servers @param {(server: string) => Promise<T | null>} attempt @param {AbortSignal} signal @param {string} nothing
 * @returns {Promise<{ server: string, value: T }>}
 */
async function firstOf(servers, attempt, signal, nothing) {
  let last;
  for (const server of servers) {
    try {
      const value = await attempt(server);
      if (value) return { server, value };
    } catch (e) {
      signal.throwIfAborted();
      last = e;
    }
  }
  throw servers.length === 1 && last ? last : new Error(nothing);
}

/** @param {string} address @param {import('./character.js').Character} character @param {HTMLElement} container
 * @param {{servers: string[], status: (text: string, ms?: number) => void, release?: string, signal: AbortSignal,
 *   mayShow?: (name: string, realms: string[]) => Promise<string[]>}} ui
 *   `mayShow` asks the actor which of these realms' claims this realm may be shown; `servers` are tried in turn: the link's hints, then any this portal remembers for the realm */
export async function play(address, character, container, ui) {
  if (isHash(address)) return playAlone(address, character, container, ui);
  const { server, value: found } = await firstOf(ui.servers, (s) => lookUp(address, s, ui.signal), ui.signal,
    "No realm with this address is announced on the servers this link names.");
  // The realm's own signed list of where it is: one working hint leads to the rest, now and next time.
  const servers = [...new Set([server, ...found.servers, ...ui.servers])];
  put("servers:" + address, servers).catch(() => {});
  if (ui.release && ui.release !== found.release) {
    throw Object.assign(new Error("This link's version has changed."), { code: "release-changed" });
  }
  const { manifest } = found;
  if (manifest.needs.length) throw new Error(`Unknown permissions: ${manifest.needs.join(", ")}`);
  if (!manifest.renderer) {
    throw Object.assign(new Error(`${manifest.name} cannot be played in a browser.`), {
      portal: manifest.portal,
    });
  }
  const code = await fetchFile(manifest.files[manifest.renderer], server, ui.signal);
  const keys = await keysIn(character, address);
  const me = await addressOf(keys.publicKey);
  ui.signal.throwIfAborted();
  // The realm may ask to see what the actor has done elsewhere. The actor decides; each claim
  // goes with proof, made with the actor's key in the realm that signed it, that it is theirs.
  /** @type {{ realm: string, signed: import("../shared/envelope.js").Envelope, by: CryptoKeyPair }[]} */
  const mine = [];
  for (const realm of (manifest.asks ?? []).filter((r) => r !== address)) {
    // Only what is about this character: a record left by another character in this browser is not ours to show.
    const known = await addressesIn(character.secret, realm);
    for (const signed of await held(realm)) {
      const by = known.get(/** @type {string} */ (signed.to));
      if (by) mine.push({ realm, signed, by });
    }
  }
  /** @type {unknown[]} */
  const shown = [];
  const allowed = mine.length ? await ui.mayShow?.(manifest.name, [...new Set(mine.map((m) => m.realm))]) ?? [] : [];
  {
    for (const { signed, by } of mine.filter((m) => allowed.includes(m.realm)).slice(0, 16)) {
      // A claim about the address used here speaks for itself. One about another address of this
      // character (a realm entered privately) needs that address's word that it is the same character.
      shown.push(signed.to === me ? { claim: signed } : await showClaim(by, signed, `${address}\n${me}`));
    }
  }
  ui.signal.throwIfAborted();
  /** @type {Awaited<ReturnType<typeof visit>> | undefined} */
  let session;
  /** @type {ReturnType<typeof makeChecker> | undefined} */
  let checker;
  /** @type {Awaited<ReturnType<typeof startRules>> | undefined} */
  let copy;
  const renderer = await startRenderer(
    container,
    code,
    me,
    character.info,
    (action) => {
      checker?.sent(action);
      session?.act(action);
    },
    ui.signal,
  );
  try {
    if (manifest.main) {
      // Public rules that are repeatable can be checked: this portal runs its own copy and compares.
      const nothing = { get: () => Promise.resolve(undefined), put: () => Promise.resolve() };
      const mine = copy = await startRules(container, await fetchFile(manifest.files[manifest.main], server, ui.signal), nothing, ui.signal);
      if (mine.repeatable) {
        checker = makeChecker((check, who, adopt) => mine.replay(check, who, adopt), me, (why) => {
          console.error(`[check] The referee of ${manifest.name} ${why}.`);
          ui.status(`Warning: this realm's referee ${why}. It is not following its public rules.`, 60_000);
        }, (what) => ui.status(`Note: ${what}`, 20_000));
      } else {
        mine.stop();
        copy = undefined;
      }
    }
    session = await visit({
      servers,
      // Usually the realm itself; another key when the realm gave a referee a pass.
      address: found.referee,
      keys,
      release: found.release,
      character: character.info,
      signal: ui.signal,
      status: (text) => ui.status(text + (manifest.main ? "" : " Its rules are private.")),
      onView: (view) => {
        /** @type {any} */ (globalThis).endlessmindLastView = view;
        renderer.show(view);
      },
      shown,
      enterKey: found.key,
      onClaim: (signed) => keep(address, me, signed),
      onCheck: checker && ((check, view, hasView, first) => void checker?.state(check, view, hasView, first)),
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
      server,
      servers,
      stop() {
        session?.stop();
        renderer.stop();
        copy?.stop();
      },
    };
  } catch (e) {
    session?.stop();
    renderer.stop();
    copy?.stop();
    throw e;
  }
}

/**
 * A realm with no key: its release hash names it, and its rules are public, so
 * this portal runs the rules and the renderer itself. No referee, no relay, and
 * nothing anyone else can take away.
 * @param {string} release @param {import('./character.js').Character} character @param {HTMLElement} container
 * @param {{servers: string[], status: (text: string) => void, signal: AbortSignal}} ui
 */
async function playAlone(release, character, container, ui) {
  const { server, value: bytes } = await firstOf(ui.servers, (s) => fetchBytes(release, s, ui.signal), ui.signal,
    "None of the servers this link names has this realm.");
  const body = parseStrictJson(fromUtf8(bytes));
  if (!isManifestBody(body) || !body.main) throw new Error("This link does not name a realm that can be played alone.");
  if (body.needs.length) throw new Error(`Unknown permissions: ${body.needs.join(", ")}`);
  if (!body.renderer) throw Object.assign(new Error(`${body.name} cannot be played in a browser.`), { portal: body.portal });
  const [rulesCode, code] = await Promise.all(
    [body.main, body.renderer].map((name) => fetchFile(body.files[name], server, ui.signal)),
  );
  // Using a release keeps it on the server: posting it again renews it.
  postRelease(body, server).catch(() => {});
  const me = await addressOf((await keysIn(character, release)).publicKey);
  ui.signal.throwIfAborted();
  const rules = await startRules(container, rulesCode, realmStorage(release, true), ui.signal);
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
    rules.onRemove((_actor, reason) => {
      stop();
      ui.status(`The realm ended your visit: ${reason || "no reason given"}`);
    });
    timer = setInterval(() => rules.step(), 1000 / rules.ticksPerSecond);
    ui.signal.addEventListener("abort", stop, { once: true });
    ui.status(`You are in ${body.name}, playing your own copy.`);
    return { name: body.name, release, alone: release, server, servers: [server], source: { body, files: { [body.main]: rulesCode } }, stop };
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
  return { address, ...await runReferee(room, rules, server, (key) => announce(room, server, lifetime, key), status, onStop) };
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
  return runReferee(realm, rules, server, (key) => announce(realm, server, undefined, key), status, onStop);
}

/**
 * @param {{address: string, name: string, keys: CryptoKeyPair, manifest: import('../shared/envelope.js').Envelope}} realm
 * @param {Awaited<ReturnType<typeof startRules>>} rules @param {string} server @param {(key?: string) => Promise<void>} renew
 * @param {(text: string) => void} status @param {() => void} onStop
 */
async function runReferee(realm, rules, server, renew, status, onStop) {
  const relay = new Relay(relayUrl(server));
  try {
    // Visitors lock the private part of their entry requests to this key, so the announcement must name it.
    const exchange = await newExchangeKey();
    await renew(exchange?.publicText);
    await relay.connect();
    const ref = await referee({
      exchange,
      address: realm.address,
      keys: realm.keys,
      name: realm.name,
      release: await releaseOf(realm.manifest),
      rules,
      relay,
      announce: () => renew(exchange?.publicText),
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
