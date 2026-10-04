// The host program referees realms with no browser anywhere: here both the
// referee and the visitor are plain programs speaking the protocol.

import { assert, assertEquals } from "jsr:@std/assert@1";
import well from "../examples/listening-well/rules.js";
import { startHost } from "../host/host.js";
import { startServer } from "../server/server.js";
import { checkAnnouncement } from "../shared/announce.js";
import { addressOf, generateKeyPair } from "../shared/crypto.js";
import { Relay } from "../shared/relay.js";

/** @param {(base: string, dir: string) => Promise<void>} body */
async function withServer(body) {
  const dir = await Deno.makeTempDir();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir: `${dir}/data` });
  try {
    await body(`http://127.0.0.1:${s.port}`, dir);
  } finally {
    await s.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
}

/** A visitor with no browser: enter, then collect views. @param {string} base @param {string} realm */
async function visit(base, realm) {
  const keys = await generateKeyPair();
  const relay = new Relay(base.replace("http", "ws") + "/ws");
  await relay.connect();
  await relay.addKey(keys);
  /** @type {any[]} */
  const views = [];
  relay.addEventListener("message", (e) => {
    const env = /** @type {CustomEvent} */ (e).detail;
    if (env.from === realm && env.kind === "emind.state") views.push(env.body.view);
  });
  await relay.send(keys, realm, "emind.enter", { character: { name: "Tester", color: "red" } });
  return {
    address: await addressOf(keys.publicKey),
    /** @param {unknown} action */
    act: (action) => relay.send(keys, realm, "emind.act", { action }),
    /** @param {(view: any) => boolean} test */
    async until(test) {
      for (let i = 0; i < 100; i++) {
        const found = views.find(test);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("no such view arrived");
    },
    close: () => relay.close(),
  };
}

Deno.test("a realm with private rules is refereed by the host and answers visitors' calls", () =>
  withServer(async (base, dir) => {
    well.answer = (question) => Promise.resolve(`the private side heard: ${question}`);
    const options = { server: base, realmDir: "examples/listening-well", keysFile: `${dir}/keys/well.json`, log: () => {} };
    const host = await startHost(options);

    // The rules are not published: no rules file in the manifest, and no such file on the server.
    const found = await checkAnnouncement((await (await fetch(`${base}/announce/${host.address}`)).json()).announcement);
    assert(found);
    assertEquals(found.manifest.main, undefined);
    assertEquals(Object.keys(found.manifest.files), ["renderer.js"]);

    const visitor = await visit(base, host.address);
    await visitor.until((v) => v.here.includes("Tester"));
    await visitor.act({ ask: "is anyone there?" });
    const view = await visitor.until((v) => v.talk[0]?.answer);
    assertEquals(view.talk[0].answer, "the private side heard: is anyone there?");
    visitor.close();
    host.stop();

    // The key file keeps the realm: hosting again gives the same address.
    const again = await startHost(options);
    assertEquals(again.address, host.address);
    again.stop();
    await new Promise((r) => setTimeout(r, 50));
  }));

Deno.test("a realm with public rules can be hosted from its folder, or from its key file alone", () =>
  withServer(async (base, dir) => {
    const keysFile = `${dir}/maze.json`;
    const host = await startHost({ server: base, realmDir: "examples/maze-chase", keysFile, log: () => {} });
    let visitor = await visit(base, host.address);
    assertEquals((await visitor.until((v) => v.players.length === 1)).players[0].name, "Tester");
    visitor.close();
    host.stop();
    await new Promise((r) => setTimeout(r, 50));

    const moved = await startHost({ server: base, keysFile, log: () => {} });
    assertEquals(moved.address, host.address);
    visitor = await visit(base, moved.address);
    await visitor.until((v) => v.players.length === 1);
    visitor.close();
    moved.stop();
    await new Promise((r) => setTimeout(r, 50));
  }));
