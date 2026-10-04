// Test vectors: fixed inputs and the exact outputs every implementation of the
// protocol must produce. `deno run tests/vectors.js` prints them; the copy in
// specs/test-vectors.json is checked by tests/vectors_test.js.

import { releaseOf } from "../shared/announce.js";
import { addressOf, hashOf, keyPairFromSeed, sign } from "../shared/crypto.js";
import { canonicalJson, toBase32 } from "../shared/encoding.js";
import { seal } from "../shared/envelope.js";

/** @param {string} hex */
const fromHex = (hex) => new Uint8Array(hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);

export async function buildVectors() {
  // The secret key from RFC 8032's first Ed25519 test, so the raw key math can be cross-checked there.
  const seedHex = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
  const keys = await keyPairFromSeed(fromHex(seedHex));
  const address = await addressOf(keys.publicKey);
  const to = "ed25519-" + toBase32(new Uint8Array(32));

  const envelope = await seal(keys, to, "wwg.act", { action: { dir: "up" } }, { id: "aaaaaaaaaaaaaaaaaaaaaaaaaa", time: 1790000000000 });
  const { sig: _, ...unsigned } = envelope;
  const manifest = await seal(keys, null, "manifest", {
    name: "Vector Realm", description: "", tags: ["test"], files: { "rules.js": await hashOf("export default {}") },
    main: "rules.js", renderer: "rules.js", play: ["browser"], needs: [],
  }, { id: "bbbbbbbbbbbbbbbbbbbbbbbbbb", time: 1790000000000 });

  const canonicalInputs = ['{"b":1,"a":[true,null,{"d":2,"c":"x"}]}', '{"n":[1e30,4.50,0.002,-0,1e-7]}', '{"\\u20ac":1,"\\r":2,"\\ud83d\\ude00":3,"1":4}'];
  return {
    about: "wwg protocol version 0 (draft) test vectors. See specs/PROTOCOL.md, \"Version 0 formats\". Strings in base32 are lowercase RFC 4648 without padding.",
    base32: [
      { hex: "", base32: toBase32(new Uint8Array()) },
      { hex: "66", base32: toBase32(fromHex("66")) },
      { hex: "666f6f626172", base32: toBase32(fromHex("666f6f626172")) },
    ],
    canonicalJson: canonicalInputs.map((input) => ({ input, canonical: canonicalJson(JSON.parse(input)) })),
    hash: [{ utf8: "abc", hash: await hashOf("abc") }, { utf8: "", hash: await hashOf("") }],
    key: { seedHex, publicKeyHex: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", address },
    signature: {
      purpose: "claim",
      text: "example.org:8000\nchallenge-nonce",
      signedBytesUtf8: "wwg-claim\nexample.org:8000\nchallenge-nonce",
      sig: await sign(keys.privateKey, "claim", "example.org:8000\nchallenge-nonce"),
    },
    envelope: { envelope, signedBytesUtf8: "wwg-envelope\n" + canonicalJson(unsigned) },
    release: { manifest, release: await releaseOf(manifest) },
  };
}

if (import.meta.main) console.log(JSON.stringify(await buildVectors(), null, 2));
