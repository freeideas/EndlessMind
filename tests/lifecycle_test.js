import { assert, assertEquals } from "jsr:@std/assert@1";
import { hashOf, newPortableKey } from "../shared/crypto.js";
import { makeManifest, releaseOf } from "../shared/announce.js";
import { bundleFiles, decodeFile, encodeFile, KEY_FORMAT } from "../shared/bundle.js";
import { fileStorage } from "../host/storage.js";
import { referee } from "../shared/referee.js";
import { exportBackup, startHost } from "../host/host.js";
import { startServer } from "../server/server.js";

const delay = () => new Promise((r) => setTimeout(r, 20));

Deno.test("release identity survives republication; backups preserve every byte", async () => {
  const { keys } = await newPortableKey();
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  const body = { name: "Bytes", tags: [], needs: [], files: { "image.png": await hashOf(bytes) } };
  const first = await makeManifest(keys, body), second = await makeManifest(keys, body);
  assertEquals(await releaseOf(first), await releaseOf(second));
  assert(
    await releaseOf(first) !==
      await releaseOf(await makeManifest(keys, { ...body, name: "Changed" })),
  );
  assertEquals(decodeFile(encodeFile(bytes)), bytes);
  assertEquals(
    (await bundleFiles({ format: KEY_FORMAT }, {
      manifest: first,
      files: { "image.png": encodeFile(bytes) },
    }))["image.png"],
    bytes,
  );
});

Deno.test("realm storage commits concurrent writes and can be reopened", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const store = await fileStorage(`${dir}/state.json`);
    await Promise.all([store.put("plants", [1, 2]), store.put("visits", 3)]);
    assertEquals(await (await fileStorage(`${dir}/state.json`)).snapshot(), {
      plants: [1, 2],
      visits: 3,
    });
    const value = /** @type {number[]} */ (await store.get("plants"));
    value.push(9);
    assertEquals(await store.get("plants"), [1, 2]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("referee deduplicates pending entry and rejects stale sessions and actions", async () => {
  class TestRelay extends EventTarget {
    /** @type {any[]} */ sent = [];
    async addKey() {}
    release() {}
    /** @param {unknown} _keys @param {string} to @param {string} kind @param {unknown} body */
    async send(_keys, to, kind, body) {
      this.sent.push({ to, kind, body });
    }
  }
  const relay = new TestRelay();
  let entries = 0, actions = 0, stopped = false;
  /** @type {(value: {ok:boolean}) => void} */
  let finish = () => {};
  const pending = new Promise((resolve) => finish = resolve);
  /** @type {(views: Record<string, unknown>) => void} */
  let views = () => {};
  /** @type {(player: string, reason: string) => void} */
  let remove = () => {};
  /** @type {import('../shared/referee.js').RulesDriver} */
  const rules = {
    ticksPerSecond: 1,
    enter() {
      entries++;
      return /** @type {Promise<{ok:boolean}>} */ (pending);
    },
    act() {
      actions++;
    },
    leave() {},
    step() {},
    onViews(fn) {
      views = fn;
    },
    onRemove(fn) {
      remove = fn;
    },
    stop() {
      stopped = true;
    },
  };
  const { keys } = await newPortableKey();
  const ref = await referee({
    address: "realm",
    keys,
    name: "Test",
    release: "release",
    rules,
    relay: /** @type {any} */ (relay),
    announce: async () => {},
    status: () => {},
  });
  const message = (/** @type {string} */ kind, /** @type {unknown} */ body) =>
    relay.dispatchEvent(
      new CustomEvent("message", { detail: { from: "player", to: "realm", kind, body } }),
    );
  try {
    const request = "a".repeat(26);
    message("emind.enter", { request, release: "release" });
    message("emind.enter", { request, release: "release" });
    assertEquals(entries, 1);
    finish({ ok: true });
    await delay();
    const session = relay.sent[0].body.session;
    assertEquals(relay.sent[1].body.session, session);
    message("emind.act", { session: "old", seq: 1, action: {} });
    message("emind.act", { session, seq: 2, action: {} });
    message("emind.act", { session, seq: 1, action: {} });
    assertEquals(actions, 1);
    views({ player: { n: 1 } });
    views({ player: { n: 2 } });
    assertEquals(relay.sent.filter((m) => m.kind === "emind.state").map((m) => m.body.seq), [1, 2]);
    message("emind.leave", { session: "old" });
    message("emind.act", { session, seq: 3, action: {} });
    assertEquals(actions, 2);
    remove("player", "Idle too long.");
    assertEquals(relay.sent.at(-1), { to: "player", kind: "emind.refused", body: { request, reason: "Idle too long." } });
    message("emind.act", { session, seq: 9, action: {} });
    assertEquals(actions, 2, "a removed player's session is over");
    ref.stop();
    assert(stopped);
    message("emind.act", { session, seq: 4, action: {} });
    assertEquals(actions, 2);
  } finally {
    ref.stop();
  }
});

Deno.test("host restores realm storage and exports portable data with binary files", async () => {
  const dir = await Deno.makeTempDir();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir: `${dir}/server` });
  try {
    await Deno.mkdir(`${dir}/realm`);
    await Deno.writeTextFile(
      `${dir}/realm/realm.json`,
      JSON.stringify({
        name: "Persistent",
        main: "rules.js",
        renderer: "renderer.js",
        files: ["image.png"],
      }),
    );
    await Deno.writeTextFile(
      `${dir}/realm/rules.js`,
      `export default { async init({storage}) { await storage.put('starts', (await storage.get('starts') ?? 0) + 1); return {}; }, view() {return {};} };`,
    );
    await Deno.writeTextFile(`${dir}/realm/renderer.js`, "export default {start(){}}");
    const bytes = new Uint8Array([137, 80, 78, 71, 255, 0]);
    await Deno.writeFile(`${dir}/realm/image.png`, bytes);
    const options = {
      server: `http://127.0.0.1:${s.port}`,
      realmDir: `${dir}/realm`,
      keysFile: `${dir}/keys.json`,
      log: () => {},
    };
    const first = await startHost(options);
    first.stop();
    const again = await startHost(options);
    again.stop();
    await delay();
    await exportBackup(options.keysFile, `${dir}/backup.json`);
    const backup = JSON.parse(await Deno.readTextFile(`${dir}/backup.json`));
    assertEquals(backup.realms[0].storage.starts, 2);
    assertEquals(decodeFile(backup.realms[0].files["image.png"]), bytes);
    const moved = await startHost({
      ...options,
      realmDir: undefined,
      keysFile: `${dir}/backup.json`,
    });
    moved.stop();
    await delay();
    const storage = await fileStorage(`${dir}/backup.json.${moved.address}.state.json`);
    assertEquals(await storage.get("starts"), 3);
  } finally {
    await s.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("visitor accepts only its session and increasing view numbers", async () => {
  const { Relay } = await import("../shared/relay.js");
  const { visit, relayUrl } = await import("../shared/visitor.js");
  const dir = await Deno.makeTempDir();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir: dir });
  const base = `http://127.0.0.1:${s.port}`;
  const host = new Relay(relayUrl(base));
  let visitor;
  try {
    const owner = await newPortableKey(), player = await newPortableKey();
    await host.connect();
    const realm = await host.addKey(owner.keys);
    let target = "";
    /** @type {(value?: unknown) => void} */
    let welcomed = () => {};
    const ready = new Promise((r) => welcomed = r);
    host.addEventListener("message", (event) => {
      const e = /** @type {CustomEvent} */ (event).detail;
      if (e.kind === "emind.enter") {
        target = e.from;
        host.send(owner.keys, target, "emind.welcome", {
          request: e.body.request,
          session: "fresh",
          instance: "host",
          release: "version",
          name: "Test",
        }).then(welcomed);
      }
    });
    /** @type {unknown[]} */
    const views = [];
    visitor = await visit({
      server: base,
      address: realm,
      keys: player.keys,
      release: "version",
      character: {},
      onView: (v) => views.push(v),
      status: () => {},
    });
    await ready;
    await delay();
    await host.send(owner.keys, target, "emind.state", { session: "fresh", seq: 2, view: "new" });
    await host.send(owner.keys, target, "emind.state", { session: "fresh", seq: 1, view: "old" });
    await host.send(owner.keys, target, "emind.state", {
      session: "previous",
      seq: 99,
      view: "other session",
    });
    await delay();
    assertEquals(views, ["new"]);
  } finally {
    visitor?.stop();
    host.close();
    await delay();
    await s.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("messages are copied when sent, leave in order, and oversize ones are reported", async () => {
  const { Relay } = await import("../shared/relay.js");
  const { relayUrl } = await import("../shared/visitor.js");
  const { open, seal } = await import("../shared/envelope.js");
  const dir = await Deno.makeTempDir();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir: dir });
  const a = new Relay(relayUrl(`http://127.0.0.1:${s.port}`)), b = new Relay(a.url);
  try {
    const sender = await newPortableKey(), receiver = await newPortableKey();
    await Promise.all([a.connect(), b.connect()]);
    await a.addKey(sender.keys);
    const to = await b.addKey(receiver.keys);
    /** @type {any[]} */
    const got = [];
    b.addEventListener("message", (e) => got.push(/** @type {CustomEvent} */ (e).detail.body));

    // A change made after the call must not reach the receiver.
    const state = { score: 1 };
    const first = a.send(sender.keys, to, "x.view", state);
    state.score = 2;
    // A large message followed by a small one: the small one must not overtake it.
    const big = a.send(sender.keys, to, "x.act", { n: 1, pad: "x".repeat(150_000) });
    const small = a.send(sender.keys, to, "x.act", { n: 2 });
    let refused = "";
    await a.send(sender.keys, to, "x.view", "x".repeat(300_000)).catch((e) => refused = String(e));
    await Promise.all([first, big, small]);
    for (let i = 0; i < 50 && got.length < 3; i++) await delay();
    assertEquals(got.map((m) => m.score ?? m.n), [1, 1, 2]);
    assert(refused.includes("over the limit"), "an oversize message must be reported to its sender");

    // A value JSON writes differently from how it is held (a Date) is signed as it travels.
    const dated = await seal(sender.keys, to, "x.view", { at: new Date(0) });
    assertEquals((await open(JSON.parse(JSON.stringify(dated))))?.body, { at: "1970-01-01T00:00:00.000Z" });
    assertEquals(await open({ ...dated, v: "emind/1" }), null, "an unknown version is not read as version 0");
  } finally {
    a.close();
    b.close();
    await delay();
    await s.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("rules can remove a player, skip a view, and survive one view failing", async () => {
  const { directRules } = await import("../shared/referee.js");
  /** @type {(player: string, reason?: string) => void} */
  let remove = () => {};
  /** @type {unknown[]} */
  const errors = [];
  const driver = await directRules({
    init(/** @type {any} */ o) {
      remove = o.remove;
      return {};
    },
    view(/** @type {unknown} */ _s, /** @type {string} */ p) {
      if (p === "broken") throw new Error("bad view");
      return p === "quiet" ? undefined : { hello: p };
    },
  }, undefined, (e) => errors.push(e));
  /** @type {Record<string, unknown>[]} */
  const views = [];
  /** @type {string[][]} */
  const removed = [];
  driver.onViews((v) => views.push(v));
  driver.onRemove((player, reason) => removed.push([player, reason]));
  for (const p of ["a", "quiet", "broken", "b"]) await driver.enter(p, {});
  driver.step();
  await delay();
  assertEquals(views, [{ a: { hello: "a" }, b: { hello: "b" } }]);
  assertEquals(errors.length, 1);
  remove("b", "Idle too long.");
  remove("nobody");
  assertEquals(removed, [["b", "Idle too long."]]);
  driver.step();
  await delay();
  assertEquals(views[1], { a: { hello: "a" } });
  driver.stop();
});

Deno.test("a visitor that offers a key gets a private session the relay cannot read", async () => {
  const { lock, newExchangeKey, sessionKey, TO_REALM, TO_VISITOR, unlock } = await import("../shared/crypto.js");
  class TestRelay extends EventTarget {
    /** @type {any[]} */ sent = [];
    async addKey() {}
    release() {}
    /** @param {unknown} _keys @param {string} to @param {string} kind @param {unknown} body */
    async send(_keys, to, kind, body) {
      this.sent.push({ to, kind, body: JSON.parse(JSON.stringify(body)) });
    }
  }
  const relay = new TestRelay();
  /** @type {unknown[]} */
  const actions = [];
  /** @type {(views: Record<string, unknown>) => void} */
  let views = () => {};
  const { keys } = await newPortableKey();
  const ref = await referee({
    address: "realm", keys, name: "Test", release: "release", relay: /** @type {any} */ (relay),
    announce: async () => {}, status: () => {},
    rules: {
      ticksPerSecond: 1,
      enter: () => Promise.resolve({ ok: true }),
      act: (_player, action) => void actions.push(action),
      leave() {}, step() {}, onRemove() {}, stop() {},
      onViews(fn) { views = fn; },
    },
  });
  const message = (/** @type {string} */ kind, /** @type {unknown} */ body) =>
    relay.dispatchEvent(new CustomEvent("message", { detail: { from: "player", to: "realm", kind, body } }));
  try {
    const mine = await newExchangeKey();
    assert(mine);
    message("emind.enter", { request: "a".repeat(26), release: "release", key: mine.publicText });
    views({ player: { hand: "dealt before the welcome" } });
    for (let i = 0; i < 50 && !relay.sent.length; i++) await delay();
    assertEquals(relay.sent[0].kind, "emind.welcome", "nothing goes out before the welcome, when the key may not be ready");
    const welcome = relay.sent[0].body;
    const cipher = await sessionKey(mine.privateKey, welcome.key, `realm\nplayer\n${welcome.session}`);

    views({ player: { hand: "the hidden ace" } });
    for (let i = 0; i < 50 && relay.sent.length < 2; i++) await delay();
    const state = relay.sent[1].body;
    assert(!JSON.stringify(relay.sent).includes("hidden ace"), "the view crossed the relay in the clear");
    assertEquals(JSON.parse(await unlock(cipher, TO_VISITOR, state.seq, state.box)), { view: { hand: "the hidden ace" } });
    let moved = false;
    await unlock(cipher, TO_VISITOR, state.seq + 1, state.box).catch(() => moved = true);
    assert(moved, "a box replayed under another number must not open");

    message("emind.act", { session: welcome.session, seq: 1, box: await lock(cipher, TO_REALM, 1, JSON.stringify({ action: { play: "ace" } })) });
    message("emind.act", { session: welcome.session, seq: 2, action: { play: "in the clear" } });
    await delay();
    assertEquals(actions, [{ play: "ace" }], "in a private session only locked moves count");
  } finally {
    ref.stop();
  }
});
