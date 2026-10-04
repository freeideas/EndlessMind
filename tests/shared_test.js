import { assert, assertEquals } from "jsr:@std/assert@1";
import { checkAnnouncement, makeAnnouncement, makeManifest, manifestBody } from "../shared/announce.js";
import { addressOf, generateKeyPair, hashOf, isAddress, isHash, sign, verify } from "../shared/crypto.js";
import { canonicalJson, fromBase32, parseStrictJson, toBase32 } from "../shared/encoding.js";
import { open, ReplayGuard, seal } from "../shared/envelope.js";

Deno.test("canonical JSON sorts keys at every level (RFC 8785)", () => {
  assertEquals(canonicalJson({ b: 1, a: { d: [1, { z: 0, y: 1 }], c: null } }), '{"a":{"c":null,"d":[1,{"y":1,"z":0}]},"b":1}');
  // Examples from RFC 8785: numbers in shortest form, keys by UTF-16 code units.
  assertEquals(canonicalJson({ n: [1e30, 4.5, 0.002, -0, 1e-7] }), '{"n":[1e+30,4.5,0.002,0,1e-7]}');
  assertEquals(canonicalJson({ "€": 1, "\r": 2, "😀": 3, "1": 4 }), '{"\\r":2,"1":4,"€":1,"😀":3}');
});

Deno.test("base32 round-trips any bytes", () => {
  for (const n of [0, 1, 5, 31, 32, 64]) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    assertEquals(fromBase32(toBase32(bytes)), bytes);
  }
});

Deno.test("addresses, signatures and hashes are labeled lowercase base32", async () => {
  const keys = await generateKeyPair();
  const address = await addressOf(keys.publicKey);
  assert(isAddress(address) && address.length === 60 && address === address.toLowerCase());
  const sig = await sign(keys.privateKey, "test", "hello");
  assert(await verify(address, "test", "hello", sig));
  assert(!(await verify(address, "test", "hello!", sig)));
  assert(!(await verify(address, "other", "hello", sig)), "a signature for one purpose must not pass for another");
  // The last base32 character carries 4 spare bits; changing them must not give a second valid form.
  const last = address.at(-1) ?? "a";
  const twin = address.slice(0, -1) + "abcdefghijklmnopqrstuvwxyz234567"["abcdefghijklmnopqrstuvwxyz234567".indexOf(last) ^ 1];
  assert(!isAddress(twin), "an address has exactly one written form");
  assert(!isAddress(address.toUpperCase()));
  const hash = await hashOf("abc");
  assert(isHash(hash));
  assertEquals(hash, "sha256-" + toBase32(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc")))));
});

Deno.test("envelopes sign every field, including ones added later", async () => {
  const a = await generateKeyPair();
  const b = await generateKeyPair();
  const to = await addressOf(b.publicKey);
  const env = await seal(a, to, "emind.act", { dir: "up" });
  assert(await open(env));
  assertEquals(await open({ ...env, body: { dir: "down" } }), null);
  assertEquals(await open({ ...env, from: to }), null);
  assertEquals(await open({ ...env, future: "field" }), null, "an unsigned extra field must not pass");

  // A future sender adds a field and signs it: it passes and is kept.
  const { sig: _, ...unsigned } = { ...env, future: "field" };
  const signed = { ...unsigned, sig: await sign(a.privateKey, "envelope", canonicalJson(unsigned)) };
  const opened = await open(signed);
  assertEquals(/** @type {any} */ (opened)?.future, "field");
});

Deno.test("the replay guard rejects repeats and stale messages", async () => {
  const a = await generateKeyPair();
  const guard = new ReplayGuard(60_000);
  const env = await seal(a, null, "x.y", {});
  assert(guard.accept(env));
  assert(!guard.accept(env));
  assert(guard.accept(await seal(a, null, "x.y", {})));
  assert(!guard.accept({ ...env, id: "different-id-0000", time: Date.now() - 120_000 }));
});

Deno.test("announcements must be signed by the realm that the manifest names", async () => {
  const realm = await generateKeyPair();
  const other = await generateKeyPair();
  const body = { name: "Test", tags: ["t"], files: { "r.js": await hashOf("x") }, main: "r.js", renderer: "r.js", needs: [] };
  const manifest = await makeManifest(realm, body);
  assert(await checkAnnouncement(await makeAnnouncement(realm, manifest)));
  assertEquals(await checkAnnouncement(await makeAnnouncement(other, manifest)), null);
});

Deno.test("strict JSON rejects duplicate names, deep nesting and huge text", () => {
  assertEquals(parseStrictJson('{"a":1,"b":{"a":2},"c":["a","a"]}'), { a: 1, b: { a: 2 }, c: ["a", "a"] });
  assertEquals(parseStrictJson('{"a":1,"a":2}'), undefined);
  assertEquals(parseStrictJson('{"a":{"x":1,"\\u0078":2}}'), undefined, "escaped duplicates count too");
  assertEquals(parseStrictJson("[".repeat(40) + "]".repeat(40)), undefined);
  assertEquals(parseStrictJson('"' + "x".repeat(300_000) + '"'), undefined);
  assertEquals(parseStrictJson("{not json}"), undefined);
});

Deno.test("a manifest may leave out private rules or a browser renderer, and may name the realm's own app", async () => {
  const keys = await generateKeyPair();
  const hashes = { "view.js": await hashOf("x") };
  const check = async (/** @type {any} */ body) => (await checkAnnouncement(await makeAnnouncement(keys, await makeManifest(keys, body))))?.manifest;

  const hidden = manifestBody({ name: "Well", main: "rules.js", privateRules: true, renderer: "view.js" }, hashes);
  assertEquals([hidden.main, hidden.renderer], [undefined, "view.js"]);
  assert(await check(hidden));

  const app = { name: "Harbor", url: "https://example.org/get" };
  const engine = manifestBody({ name: "Harbor", main: "server", privateRules: true, app }, {});
  assertEquals([engine.renderer, engine.app], [undefined, app]);
  assert(await check(engine));

  assertEquals(await check({ ...engine, app: { name: "x", url: "javascript:alert(1)" } }), undefined);
  assertEquals(await check({ ...hidden, renderer: "missing.js" }), undefined);
  let refused = false;
  try {
    manifestBody({ name: "Nothing to play with", main: "rules.js" }, {});
  } catch {
    refused = true;
  }
  assert(refused, "a realm needs a renderer or an app");
});
