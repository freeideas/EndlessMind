import { assert, assertEquals } from "jsr:@std/assert@1";
import { checkAnnouncement, makeAnnouncement, makeManifest } from "../shared/announce.js";
import { addressOf, generateKeyPair, hashOf, isAddress, isHash, sign, verify } from "../shared/crypto.js";
import { canonicalJson, fromBase32, toBase32 } from "../shared/encoding.js";
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
  const hash = await hashOf("abc");
  assert(isHash(hash));
  assertEquals(hash, "sha256-" + toBase32(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc")))));
});

Deno.test("envelopes sign every field, including ones added later", async () => {
  const a = await generateKeyPair();
  const b = await generateKeyPair();
  const to = await addressOf(b.publicKey);
  const env = await seal(a, to, "wwg.act", { dir: "up" });
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
  const body = { name: "Test", tags: ["t"], files: { "r.js": await hashOf("x") }, main: "r.js", renderer: "r.js", play: ["browser"] };
  const manifest = await makeManifest(realm, body);
  assert(await checkAnnouncement(await makeAnnouncement(realm, manifest)));
  assertEquals(await checkAnnouncement(await makeAnnouncement(other, manifest)), null);
});
