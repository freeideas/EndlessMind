// The EntryPortal page must carry the current shared code, a security policy that forbids every
// connection, and its own fingerprint.

import assert from "node:assert/strict";
import { build, pagePath, sums, sumsPath } from "../deploy/entryportal.js";

Deno.test("the EntryPortal is up to date with shared/ (run deno task portal if not)", async () => {
  const page = await Deno.readTextFile(pagePath());
  assert.ok(page === (await build(page)), "out of date: run deno task portal");
  assert.equal(await Deno.readTextFile(sumsPath()), await sums(page));
});

Deno.test("the EntryPortal's security policy forbids connections and outside code", async () => {
  const page = await Deno.readTextFile(pagePath());
  const policy = page.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
  assert.match(policy, /^default-src 'none'; /);
  assert.doesNotMatch(policy, /connect-src|unsafe-inline|unsafe-eval|\*\.|https:\/\//);
  assert.equal(page.match(/<script/g)?.length, 1, "one script only");
  assert.doesNotMatch(page, /<script[^>]+src=|<link |<img |<iframe|style="| on[a-z]+="/, "nothing loaded from elsewhere, no inline handlers");
});
