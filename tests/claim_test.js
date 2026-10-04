// Signed claims: a realm signs what a player did there, the player keeps
// it, and shows it to another realm that trusts the first.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { startHost } from "../host/host.js";
import { startServer } from "../server/server.js";
import { checkAnnouncement, releaseOf } from "../shared/announce.js";
import { addressOf, generateKeyPair } from "../shared/crypto.js";
import { checkBoth, checkClaim, checkShown, countersign, makeClaim, showClaim } from "../shared/claim.js";
import { visit } from "../shared/visitor.js";

const GUILD = `
let claim, remove;
export default {
  init(o) { ({ claim, remove } = o); return { kicks: [] }; },
  enter(s, p) {
    claim(p, "entered the guild hall");            // something that happened: it lasts
    claim(p, { standing: "good" }, 30);            // how things stand: renewed while it holds
    return true;
  },
  async act(s, p, a) {
    if (a.sword) claim(p, "pulled the sword from the stone");
    if (a.rude) {
      s.kicks.push(await claim(p, { kicked: "for rudeness" }));  // the realm keeps its own signed note
      remove(p, "Kicked for rudeness.");
    }
  },
  seen(s, p, both) { (s.both ??= []).push(both); },   // the player signed it too
  view(s) { return { kicks: s.kicks, both: s.both ?? [] }; },
};`;

const club = (/** @type {string} */ guild) => `
export default {
  init() { return {}; },
  enter(s, p, character, claims) {
    const good = claims.some((e) => e.issuer === "${guild}" && e.says?.standing === "good");
    if (!good) return "Members of the guild only.";
    s[p] = claims.map((e) => e.says);
    return true;
  },
  view(s, p) { return { shown: s[p] }; },
};`;

/** @param {string} dir @param {string} name @param {string} rules @param {object} [more] */
async function realmFolder(dir, name, rules, more = {}) {
  await Deno.mkdir(`${dir}/${name}`);
  await Deno.writeTextFile(`${dir}/${name}/realm.json`, JSON.stringify({ name, main: "rules.js", renderer: "renderer.js", privateRules: true, ...more }));
  await Deno.writeTextFile(`${dir}/${name}/rules.js`, rules);
  await Deno.writeTextFile(`${dir}/${name}/renderer.js`, "export default {start(){}}");
  return `${dir}/${name}`;
}

/** @param {() => unknown} test */
async function until(test) {
  for (let i = 0; i < 100 && !test(); i++) await new Promise((r) => setTimeout(r, 50));
  assert(test(), "timed out");
}

Deno.test("claims are signed by a realm, kept by the player, and shown to another realm with proof", async () => {
  const dir = await Deno.makeTempDir();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir: `${dir}/data` });
  const base = `http://127.0.0.1:${s.port}`;
  /** @param {string} realm */
  const lookUp = async (realm) => {
    const found = await checkAnnouncement((await (await fetch(`${base}/announce/${realm}`)).json()).announcement);
    assert(found);
    return { referee: found.referee, release: await releaseOf(/** @type {any} */ (found.announcement.body).manifest), asks: found.manifest.asks };
  };
  try {
    const guild = await startHost({ server: base, realmDir: await realmFolder(dir, "guild", GUILD), keysFile: `${dir}/guild.json`, log: () => {} });
    const clubHost = await startHost({
      server: base, keysFile: `${dir}/club.json`, log: () => {},
      realmDir: await realmFolder(dir, "club", club(guild.address), { asks: [guild.address] }),
    });
    const guildAt = await lookUp(guild.address), clubAt = await lookUp(clubHost.address);
    assertEquals(clubAt.asks, [guild.address], "the manifest says whose claims the realm would like to see");

    // The player has a different key in each realm.
    const inGuild = await generateKeyPair(), inClub = await generateKeyPair();
    const meInGuild = await addressOf(inGuild.publicKey), meInClub = await addressOf(inClub.publicKey);
    /** @type {any[]} */
    const record = [];
    /** @type {any[]} */
    const guildViews = [];
    /** @type {string[]} */
    const statuses = [];
    const visitGuild = await visit({
      server: base, address: guildAt.referee, keys: inGuild, release: guildAt.release, character: {},
      onView: (v) => guildViews.push(v), status: (t) => statuses.push(t), patienceMs: 900,
      onClaim: (signed) => {
        record.push(signed);
        return true; // kept, so it is signed in return
      },
    });
    await until(() => record.length >= 2);
    visitGuild.act({ sword: true });
    await until(() => record.length >= 3);
    const checked = await Promise.all(record.map((signed) => checkClaim(signed)));
    assertEquals(checked.map((e) => [e?.issuer, e?.about, e?.says, Boolean(e?.expires)]), [
      [guild.address, meInGuild, "entered the guild hall", false],
      [guild.address, meInGuild, { standing: "good" }, true],
      [guild.address, meInGuild, "pulled the sword from the stone", false],
    ]);

    // The guild now holds each claim with the player's signature beside its own.
    await until(() => guildViews.at(-1)?.both.length === 3);
    const both = await Promise.all(guildViews.at(-1).both.map((/** @type {unknown} */ b) => checkBoth(b)));
    assertEquals(both.map((c) => c?.about), [meInGuild, meInGuild, meInGuild]);

    // Shown with proof, the club lets the player in and its rules see what was shown.
    const audience = `${clubHost.address}\n${meInClub}`;
    const shown = await Promise.all(record.map((signed) => showClaim(inGuild, signed, audience)));
    /** @param {CryptoKeyPair} keys @param {unknown[]} [show] */
    const tryClub = async (keys, show) => {
      /** @type {any[]} */
      const views = [];
      /** @type {string[]} */
      const said = [];
      const v = await visit({
        server: base, address: clubAt.referee, keys, release: clubAt.release, character: {}, shown: show,
        onView: (view) => views.push(view), status: (t) => said.push(t),
      });
      await until(() => views.length || said.some((t) => t.includes("refused")));
      v.stop();
      return views[0] ?? said.find((t) => t.includes("refused"));
    };
    // Showing one twice does not make it count twice.
    assertEquals((await tryClub(inClub, [...shown, shown[0]])).shown, ["entered the guild hall", { standing: "good" }, "pulled the sword from the stone"]);
    assert(String(await tryClub(await generateKeyPair())).includes("Members of the guild only"), "nothing shown, not let in");

    // Someone else cannot use the player's claims: not as they are, and not with a proof of their own.
    const thief = await generateKeyPair(), thiefInClub = await addressOf(thief.publicKey);
    assert(String(await tryClub(thief, shown)).includes("Members"), "a proof made for another visitor was accepted");
    const forged = await Promise.all(record.map((signed) => showClaim(thief, signed, `${clubHost.address}\n${thiefInClub}`)));
    assert(String(await tryClub(thief, forged)).includes("Members"), "a proof by the wrong key was accepted");
    assertEquals(await checkShown(shown[0], `${guild.address}\n${meInClub}`), null, "a proof names the one realm it is shown to");

    // Kicked out: the realm keeps its own signed note of it. The player is gone before it could be handed over.
    visitGuild.act({ rude: true });
    await until(() => statuses.some((t) => t.includes("Kicked for rudeness")));
    const other = await visit({
      server: base, address: guildAt.referee, keys: await generateKeyPair(), release: guildAt.release, character: {},
      onView: (v) => guildViews.push(v), status: () => {},
    });
    await until(() => guildViews.at(-1)?.kicks.length === 1);
    const kick = await checkClaim(guildViews.at(-1).kicks[0]);
    assertEquals([kick?.issuer, kick?.about, kick?.says], [guild.address, meInGuild, { kicked: "for rudeness" }]);
    assertEquals(record.length, 3, "the kicked player was not handed the note");
    other.stop();
    guild.stop();
    clubHost.stop();
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    await s.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a claim lost on the way is sent again in the next session, until the visitor has it", async () => {
  const { referee } = await import("../shared/referee.js");
  class TestRelay extends EventTarget {
    /** @type {any[]} */ sent = [];
    async addKey() {}
    release() {}
    /** @param {unknown} _keys @param {string} to @param {string} kind @param {unknown} body */
    async send(_keys, to, kind, body) { this.sent.push({ to, kind, body: JSON.parse(JSON.stringify(body)) }); }
  }
  const relay = new TestRelay();
  /** @type {(views: Record<string, unknown>) => void} */
  let views = () => {};
  /** @type {(player: string, says: unknown, days?: number) => Promise<unknown>} */
  let record = () => Promise.resolve(null);
  const keys = await generateKeyPair(), playerKeys = await generateKeyPair(), player = await addressOf(playerKeys.publicKey);
  /** @type {any[]} */
  const agreed = [];
  const ref = await referee({
    address: "realm", keys, name: "Test", release: "release", relay: /** @type {any} */ (relay),
    announce: async () => {}, status: () => {},
    rules: {
      ticksPerSecond: 1, enter: () => Promise.resolve({ ok: true }), act() {}, leave() {}, step() {}, onRemove() {}, stop() {},
      onViews(fn) { views = fn; },
      onClaim(fn) { record = fn; },
      seen: (who, both) => void agreed.push([who, both]),
    },
  });
  const message = (/** @type {string} */ kind, /** @type {unknown} */ body) =>
    relay.dispatchEvent(new CustomEvent("message", { detail: { from: player, to: "realm", kind, body } }));
  const turn = () => new Promise((r) => setTimeout(r, 20));
  const states = () => relay.sent.filter((m) => m.kind === "emind.state");
  try {
    message("emind.enter", { request: "a".repeat(26), release: "release" });
    await turn();
    const signed = /** @type {any} */ (await record(player, "won"));
    views({});
    views({});
    assertEquals(states().map((m) => m.body.claims?.length), [1], "sent once in a session, even with no view to send");
    // The visitor never got it and starts over: the new session is sent it again.
    message("emind.enter", { request: "b".repeat(26), release: "release" });
    await turn();
    views({});
    assertEquals(states().length, 2);
    // Once the visitor has signed it in return, it is not sent again, and the rules hold a claim signed by both.
    const session = relay.sent.filter((m) => m.kind === "emind.welcome").at(-1).body.session;
    message("emind.ping", { session, seen: [{ sig: signed.sig, seen: "ed25519-" + "a".repeat(103) }] });
    await turn();
    assertEquals(agreed, [], "a second signature that does not check is not taken");
    const seen = await countersign(playerKeys, signed);
    message("emind.ping", { session, seen: [{ sig: signed.sig, seen }] });
    await turn();
    assertEquals(agreed.map(([who]) => who), [player]);
    assertEquals((await checkBoth(agreed[0][1]))?.says, "won");
    assertEquals(await checkBoth({ claim: signed, seen: await countersign(keys, signed) }), null, "only the one it is about can sign it in return");
    message("emind.enter", { request: "c".repeat(26), release: "release" });
    await turn();
    views({});
    assertEquals(states().length, 2);
  } finally {
    ref.stop();
  }
});

Deno.test("a claim cannot be altered, outlive its date, or say too much", async () => {
  const realm = await generateKeyPair(), player = await addressOf((await generateKeyPair()).publicKey);
  const signed = await makeClaim(realm, player, { award: "spring champion" }, 1000);
  assert(await checkClaim(signed));
  assertEquals(await checkClaim({ ...signed, body: { .../** @type {any} */ (signed.body), says: { award: "everything" } } }), null);
  assertEquals(await checkClaim({ ...signed, to: await addressOf(realm.publicKey) }), null);
  assertEquals(await checkClaim(await makeClaim(realm, player, "old news", -1000)), null);
  let refused = false;
  await Promise.resolve().then(() => makeClaim(realm, player, "x".repeat(2000))).catch(() => refused = true);
  assert(refused);
  // Extra fields an issuer adds are signed too, but the whole must stay small.
  const { seal } = await import("../shared/envelope.js");
  assertEquals(await checkClaim(await seal(realm, player, "emind.claim", { says: "x", padding: "y".repeat(5000) })), null);
});

Deno.test("who a visitor is, and what they show, is locked on the way in; an old key is corrected", async () => {
  const { newExchangeKey } = await import("../shared/crypto.js");
  const dir = await Deno.makeTempDir();
  // The referee reaches the server through a tap that keeps a copy of all the server sends it,
  // which is everything a relay passes on to a referee.
  let seen = "", port = 0;
  const tap = Deno.listen({ port: 0, hostname: "127.0.0.1" });
  const tapped = `http://127.0.0.1:${/** @type {Deno.NetAddr} */ (tap.addr).port}`;
  (async () => {
    for await (const c of tap) {
      const up = await Deno.connect({ port, hostname: "127.0.0.1" });
      c.readable.pipeTo(up.writable).catch(() => {});
      const [a, b] = up.readable.tee();
      a.pipeTo(c.writable).catch(() => {});
      (async () => { for await (const chunk of b) seen += new TextDecoder().decode(chunk); })().catch(() => {});
    }
  })();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir: `${dir}/data`, origins: [tapped, "http://127.0.0.1:0"] });
  port = s.port;
  const base = `http://127.0.0.1:${s.port}`;
  try {
    const rules = `export default { init() { return {}; }, enter(s, p, c) { s[p] = c.name; return true; }, view(s, p) { return { name: s[p] }; } };`;
    const host = await startHost({ server: tapped, realmDir: await realmFolder(dir, "named", rules), keysFile: `${dir}/named.json`, log: () => {} });
    const found = await checkAnnouncement((await (await fetch(`${base}/announce/${host.address}`)).json()).announcement);
    assert(found);
    const key = /** @type {any} */ (found.announcement.body).key;
    assert(typeof key === "string", "the announcement names the referee's exchange key");
    const stale = (await newExchangeKey())?.publicText;
    for (const [enterKey, name] of [[key, "Secret Otter"], [stale, "Hidden Heron"]]) {
      /** @type {any[]} */
      const views = [];
      const v = await visit({
        server: tapped, address: found.referee, keys: await generateKeyPair(), release: await releaseOf(/** @type {any} */ (found.announcement.body).manifest),
        character: { name }, enterKey, onView: (view) => views.push(view), status: () => {},
      });
      await until(() => views.length);
      assertEquals(views[0].name, name);
      v.stop();
    }
    assert(seen.includes("emind.enter"), "the tap saw no entry requests at all");
    assert(!seen.includes("Otter") && !seen.includes("Heron"), "a character crossed the relay in the clear");
    host.stop();
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    tap.close();
    await s.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});
