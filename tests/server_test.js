import { assert, assertEquals } from "jsr:@std/assert@1";
import { startServer } from "../server/server.js";
import { makeAnnouncement, makeManifest } from "../shared/announce.js";
import { addressOf, generateKeyPair, hashOf, sign } from "../shared/crypto.js";
import { seal } from "../shared/envelope.js";

/** @param {(base: string) => Promise<void>} body */
async function withServer(body) {
  const dataDir = await Deno.makeTempDir();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir });
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

Deno.test("blobs are stored only under their true hash", () =>
  withServer(async (base) => {
    const data = new TextEncoder().encode("export default {}");
    const hash = await hashOf(data);
    assertEquals((await fetch(`${base}/blob/${hash}`, { method: "PUT", body: data })).status, 200);
    assertEquals(new TextDecoder().decode(await (await fetch(`${base}/blob/${hash}`)).arrayBuffer()), "export default {}");
    const wrong = await fetch(`${base}/blob/${await hashOf("other")}`, { method: "PUT", body: data });
    assertEquals(wrong.status, 400);
    await wrong.body?.cancel();
  }));

Deno.test("announcements are checked, listed by tag, and show who is online", () =>
  withServer(async (base) => {
    const realm = await generateKeyPair();
    const address = await addressOf(realm.publicKey);
    const manifest = await makeManifest(realm, {
      name: "Maze", tags: ["maze"], files: { "r.js": await hashOf("x") }, main: "r.js", renderer: "r.js", play: ["browser"], needs: [],
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
  }));
