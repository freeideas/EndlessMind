// The host program referees realms with no browser anywhere: here both the
// referee and the visitor are plain programs speaking the protocol.

import { assert, assertEquals } from "jsr:@std/assert@1";
import well from "../examples/listening-well/rules.js";
import { startHost, writePass } from "../host/host.js";
import { startServer } from "../server/server.js";
import { checkAnnouncement, releaseOf } from "../shared/announce.js";
import { addressOf, generateKeyPair } from "../shared/crypto.js";
import { visit as connectVisitor } from "../shared/visitor.js";

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
  /** @type {any[]} */
  const views = [];
  const announcement = (await (await fetch(`${base}/announce/${realm}`)).json()).announcement;
  // Visitors talk to whoever referees: the realm's own key, or a key it gave a pass to.
  const referee = (await checkAnnouncement(announcement))?.referee ?? realm;
  const session = await connectVisitor({server:base,address:referee,keys,release:await releaseOf(announcement.body.manifest),
    character:{name:"Tester",color:"red"}, onView:v => views.push(v),status:() => {}});
  return {
    address: await addressOf(keys.publicKey),
    /** @param {unknown} action */
    act: (action) => session.act(action),
    /** @param {(view: any) => boolean} test */
    async until(test) {
      for (let i = 0; i < 100; i++) {
        const found = views.find(test);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("no such view arrived");
    },
    close: session.stop,
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
    assert(!(await serverHolds(dir, "You are the Listening Well")), "the private rules reached the server");

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

/** True if any file the server keeps contains the text. @param {string} dir @param {string} text */
async function serverHolds(dir, text) {
  const paths = [`${dir}/data/announcements.json`];
  for await (const blob of Deno.readDir(`${dir}/data/blobs`)) paths.push(`${dir}/data/blobs/${blob.name}`);
  for (const path of paths) if ((await Deno.readTextFile(path)).includes(text)) return true;
  return false;
}

// Runs only when a key is set, since it calls a real model: OPENROUTER_API_KEY=... deno task test
Deno.test({
  name: "live: an AI model answers through private rules, and neither the key nor the rules leave the host",
  ignore: !Deno.env.get("OPENROUTER_API_KEY"),
  fn: () =>
    withServer(async (base, dir) => {
      const key = /** @type {string} */ (Deno.env.get("OPENROUTER_API_KEY"));
      const fresh = (await import("../examples/listening-well/rules.js?live")).default;
      /** @type {string[]} */
      const lines = [];
      const original = console.error;
      console.error = (...args) => lines.push(args.join(" "));
      try {
        // Host the same folder, but through a module copy whose answer() was not replaced by the test above.
        well.answer = fresh.answer;
        const host = await startHost({ server: base, realmDir: "examples/listening-well", keysFile: `${dir}/keys/well.json`, log: () => {} });
        const visitor = await visit(base, host.address);
        await visitor.until((v) => v.here.includes("Tester"));
        await visitor.act({ ask: "What is at the bottom of the well?" });
        let view;
        for (let i = 0; i < 12 && !view; i++) view = await visitor.until((v) => v.talk[0]?.answer).catch(() => undefined);
        assert(view, "no answer arrived");
        const answer = view.talk[0].answer;
        assert(!answer.includes("No AI model is connected") && !answer.includes("silent"), `not a model's answer: ${answer} ${lines}`);
        assert(!JSON.stringify(view).includes(key), "the key reached a visitor");
        assert(!(await serverHolds(dir, key)), "the key reached the server");
        assert(!(await serverHolds(dir, "You are the Listening Well")), "the private rules reached the server");
        console.log(`    the well answered: ${answer}`);
        visitor.close();
        host.stop();
        await new Promise((r) => setTimeout(r, 50));
      } finally {
        console.error = original;
      }
    }),
});

Deno.test("a realm with public rules can be hosted from its folder, or from its key file alone", () =>
  withServer(async (base, dir) => {
    const keysFile = `${dir}/maze.json`;
    const host = await startHost({ server: base, realmDir: "examples/maze-chase", keysFile, log: () => {} });
    let visitor = await visit(base, host.address);
    assertEquals((await visitor.until((v) => v.actors.length === 1)).actors[0].name, "Tester");
    visitor.close();
    host.stop();
    await new Promise((r) => setTimeout(r, 50));

    // Renaming the realm keeps its address: the key file belongs to the folder, not the name.
    const renamed = `${dir}/renamed`;
    await Deno.mkdir(renamed);
    for (const name of ["rules.js", "renderer.js", "text.js"]) await Deno.copyFile(`examples/maze-chase/${name}`, `${renamed}/${name}`);
    const source = JSON.parse(await Deno.readTextFile("examples/maze-chase/realm.json"));
    await Deno.writeTextFile(`${renamed}/realm.json`, JSON.stringify({ ...source, name: "Lantern Maze Two" }));
    const again = await startHost({ server: base, realmDir: renamed, keysFile, log: () => {} });
    assertEquals(again.address, host.address);
    again.stop();
    await new Promise((r) => setTimeout(r, 50));

    const moved = await startHost({ server: base, keysFile, log: () => {} });
    assertEquals(moved.address, host.address);
    visitor = await visit(base, moved.address);
    await visitor.until((v) => v.actors.length === 1);
    visitor.close();
    moved.stop();
    await new Promise((r) => setTimeout(r, 50));

    // A referee pass: the always-on machine gets a key that may referee for a while, never the realm's own.
    const passFile = `${dir}/pass.json`;
    assertEquals(await writePass({ keysFile }, passFile, 30), host.address);
    const passText = await Deno.readTextFile(passFile);
    const realmSecret = JSON.parse(await Deno.readTextFile(keysFile)).realms[0].secret;
    assert(!passText.includes(realmSecret), "the realm's own key must not be in the pass file");
    const guest = await startHost({ server: base, keysFile: passFile, log: () => {} });
    assertEquals(guest.address, host.address, "the realm keeps its address under a pass");
    visitor = await visit(base, guest.address);
    await visitor.until((v) => v.actors.length === 1);
    visitor.close();
    guest.stop();
    await new Promise((r) => setTimeout(r, 50));

    // A newer pass replaces an older one: a server that has seen the new one refuses the old.
    const newer = `${dir}/pass2.json`;
    await writePass({ keysFile }, newer, 30);
    (await startHost({ server: base, keysFile: newer, log: () => {} })).stop();
    let refused = "";
    await startHost({ server: base, keysFile: passFile, log: () => {} }).then((h) => h.stop(), (e) => refused = String(e));
    assert(refused.includes("older than the one kept"), refused);
    await new Promise((r) => setTimeout(r, 50));
  }));

Deno.test("a realm refereed on two servers survives the loss of one", async () => {
  const dir = await Deno.makeTempDir();
  const a = await startServer({ port: 0, hostname: "127.0.0.1", dataDir: `${dir}/a` });
  const b = await startServer({ port: 0, hostname: "127.0.0.1", dataDir: `${dir}/b` });
  const [baseA, baseB] = [a, b].map((s) => `http://127.0.0.1:${s.port}`);
  let down = false;
  try {
    const host = await startHost({ server: `${baseA},${baseB}`, realmDir: "examples/maze-chase", keysFile: `${dir}/maze.json`, log: () => {} });
    assert(host.link.includes(encodeURIComponent(baseB)), "the link names both servers");
    // Either server alone tells a visitor about the other.
    const found = await checkAnnouncement((await (await fetch(`${baseB}/announce/${host.address}`)).json()).announcement);
    assertEquals(/** @type {any} */ (found?.announcement.body).servers, [baseA, baseB]);

    /** @type {any[]} */
    const views = [];
    const visitor = await connectVisitor({
      servers: [baseA, baseB], address: host.address, keys: await generateKeyPair(), release: await releaseOf(/** @type {any} */ (found?.announcement.body).manifest),
      character: { name: "Tester" }, onView: (v) => views.push(v), status: () => {}, patienceMs: 600,
    });
    const until = async (/** @type {() => boolean} */ test) => {
      for (let i = 0; i < 200 && !test(); i++) await new Promise((r) => setTimeout(r, 50));
      assert(test(), "no view arrived");
    };
    await until(() => views.length > 0);
    await a.shutdown();
    down = true;
    await new Promise((r) => setTimeout(r, 300));
    views.length = 0;
    await until(() => views.length > 0);
    visitor.stop();
    host.stop();
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    if (!down) await a.shutdown();
    await b.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});
