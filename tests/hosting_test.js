// A host: one web server keeps a resident game, relays for games elsewhere, and serves an EntryPortal.

import assert from "node:assert/strict";
import { join } from "node:path";
import { runHost } from "../host/hosting.js";
import { runGame } from "../host/host.js";
import { relayedBase } from "../host/relay.js";

let nextPort = 19500 + Math.floor(Math.random() * 400);

/** A host on this computer. Names under `localhost` all lead here. @param {Partial<Parameters<typeof runHost>[0]>} [options] */
async function hosting(options = {}) {
  const port = nextPort++;
  const temp = await Deno.makeTempDir();
  /** @type {string[]} */
  const said = [];
  const host = await runHost({ base: `http://localhost:${port}/`, port, game: "examples/maze", data: join(temp, "host"), store: join(temp, "store"), log: (text) => said.push(text), ...options });
  return {
    host,
    said,
    port,
    temp,
    /** An address at a name under the host's. @param {string} name @param {string} [path] */
    at: (name, path = "") => `http://${name ? name + "." : ""}localhost:${port}/${path}`,
    async stop() {
      await host.stop();
      await Deno.remove(temp, { recursive: true });
    },
  };
}

/** @param {string} address @param {RequestInit} [how] */
const status = (address, how) => fetch(address, how).then((answer) => (answer.body?.cancel(), answer.status));

Deno.test("a host keeps its game at the main address, the EntryPortal at a name of its own, and relays", async () => {
  const here = await hosting();
  const home = await runGame({ folder: "examples/monster", port: nextPort++, relay: here.host.base, data: join(here.temp, "home"), log() {} });
  try {
    // The resident game.
    assert.match(await (await fetch(here.at(""))).text(), /Endless Maze/);
    const card = await (await fetch(here.at("", "endlessmind-card.json"))).json();
    assert.deepEqual(card.play, [here.host.base]);
    assert.equal(card.signers[0], here.host.realm?.id);

    // The EntryPortal, exactly as published, and never inside another page.
    assert.equal(here.host.entryPortal, here.at("eportal"));
    const portal = await fetch(here.at("eportal"));
    assert.equal(await portal.text(), await Deno.readTextFile("portal/index.html"));
    assert.equal(portal.headers.get("x-frame-options"), "DENY");
    assert.match(portal.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    const newest = (await Deno.readTextFile("portal/index.html")).match(/v[0-9.]+\//)?.[0] ?? "";
    assert.equal(await (await fetch(here.at("eportal", newest))).text(), await Deno.readTextFile(`portal/${newest}index.html`));
    assert.equal(await (await fetch(here.at("eportal", newest + "SHA256SUMS"))).text(), await Deno.readTextFile(`portal/${newest}SHA256SUMS`));

    // A game on another computer, at a name of its own.
    assert.equal(home.base, relayedBase(here.host.base, home.realm.id));
    assert.deepEqual(here.host.games(), [home.realm.id]);
    assert.match(await (await fetch(home.base)).text(), /Endless Maze|Monster Maze/);
    assert.deepEqual((await (await fetch(home.base + "endlessmind-card.json")).json()).name, "Monster Maze");

    // The web server in front asks which names are this host's, before getting certificates for them.
    const known = (/** @type {string} */ name) => status(`http://127.0.0.1:${here.port}/endlessmind/known?domain=${name}`);
    assert.equal(await known("localhost"), 200);
    assert.equal(await known("eportal.localhost"), 200);
    assert.equal(await known(`${home.realm.id}.localhost`), 200);
    assert.equal(await known(`${"a".repeat(52)}.localhost`), 404);
    assert.equal(await known("other.example"), 404);
    assert.equal(await status(`http://127.0.0.1:${here.port}/`), 404);
  } finally {
    await home.stop();
    await here.stop();
  }
});

Deno.test("nothing but the EntryPortal is ever served at its name, and it is served nowhere else", async () => {
  const here = await hosting();
  try {
    // The game's pages, its sign-in and its line do not answer at the EntryPortal's name.
    for (const path of ["maze.js", "endlessmind-card.json", "endlessmind/play.js", "endlessmind/signin.js", "README.md", "v0.64/index.htm", "%2e%2e/host/main.js", "v0.64", "endlessmind/known?domain=localhost"]) {
      assert.equal(await status(here.at("eportal", path)), 404, path);
    }
    assert.equal(await status(here.at("eportal", "endlessmind/start"), { method: "POST" }), 404);
    assert.equal(await status(here.at("eportal"), { method: "POST" }), 404);
    const line = new WebSocket(`ws://eportal.localhost:${here.port}/endlessmind/play?guest=${"a".repeat(32)}`);
    line.onerror = () => {};
    await new Promise((done) => (line.onclose = done));
    const dial = new WebSocket(`ws://eportal.localhost:${here.port}/endlessmind/relay`);
    dial.onerror = () => {};
    await new Promise((done) => (dial.onclose = done));
    assert.deepEqual(here.host.games(), []);

    // The EntryPortal's page is not at the game's address, or at any other name.
    assert.doesNotMatch(await (await fetch(here.at(""))).text(), /EntryPortal \| Endless Mind/);
    assert.equal(await status(here.at("", "v0.64/")), 404);
    assert.equal(await status(here.at("other")), 503);
    assert.equal(await status(here.at("eportal.eportal")), 503);
  } finally {
    await here.stop();
  }
});

Deno.test("a host's relay and EntryPortal can each be switched off, and a host needs no game", async () => {
  const here = await hosting({ relay: false, entryPortal: false, game: undefined });
  try {
    assert.equal(here.host.entryPortal, null);
    assert.equal(here.host.realm, null);
    assert.equal(await status(here.at("eportal")), 404);
    assert.equal(await status(here.at("a".repeat(52))), 404);
    assert.match(await (await fetch(here.at(""))).text(), /An Endless Mind host/);
    const dial = new WebSocket(`ws://localhost:${here.port}/endlessmind/relay`);
    dial.onerror = () => {};
    await new Promise((done) => (dial.onclose = done));
  } finally {
    await here.stop();
  }
  await assert.rejects(() => runHost({ base: "http://localhost:1/games/" }), /site's root/);
});
