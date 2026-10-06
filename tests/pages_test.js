// Every web page in the repository starts with its doctype. Text before it shows up on the page (an
// editing slip once put a line of script at the top of the maze page) and can push a page's security
// policy out of its head.

import assert from "node:assert/strict";

/** @param {URL} dir @returns {AsyncGenerator<URL>} */
async function* pages(dir) {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory && entry.name !== ".data") yield* pages(url);
    else if (entry.name.endsWith(".html")) yield url;
  }
}

Deno.test("every page starts with <!doctype html>", async () => {
  let count = 0;
  for (const top of ["site/", "portal/", "examples/"]) {
    for await (const page of pages(new URL(`../${top}`, import.meta.url))) {
      const text = await Deno.readTextFile(page);
      assert.ok(text.startsWith("<!doctype html>"), `${page.pathname} has something before its doctype`);
      count++;
    }
  }
  assert.ok(count >= 8);
});
