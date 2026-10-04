import { assert, assertEquals } from "jsr:@std/assert@1";
import { startServer } from "../server/server.js";
import { makeAnnouncement, makeManifest, releaseOfBody } from "../shared/announce.js";
import { addressOf, generateKeyPair, hashOf, sign } from "../shared/crypto.js";
import { seal } from "../shared/envelope.js";

/** @param {(base: string) => Promise<void>} body */
async function withServer(body) {
  const dataDir = await Deno.makeTempDir();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir, sweepMs: 20 });
  try {
    await body(`http://127.0.0.1:${s.port}`);
  } finally {
    await s.shutdown();
    await Deno.remove(dataDir, { recursive: true });
  }
}

/** A minimal relay client for tests. @param {string} base @param {CryptoKeyPair} keys */
async function connect(base, keys) {
  const socket = new WebSocket(base.replace("http", "ws") + "/ws");
  /** @type {any[]} */
  const inbox = [];
  /** @type {((m: any) => void)[]} */
  const waiters = [];
  socket.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "challenge") {
      socket.send(JSON.stringify({ type: "prove", address: m.address, sig: await sign(keys.privateKey, "claim", `${new URL(base).host}\n${m.nonce}`) }));
      return;
    }
    const w = waiters.shift();
    if (w) w(m);
    else inbox.push(m);
  };
  await new Promise((r) => (socket.onopen = r));
  const next = () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise((r) => waiters.push(r));
  assertEquals((await next()).type, "welcome");
  socket.send(JSON.stringify({ type: "claim", address: await addressOf(keys.publicKey) }));
  assertEquals((await next()).type, "claimed");
  return { socket, next, close: () => socket.close() };
}

/** Announce a realm listing these files, so the server will take them. @param {string} base @param {Record<string, string>} files */
async function announceFiles(base, files, expires = 0) {
  const realm = await generateKeyPair();
  const manifest = await makeManifest(realm, { name: "Files", tags: [], files, needs: [] });
  const note = expires
    ? await seal(realm, null, "announce", { manifest, name: "Files", tags: [], expires })
    : await makeAnnouncement(realm, manifest);
  const reply = await fetch(`${base}/announce`, { method: "POST", body: JSON.stringify(note) });
  assertEquals(reply.status, 200);
  await reply.body?.cancel();
}

Deno.test("blobs are stored only under their true hash, and only while a realm lists them", () =>
  withServer(async (base) => {
    const data = new TextEncoder().encode("export default {}");
    const hash = await hashOf(data);
    const unlisted = await fetch(`${base}/blob/${hash}`, { method: "PUT", body: data });
    assertEquals(unlisted.status, 403, "a file no announced realm lists is not taken");
    await unlisted.body?.cancel();
    await announceFiles(base, { "rules.js": hash }, Date.now() + 300);
    assertEquals((await fetch(`${base}/blob/${hash}`, { method: "PUT", body: data })).status, 200);
    assertEquals(new TextDecoder().decode(await (await fetch(`${base}/blob/${hash}`)).arrayBuffer()), "export default {}");
    const wrong = await fetch(`${base}/blob/${await hashOf("other")}`, { method: "PUT", body: data });
    assertEquals(wrong.status, 400);
    await wrong.body?.cancel();

    // When the announcement expires, the next sweep deletes the file.
    await new Promise((r) => setTimeout(r, 350));
    await announceFiles(base, {});
    await new Promise((r) => setTimeout(r, 100));
    const gone = await fetch(`${base}/blob/${hash}`);
    assertEquals(gone.status, 404);
    await gone.body?.cancel();
  }));

Deno.test("a release with no key is kept under its hash, listed, and may bring its files", () =>
  withServer(async (base) => {
    const rules = new TextEncoder().encode("export default {}");
    const body = { name: "Solo", tags: ["alone"], files: { "r.js": await hashOf(rules) }, main: "r.js", renderer: "r.js", needs: [] };
    const posted = await (await fetch(`${base}/announce`, { method: "POST", body: JSON.stringify(body) })).json();
    assertEquals(posted.release, await releaseOfBody(body));
    assertEquals(await releaseOfBody(await (await fetch(`${base}/blob/${posted.release}`)).json()), posted.release);
    assertEquals((await fetch(`${base}/blob/${body.files["r.js"]}`, { method: "PUT", body: rules })).status, 200);
    const list = await (await fetch(`${base}/announce?tag=alone`)).json();
    assertEquals(list.realms.map((/** @type {any} */ r) => [r.address, r.online]), [[posted.release, true]]);
    // Announcing the same files under a key must not hide the release from the list.
    const squatter = await generateKeyPair();
    const squat = await fetch(`${base}/announce`, { method: "POST", body: JSON.stringify(await makeAnnouncement(squatter, await makeManifest(squatter, body))) });
    await squat.body?.cancel();
    const both = await (await fetch(`${base}/announce?tag=alone`)).json();
    assert(both.realms.some((/** @type {any} */ r) => r.address === posted.release), "the release was hidden");
    const secret = await fetch(`${base}/announce`, { method: "POST", body: JSON.stringify({ ...body, main: undefined }) });
    assertEquals(secret.status, 400, "a release nobody can run is refused");
    await secret.body?.cancel();
  }));

Deno.test("a claim passed on through another server is refused, and a flood does not disconnect its target", async () => {
  const dataDir = await Deno.makeTempDir();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir, bytesPerSecond: 600_000 });
  // A dishonest server in the middle: it forwards every byte to the honest one.
  const middle = Deno.listen({ port: 0, hostname: "127.0.0.1" });
  (async () => {
    for await (const c of middle) {
      const up = await Deno.connect({ port: s.port, hostname: "127.0.0.1" });
      c.readable.pipeTo(up.writable).catch(() => {});
      up.readable.pipeTo(c.writable).catch(() => {});
    }
  })();
  try {
    const { Relay } = await import("../shared/relay.js");
    const victim = new Relay(`ws://127.0.0.1:${/** @type {Deno.NetAddr} */ (middle.addr).port}/ws`);
    await victim.connect();
    let refused = "";
    await victim.addKey(await generateKeyPair()).catch((e) => refused = String(e));
    assert(refused.includes("--origin"), "the honest server must not accept a claim made under another name");
    victim.close();

    const a = await generateKeyPair(), b = await generateKeyPair();
    const base = `http://127.0.0.1:${s.port}`;
    const flooder = await connect(base, a), target = await connect(base, b);
    const big = JSON.stringify({ type: "send", envelope: await seal(a, await addressOf(b.publicKey), "x.flood", "x".repeat(200_000)) });
    for (let i = 0; i < 20; i++) flooder.socket.send(big);
    /** @type {string[]} */
    const seen = [];
    for (let m = await flooder.next(); m.type !== "error"; m = await flooder.next()) seen.push(m.type);
    await new Promise((r) => setTimeout(r, 100));
    assertEquals(target.socket.readyState, WebSocket.OPEN, "the receiver stays connected");
    assertEquals(flooder.socket.readyState, WebSocket.OPEN);
    flooder.close();
    target.close();
    await new Promise((r) => setTimeout(r, 50));
  } finally {
    middle.close();
    await s.shutdown();
    await Deno.remove(dataDir, { recursive: true });
  }
});

Deno.test("announcements are checked, listed by tag, and show who is online", () =>
  withServer(async (base) => {
    const realm = await generateKeyPair();
    const address = await addressOf(realm.publicKey);
    const manifest = await makeManifest(realm, {
      name: "Maze", tags: ["maze"], files: { "r.js": await hashOf("x") }, main: "r.js", renderer: "r.js", needs: [],
    });
    const posted = await fetch(`${base}/announce`, { method: "POST", body: JSON.stringify(await makeAnnouncement(realm, manifest)) });
    assertEquals(posted.status, 200);
    await posted.body?.cancel();
    const bad = await fetch(`${base}/announce`, { method: "POST", body: JSON.stringify({ ...manifest, kind: "announce" }) });
    assertEquals(bad.status, 400);
    await bad.body?.cancel();

    let list = await (await fetch(`${base}/announce?tag=maze`)).json();
    assertEquals(list.realms.length, 1);
    assertEquals(list.realms[0].online, false);
    const referee = await connect(base, realm);
    list = await (await fetch(`${base}/announce?tag=maze`)).json();
    assertEquals(list.realms[0].online, true);
    assertEquals((await (await fetch(`${base}/announce?tag=other`)).json()).realms.length, 0);
    const one = await (await fetch(`${base}/announce/${address}`)).json();
    assertEquals(one.announcement.from, address);
    referee.close();
  }));

Deno.test("the relay delivers signed messages and refuses to send as someone else", () =>
  withServer(async (base) => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const c = await generateKeyPair();
    const alice = await connect(base, a);
    const bob = await connect(base, b);
    const env = await seal(a, await addressOf(b.publicKey), "hello", { n: 1 });
    alice.socket.send(JSON.stringify({ type: "send", envelope: env }));
    const got = await bob.next();
    assertEquals(got.type, "deliver");
    assertEquals(got.envelope.body, { n: 1 });

    const forged = await seal(c, await addressOf(b.publicKey), "hello", {});
    alice.socket.send(JSON.stringify({ type: "send", envelope: forged }));
    assertEquals((await alice.next()).type, "error");

    const nobody = await seal(a, await addressOf(c.publicKey), "hello", {});
    alice.socket.send(JSON.stringify({ type: "send", envelope: nobody }));
    assertEquals((await alice.next()).type, "undeliverable");
    alice.close();
    bob.close();
    await new Promise((r) => setTimeout(r, 50));
  }));

Deno.test("a claim signed for another server is refused", () =>
  withServer(async (base) => {
    const keys = await generateKeyPair();
    const address = await addressOf(keys.publicKey);
    const socket = new WebSocket(base.replace("http", "ws") + "/ws");
    /** @type {string[]} */
    const replies = [];
    const done = new Promise((resolve) => {
      socket.onmessage = async (e) => {
        const m = JSON.parse(e.data);
        replies.push(m.type);
        if (m.type === "welcome") socket.send(JSON.stringify({ type: "claim", address }));
        if (m.type === "challenge") {
          const sig = await sign(keys.privateKey, "claim", `other.example:443\n${m.nonce}`);
          socket.send(JSON.stringify({ type: "prove", address, sig }));
        }
        if (m.type === "error" || m.type === "claimed") resolve(undefined);
      };
    });
    await done;
    assertEquals(replies.at(-1), "error");
    socket.close();
    await new Promise((r) => setTimeout(r, 50));
  }));

Deno.test("the server serves the app page", () =>
  withServer(async (base) => {
    const page = await fetch(`${base}/`);
    assert((await page.text()).includes("Endless Mind"));
    const hidden = await fetch(`${base}/../deno.json`);
    assert(hidden.status === 404 || !(await hidden.text()).includes("tasks"));
    // A path that is itself a whole file address must not escape the app folder.
    const outside = await fetch(`${base}/${new URL("../deno.json", import.meta.url).href}`);
    assertEquals(outside.status, 404);
    await outside.body?.cancel();
  }));

Deno.test("the most recent claim of an address wins, and an address can be released", () =>
  withServer(async (base) => {
    const realm = await generateKeyPair();
    const address = await addressOf(realm.publicKey);
    const visitor = await connect(base, await generateKeyPair().then((k) => (visitorKeys = k)));
    const first = await connect(base, realm);
    const second = await connect(base, realm);
    assertEquals(await first.next(), { type: "replaced", address });
    first.socket.send(JSON.stringify({type:"send",envelope:await seal(realm, await addressOf(visitorKeys.publicKey), "hello", {})}));
    assertEquals((await first.next()).type, "error", "a replaced connection must lose permission to send");

    visitor.socket.send(JSON.stringify({ type: "send", envelope: await seal(visitorKeys, address, "hello", {}) }));
    assertEquals((await second.next()).type, "deliver");

    first.close(); // the replaced holder leaving must not take the address offline
    await new Promise((r) => setTimeout(r, 50));
    visitor.socket.send(JSON.stringify({ type: "send", envelope: await seal(visitorKeys, address, "hello", {}) }));
    assertEquals((await second.next()).type, "deliver");

    second.socket.send(JSON.stringify({ type: "release", address }));
    visitor.socket.send(JSON.stringify({ type: "send", envelope: await seal(visitorKeys, address, "hello", {}) }));
    assertEquals((await visitor.next()).type, "undeliverable");
    visitor.close();
    second.close();
    await new Promise((r) => setTimeout(r, 50));
  }));

/** @type {CryptoKeyPair} */
let visitorKeys;

Deno.test("uploads over the size limit are refused", () =>
  withServer(async (base) => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    const reply = await fetch(`${base}/blob/${await hashOf(big)}`, { method: "PUT", body: big });
    assertEquals(reply.status, 413);
    await reply.body?.cancel();
  }));

Deno.test("server file quota is cumulative, deduplicated, and available to another app origin", async () => {
  const dataDir = await Deno.makeTempDir();
  const server = await startServer({port:0,hostname:"127.0.0.1",dataDir,maxStoredBytes:4});
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const hash = await hashOf("1234");
    await announceFiles(base, { a: hash, b: await hashOf("5") });
    for (let i = 0; i < 2; i++) {
      const reply = await fetch(`${base}/blob/${hash}`, {method:"PUT",body:"1234",headers:{origin:"https://another-app.example"}});
      assertEquals(reply.status, 200);
      assertEquals(reply.headers.get("access-control-allow-origin"), "*");
      await reply.body?.cancel();
    }
    const full = await fetch(`${base}/blob/${await hashOf("5")}`, {method:"PUT",body:"5"});
    assertEquals(full.status, 507); await full.body?.cancel();
    const preflight = await fetch(`${base}/blob/${hash}`, {method:"OPTIONS"});
    assertEquals(preflight.status, 204);
    assert(preflight.headers.get("access-control-allow-methods")?.includes("PUT"));
  } finally { await server.shutdown(); await Deno.remove(dataDir,{recursive:true}); }
});
