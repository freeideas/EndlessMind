// Finding realms: recommendations and their proof, what servers keep of them,
// the operator's picks, and doors between realms with the travel notes they carry.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { startHost } from "../host/host.js";
import { startServer } from "../server/server.js";
import { checkAnnouncement, releaseOf } from "../shared/announce.js";
import { checkClaim, makeClaim } from "../shared/claim.js";
import { addressOf, generateKeyPair } from "../shared/crypto.js";
import { makeLink, parseLink } from "../shared/link.js";
import { checkRecommendation, makeRecommendation } from "../shared/recommend.js";
import { visit } from "../shared/visitor.js";

/** @param {(base: string, dir: string) => Promise<void>} body @param {Record<string, unknown>} [options] */
async function withServer(body, options = {}) {
  const dir = await Deno.makeTempDir();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir: `${dir}/data`, ...options });
  try {
    await body(`http://127.0.0.1:${s.port}`, dir);
  } finally {
    await s.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
}

/** @param {string} base @param {unknown} record */
const post = (base, record) => fetch(`${base}/recommend`, { method: "POST", body: JSON.stringify(record) }).then(async (r) => (await r.body?.cancel(), r.status));
/** @param {string} base @param {string} query */
const list = async (base, query) => (await (await fetch(`${base}/recommend?${query}`)).json()).recommendations;

Deno.test("a realm link names a realm and its servers, and is made the same way", async () => {
  const address = await addressOf((await generateKeyPair()).publicKey);
  const link = makeLink(address, ["http://localhost:8000", "https://b.example"]);
  assertEquals(parseLink(link), { address, servers: ["http://localhost:8000", "https://b.example"] });
  assertEquals(parseLink(`https://portal.example/#${link}`).servers, ["http://localhost:8000", "https://b.example"]);
  assertThrows(() => parseLink(`emind:not-an-address?via=a.example`));
  assertThrows(() => parseLink(makeLink(address, Array.from({ length: 9 }, (_, i) => `https://s${i}.example`))));
});

Deno.test("a recommendation proves who said it, and carries only true proof of playing", async () => {
  const author = await generateKeyPair(), realm = await generateKeyPair(), other = await generateKeyPair();
  const [a, r] = [await addressOf(author.publicKey), await addressOf(realm.publicKey)];
  const claim = await makeRecommendation(author, r, { note: "Lovely lanterns", via: ["https://a.example"] });
  const played = await makeClaim(realm, a, "entered");
  const forged = await makeClaim(other, a, "entered");
  const checked = await checkRecommendation({ claim, proof: [played, forged] });
  assert(checked);
  assertEquals([checked.author, checked.subject, checked.kind, checked.note, checked.via], [a, r, "recommend", "Lovely lanterns", ["https://a.example"]]);
  assertEquals(checked.proof.map((p) => p.issuer), [r], "only the realm's own word about the author is proof");
  // Standing: what other realms said of the author. A claim about someone else is left out.
  const elsewhere = await makeClaim(other, a, { standing: "good" }, 30 * 24 * 60 * 60 * 1000);
  const notAboutThem = await makeClaim(other, r, "something");
  const withStanding = await checkRecommendation({ claim, standing: [elsewhere, notAboutThem] });
  assertEquals(withStanding?.standing.map((c) => c.issuer), [await addressOf(other.publicKey)]);
  assertEquals(withStanding?.record.standing?.length, 1);
  assertEquals((await checkRecommendation({ claim: await makeRecommendation(author, r, "not for me") }))?.kind, "notForMe");
  assertEquals(await checkRecommendation({ claim: await makeClaim(author, r, "just a claim") }), null);
  // One that would last far longer than a recommendation may is refused.
  assertEquals(await checkRecommendation({ claim: await makeClaim(author, r, { recommend: {} }, 365 * 24 * 60 * 60 * 1000) }), null);
});

Deno.test("servers keep the newest recommendation from each author, and list them by author or subject", () =>
  withServer(async (base) => {
    const author = await generateKeyPair(), realm = await generateKeyPair();
    const [a, r] = [await addressOf(author.publicKey), await addressOf(realm.publicKey)];
    const first = await makeRecommendation(author, r, { note: "good" });
    await new Promise((done) => setTimeout(done, 5));
    const second = await makeRecommendation(author, r, "withdrawn");
    assertEquals(await post(base, { claim: second }), 200);
    assertEquals(await post(base, { claim: first }), 409, "an older one cannot replace a newer");
    assertEquals(await post(base, { claim: await makeClaim(author, r, "not a recommendation") }), 400);
    assertEquals((await list(base, `author=${a}`)).length, 1);
    const [kept] = await list(base, `subject=${r}`);
    assertEquals((await checkRecommendation(kept))?.kind, "withdrawn");
    assertEquals((await list(base, `subject=${a}`)).length, 0);
  }));

Deno.test("an author may keep only so many recommendations on one server", () =>
  withServer(async (base) => {
    const author = await generateKeyPair();
    for (let i = 0; i < 64; i++) {
      assertEquals(await post(base, { claim: await makeRecommendation(author, await addressOf((await generateKeyPair()).publicKey), {}) }), 200);
    }
    assertEquals(await post(base, { claim: await makeRecommendation(author, await addressOf((await generateKeyPair()).publicKey), {}) }), 507);
  }));

Deno.test("a server's operator can pick realms", async () => {
  const dir = await Deno.makeTempDir();
  const picked = await addressOf((await generateKeyPair()).publicKey);
  await Deno.writeTextFile(`${dir}/picks.json`, JSON.stringify({
    note: "Our favorites",
    picks: [{ link: makeLink(picked, ["https://far.example"]), note: "Try the caves" }, { link: "not a link" }],
  }));
  await withServer(async (base) => {
    const reply = await (await fetch(`${base}/picks`)).json();
    assertEquals(reply, { note: "Our favorites", picks: [{ link: makeLink(picked, ["https://far.example"]), note: "Try the caves" }] });
  }, { picksFile: `${dir}/picks.json` });
  await Deno.remove(dir, { recursive: true });
});

/** A realm whose rules open a door, say a door is near, and recommend, when asked; its view shows any travel notes. */
const DOOR_RULES = `
const DOOR = "__DOOR__";
let go, near, recommend;
export default {
  init(o) { ({ go, near, recommend } = o); return { notes: {} }; },
  enter(s, who, character, claims) {
    s.notes[who] = claims.filter((c) => c.says?.travel).map((c) => ({ issuer: c.issuer, travel: c.says.travel }));
    return true;
  },
  act(s, who, a) {
    if (a.go) go(who, DOOR, { seeds: 7 });
    if (a.near) near(who, DOOR);
    if (a.recommend) recommend(DOOR, "a fine hall");
  },
  view(s, who) { return { notes: s.notes[who] ?? [] }; },
};`;

/** @param {string} dir @param {string} name @param {string} door */
async function doorRealm(dir, name, door) {
  const folder = `${dir}/${name}`;
  await Deno.mkdir(folder, { recursive: true });
  await Deno.writeTextFile(`${folder}/realm.json`, JSON.stringify({ name, main: "rules.js", renderer: "rules.js" }));
  await Deno.writeTextFile(`${folder}/rules.js`, DOOR_RULES.replace("__DOOR__", door));
  return folder;
}

/** @param {string} base @param {string} realm @param {CryptoKeyPair} keys @param {unknown[]} [shown] */
async function walkIn(base, realm, keys, shown) {
  const announcement = (await (await fetch(`${base}/announce/${realm}`)).json()).announcement;
  /** @type {any[]} */
  const views = [];
  /** @type {any[]} */
  const doors = [];
  /** @type {string[]} */
  const nears = [];
  const session = await visit({
    server: base, address: /** @type {any} */ (await checkAnnouncement(announcement)).referee, keys,
    release: await releaseOf(announcement.body.manifest), character: { name: "Walker" }, shown,
    onView: (v) => views.push(v), status: () => {}, onGo: (d) => doors.push(d), onNear: (l) => nears.push(l),
  });
  /** @param {() => any} test @returns {Promise<any>} */
  const until = async (test) => {
    for (let i = 0; i < 100; i++) {
      const found = test();
      if (found) return found;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("it did not happen");
  };
  return { session, views, doors, nears, until };
}

Deno.test("a door sends an actor on with a travel note, which the next realm can read", () =>
  withServer(async (base, dir) => {
    const quiet = { log: () => {} };
    const nowhere = makeLink(await addressOf((await generateKeyPair()).publicKey), [base]);
    const hall = await startHost({ ...quiet, server: base, realmDir: await doorRealm(dir, "hall", nowhere), keysFile: `${dir}/hall.json` });
    const doorToHall = makeLink(hall.address, [base]);
    const yard = await startHost({ ...quiet, server: base, realmDir: await doorRealm(dir, "yard", doorToHall), keysFile: `${dir}/yard.json` });
    const keys = await generateKeyPair(), me = await addressOf(keys.publicKey);
    try {
      const inYard = await walkIn(base, yard.address, keys);
      await inYard.until(() => inYard.views.length);
      inYard.session.act({ near: true });
      await inYard.until(() => inYard.nears.length);
      assertEquals(inYard.nears[0], doorToHall);
      inYard.session.act({ recommend: true });
      inYard.session.act({ go: true });
      await inYard.until(() => inYard.doors.length);
      const { link, ticket } = inYard.doors[0];
      assertEquals(link, doorToHall);
      const note = await checkClaim(ticket);
      assertEquals([note?.issuer, note?.about, note?.says], [yard.address, me, { travel: { to: hall.address, carry: { seeds: 7 } } }]);
      inYard.session.stop();

      // The realm's own recommendation of the hall, posted to its server.
      const [rec] = await list(base, `author=${yard.address}`);
      const checked = await checkRecommendation(rec);
      assertEquals([checked?.subject, checked?.note, checked?.via], [hall.address, "a fine hall", [base]]);

      // The hall is shown the note, and its rules see where the actor came from and what they carry.
      const inHall = await walkIn(base, hall.address, keys, [{ claim: ticket }]);
      const view = await inHall.until(() => inHall.views.find((v) => v.notes.length));
      assertEquals(view.notes, [{ issuer: yard.address, travel: { to: hall.address, carry: { seeds: 7 } } }]);
      inHall.session.stop();

      // A note for the hall counts nowhere else: the yard is not shown it.
      const backInYard = await walkIn(base, yard.address, keys, [{ claim: ticket }]);
      await backInYard.until(() => backInYard.views.length);
      assertEquals(backInYard.views.at(-1).notes, []);
      backInYard.session.stop();
    } finally {
      hall.stop();
      yard.stop();
    }
  }));
