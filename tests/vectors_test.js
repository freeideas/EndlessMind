import { assertEquals } from "jsr:@std/assert@1";
import { open } from "../shared/envelope.js";
import { addressOf, keyPairFromSeed } from "../shared/crypto.js";
import { toBase32 } from "../shared/encoding.js";
import { buildVectors } from "./vectors.js";

Deno.test("the published test vectors match what the code produces", async () => {
  const published = JSON.parse(await Deno.readTextFile(new URL("../specs/test-vectors.json", import.meta.url)));
  assertEquals(published, JSON.parse(JSON.stringify(await buildVectors())));
});

Deno.test("the vector key matches RFC 8032 and its envelope opens", async () => {
  const v = await buildVectors();
  const hex = v.key.publicKeyHex.match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
  assertEquals(v.key.address, "ed25519-" + toBase32(new Uint8Array(hex)));
  const seed = new Uint8Array(v.key.seedHex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
  assertEquals(await addressOf((await keyPairFromSeed(seed)).publicKey), v.key.address);
  assertEquals((await open(v.envelope.envelope))?.id, "aaaaaaaaaaaaaaaaaaaaaaaaaa");
  const { checkShown } = await import("../shared/experience.js");
  assertEquals((await checkShown(v.experience, v.experience.audience))?.says, "pulled the sword from the stone");
});
