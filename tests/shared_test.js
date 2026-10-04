import { assert, assertEquals } from "jsr:@std/assert@1";
import { checkAnnouncement, makeAnnouncement, makeManifest } from "../shared/announce.js";
import { addressOf, generateKeyPair, hashOf, isAddress, sign, verify } from "../shared/crypto.js";
import { canonicalJson } from "../shared/encoding.js";
import { open, seal } from "../shared/envelope.js";

Deno.test("canonical JSON sorts keys at every level", () => {
  assertEquals(canonicalJson({ b: 1, a: { d: [1, { z: 0, y: 1 }], c: null } }), '{"a":{"c":null,"d":[1,{"y":1,"z":0}]},"b":1}');
});

Deno.test("addresses, signatures and hashes carry labels and check out", async () => {
  const keys = await generateKeyPair();
  const address = await addressOf(keys.publicKey);
  assert(isAddress(address));
  const sig = await sign(keys.privateKey, "hello");
  assert(await verify(address, "hello", sig));
  assert(!(await verify(address, "hello!", sig)));
  assertEquals(await hashOf("abc"), "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

Deno.test("envelopes reject tampering and ignore unknown fields", async () => {
  const a = await generateKeyPair();
  const b = await generateKeyPair();
  const env = await seal(a, await addressOf(b.publicKey), "act", { dir: "up" });
  assert(await open(env));
  assertEquals(await open({ ...env, body: { dir: "down" } }), null);
  assertEquals(await open({ ...env, from: await addressOf(b.publicKey) }), null);
  const extra = await open({ ...env, future: "field" });
  assert(extra && !("future" in extra));
});

Deno.test("announcements must be signed by the realm that the manifest names", async () => {
  const realm = await generateKeyPair();
  const other = await generateKeyPair();
  const body = { name: "Test", tags: ["t"], files: { "r.js": await hashOf("x") }, main: "r.js", renderer: "r.js", play: ["browser"] };
  const manifest = await makeManifest(realm, body);
  assert(await checkAnnouncement(await makeAnnouncement(realm, manifest)));
  assertEquals(await checkAnnouncement(await makeAnnouncement(other, manifest)), null);
});
