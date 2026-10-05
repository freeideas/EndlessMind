import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { parseLink } from "../host/visit.js";

Deno.test("a realm link gives the realm's address and its helper servers", () => {
  const address = "ed25519-qz4oymgfnqi2bgqiqvsromnmpbhre4pxau3fqc2rb2ticmrgrlhq";
  assertEquals(parseLink(`https://portal.example/#emind:${address}?via=https%3A%2F%2Fa.example,https%3A%2F%2Fb.example`),
    { address, servers: ["https://a.example", "https://b.example"] });
  assertEquals(parseLink(`https://a.example/#emind:${address}`), { address, servers: ["https://a.example"] });
  assertEquals(parseLink(`emind:${address}?via=http%3A%2F%2Flocalhost%3A8000`), { address, servers: ["http://localhost:8000"] });
  assertThrows(() => parseLink(`emind:${address}`));
  assertThrows(() => parseLink("https://a.example/"));
});
