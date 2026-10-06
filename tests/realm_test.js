// The realm library: sign-in notes, join codes and their expiry, claiming records, the public list and
// burned IDs. Requests are made directly against realm.handle, with a clock the tests move by hand.

import assert from "node:assert/strict";
import { base64url, hex, masterKey, seedFromWords, signerFromWords, wordsFromEntropy } from "../shared/keys.js";
import { addSignature, isComplete, validSigners } from "../shared/signed.js";
import { memoryStore, openRealm } from "../realm/realm.js";

const BASE = "https://garden.example/";
const PORTAL = "https://portal.example/EntryPortal/v0.1/";
const wordsFor = (/** @type {number} */ n) => wordsFromEntropy(new Uint8Array(32).fill(n));
const player = await signerFromWords(await wordsFor(7));

async function setup() {
  const clock = { now: 1790000000000 };
  const realm = await openRealm({
    base: BASE,
    portal: PORTAL,
    card: { name: "Test Realm", description: "For tests." },
    words: await wordsFor(1),
    store: memoryStore(),
    now: () => clock.now,
  });
  return { realm, clock };
}

/** @param {any} realm @param {string} path @param {RequestInit} [init] */
const call = async (realm, path, init) => /** @type {Response} */ (await realm.handle(new Request(BASE + path, init)));
/** @param {Record<string, string>} fields */
const form = (fields) => ({ method: "POST", body: new URLSearchParams(fields) });

/** @param {string} address @param {number} time @param {Partial<Record<string, unknown>>} [extra] */
async function note(address, time, extra = {}) {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  return addSignature({ v: 1, type: "enter", player: player.id, name: " Moon  Pie", address, time, nonce, portal: PORTAL, ...extra }, player);
}

/** Start a join, send a note for it, and return the code and the response. @param {any} realm @param {number} time */
async function join(realm, time, edit = (/** @type {any} */ n) => n) {
  const code = await (await call(realm, "endlessmind/start", { method: "POST" })).json();
  const signed = edit(await note(code.address, time));
  const answer = await call(realm, `join/${code.code}`, form({ enter: JSON.stringify(signed) }));
  return { code, answer, signed };
}

Deno.test("a sign-in note lets in the screen waiting on its code, once", async () => {
  const { realm, clock } = await setup();
  const { code, answer, signed } = await join(realm, clock.now);
  assert.equal(answer.status, 200);
  assert.match(await answer.text(), /You're in/);
  assert.equal(code.link, PORTAL + "#url=" + encodeURIComponent(code.address));
  assert.match(code.qr, /^<svg/);
  assert.equal(code.typed, `garden.example/join/${code.code}`);

  const stranger = await call(realm, `endlessmind/wait/${code.code}?token=nope`);
  assert.equal((await stranger.json()).state, "unknown");
  const wait = await call(realm, `endlessmind/wait/${code.code}?token=${code.token}`);
  assert.deepEqual(await wait.json(), { state: "in", player: player.id });
  const cookie = /** @type {string} */ (wait.headers.get("set-cookie")).split(";")[0];
  const me = await (await call(realm, "endlessmind/me", { headers: { cookie } })).json();
  assert.equal(me.player, player.id);
  assert.equal(me.playerName, "Moon Pie", "the name from the sign-in note");

  const again = await call(realm, `join/${code.code}`, form({ enter: JSON.stringify(await note(code.address, clock.now)) }));
  assert.equal(again.status, 400, "a code works once");
  const replay = await join(realm, clock.now, () => signed);
  assert.equal(replay.answer.status, 400, "a note for one address is useless at another");
});

Deno.test("join codes expire after two minutes, and notes must be recent", async () => {
  const { realm, clock } = await setup();
  const code = await (await call(realm, "endlessmind/start", { method: "POST" })).json();
  clock.now += 2 * 60 * 1000 + 1;
  const late = await call(realm, `join/${code.code}`, form({ enter: JSON.stringify(await note(code.address, clock.now)) }));
  assert.equal(late.status, 400);
  assert.match(await late.text(), /expired/);
  assert.equal((await (await call(realm, `endlessmind/wait/${code.code}?token=${code.token}`)).json()).state, "expired");

  const old = await join(realm, clock.now - 3 * 60 * 1000);
  assert.match(await old.answer.text(), /time on your device/);
});

Deno.test("notes are refused when tampered with, reused, or made for another realm", async () => {
  const { realm, clock } = await setup();
  const tampered = await join(realm, clock.now, (n) => ({ ...n, player: (/** @type {any} */ (player)).id.replace(/^./, "b") }));
  assert.equal(tampered.answer.status, 400);
  const elsewhere = await join(realm, clock.now, () => null);
  assert.equal(elsewhere.answer.status, 400);

  const first = await join(realm, clock.now);
  assert.equal(first.answer.status, 200);
  const code = await (await call(realm, "endlessmind/start", { method: "POST" })).json();
  const sameNonce = await addSignature({ ...first.signed, address: code.address, sigs: {} }, player);
  const reused = await call(realm, `join/${code.code}`, form({ enter: JSON.stringify(sameNonce) }));
  assert.match(await reused.text(), /already used/);

  const other = await (await call(realm, "endlessmind/start", { method: "POST" })).json();
  const forOther = await note("https://other.example/join/" + other.code, clock.now);
  const wrong = await call(realm, `join/${other.code}`, form({ enter: JSON.stringify(forOther) }));
  assert.match(await wrong.text(), /different address/);
});

/** Sign in and return a cookie for the player. @param {any} realm @param {number} time */
async function signIn(realm, time) {
  const { code } = await join(realm, time);
  const wait = await call(realm, `endlessmind/wait/${code.code}?token=${code.token}`);
  return /** @type {string} */ (wait.headers.get("set-cookie")).split(";")[0];
}

/** Read the #sign= payload from a redirect to the EntryPortal. @param {Response} response */
function signPayload(response) {
  const location = /** @type {string} */ (response.headers.get("location"));
  assert.ok(location.startsWith(PORTAL + "#sign="), location);
  return JSON.parse(decodeURIComponent(location.slice((PORTAL + "#sign=").length)));
}

Deno.test("claiming: the player signs first, choosing public, then the realm signs", async () => {
  const { realm, clock } = await setup();
  const cookie = await signIn(realm, clock.now);
  await realm.offer(player.id, [{ text: "Planted ten seeds.", data: { seeds: 10 } }, { text: "Watered a seed." }]);
  assert.equal((await (await call(realm, "endlessmind/me", { headers: { cookie } })).json()).claims, 2);
  assert.equal((await call(realm, "endlessmind/claim", { method: "POST" })).status, 401, "guests cannot claim");

  const claim = await (await call(realm, "endlessmind/claim", { method: "POST", headers: { cookie } })).json();
  const payload = signPayload(await call(realm, `claim/${claim.code}`));
  assert.equal(payload.return, claim.address);
  assert.equal(payload.records.length, 2);
  assert.deepEqual(payload.records[0].signers, [realm.id, player.id]);
  assert.equal(payload.records[0].sigs, undefined, "proposals carry no proof yet");

  const mine = await addSignature({ ...payload.records[0], public: true }, player);
  const changed = await addSignature({ ...payload.records[1], text: "Watered a hundred seeds." }, player);
  const back = await call(realm, `claim/${claim.code}`, form({ records: JSON.stringify([mine, changed]) }));
  const done = signPayload(back);
  assert.equal(done.return, undefined);
  assert.equal(done.records.length, 1, "a changed text is refused");
  assert.ok(await isComplete(done.records[0]));
  assert.deepEqual((await validSigners(done.records[0])).sort(), [realm.id, player.id].sort());

  const list = await (await call(realm, "endlessmind-list.json")).json();
  assert.equal(list.realm, realm.id);
  assert.deepEqual(list.records, done.records);
  const wait = await (await call(realm, `endlessmind/wait/${claim.code}?token=${claim.token}`)).json();
  assert.deepEqual(wait, { state: "claimed", count: 1 });
  assert.equal((await (await call(realm, "endlessmind/me", { headers: { cookie } })).json()).claims, 0);
  assert.equal((await call(realm, `claim/${claim.code}`)).status, 410, "a claim code works once");
});

Deno.test("private records are signed but not published", async () => {
  const { realm, clock } = await setup();
  const cookie = await signIn(realm, clock.now);
  await realm.offer(player.id, [{ text: "Found the quiet pond." }]);
  const claim = await (await call(realm, "endlessmind/claim", { method: "POST", headers: { cookie } })).json();
  const [proposal] = signPayload(await call(realm, `claim/${claim.code}`)).records;
  const signed = await addSignature(proposal, player);
  const done = signPayload(await call(realm, `claim/${claim.code}`, form({ records: JSON.stringify([signed]) })));
  assert.ok(await isComplete(done.records[0]));
  assert.deepEqual(realm.list().records, []);
});

Deno.test("the realm card is signed by the realm and served to any page", async () => {
  const { realm } = await setup();
  const response = await call(realm, "endlessmind-card.json");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const card = await response.json();
  assert.deepEqual(await validSigners(card), [realm.id]);
  assert.deepEqual(card.play, [BASE]);
  assert.equal(card.list, BASE + "endlessmind-list.json");
});

Deno.test("a burned ID is refused, and its sessions and public records are gone", async () => {
  const { realm, clock } = await setup();
  const cookie = await signIn(realm, clock.now);
  const words = await wordsFor(7);
  const key = base64url(await masterKey(await seedFromWords(words)));

  const stranger = { v: 1, type: "burn", key: base64url(await masterKey(await seedFromWords(await wordsFor(9)))) };
  assert.match(await (await call(realm, "join/ANY", form({ burn: JSON.stringify(stranger) }))).text(), /never seen/);

  const burned = await call(realm, "join/ANY", form({ burn: JSON.stringify({ v: 1, type: "burn", key }) }));
  assert.match(await burned.text(), /burned here/);
  assert.equal((await (await call(realm, "endlessmind/me", { headers: { cookie } })).json()).player, null);
  const again = await join(realm, clock.now);
  assert.match(await again.answer.text(), /burned/);
});

Deno.test("the device that signs in gets a session too, and a link to play there", async () => {
  const { realm, clock } = await setup();
  const { answer } = await join(realm, clock.now);
  const cookie = /** @type {string} */ (answer.headers.get("set-cookie")).split(";")[0];
  assert.match(await answer.text(), new RegExp(`href="${BASE}"`));
  assert.equal((await (await call(realm, "endlessmind/me", { headers: { cookie } })).json()).player, player.id);
});
