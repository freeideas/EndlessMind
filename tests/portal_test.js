// The EntryPortal page must carry the current shared code, a security policy that forbids every
// connection, and its own fingerprint; EntryPortal/ must forward to the newest version.

import assert from "node:assert/strict";
import { forwardPath, oldForwardPath, pagePath, PORTAL_SITE, upToDate, VERSION } from "../deploy/entryportal.js";

Deno.test("the EntryPortal files are up to date with shared/ (run deno task portal if not)", async () => {
  assert.ok(await upToDate(), "out of date: run deno task portal");
  assert.match(await Deno.readTextFile(forwardPath()), new RegExp(`"${VERSION}/"`));
  assert.match(await Deno.readTextFile(oldForwardPath()), new RegExp(`"${PORTAL_SITE}"`));
});

Deno.test("the EntryPortal's security policy forbids connections and outside code", async () => {
  const page = await Deno.readTextFile(pagePath());
  const policy = page.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
  assert.ok(page.startsWith("<!doctype html>\n"), "nothing may come before the doctype");
  const head = page.slice(0, page.indexOf("</head>"));
  assert.ok(/^<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport"[^>]*>\n<meta http-equiv="Content-Security-Policy"/.test(head), "the policy must sit at the top of the head, or browsers ignore it");
  assert.match(policy, /^default-src 'none'; /);
  assert.doesNotMatch(policy, /connect-src|unsafe-inline|unsafe-eval|\*\.|https:\/\//);
  assert.equal(page.match(/<script/g)?.length, 1, "one script only");
  assert.doesNotMatch(page, /<script[^>]+src=|<link |<img |<iframe|style="| on[a-z]+="/, "nothing loaded from elsewhere, no inline handlers");
});

Deno.test("the EntryPortal's script is valid JavaScript", async () => {
  const page = await Deno.readTextFile(pagePath());
  const script = page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? "";
  new Function(script); // parses without running; throws on a syntax error
});
