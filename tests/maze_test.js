// The maze's rules are plain JavaScript, so they run in Deno exactly as they
// run in a browser sandbox.

import { assert, assertEquals } from "jsr:@std/assert@1";
import rules from "../examples/maze-chase/rules.js";

Deno.test("players enter, move, collect seeds and see each other", () => {
  const s = rules.init({ seed: 42 });
  assertEquals(rules.enter(s, "a", { name: "Ann", color: "red" }), true);
  assertEquals(rules.enter(s, "b", { name: "Bo", color: "blue" }), true);
  for (let i = 0; i < 40; i++) {
    rules.act(s, "a", { dir: ["right", "down"][i % 2] });
    rules.tick(s);
  }
  const view = rules.view(s, "a");
  assertEquals(view.players.length, 2);
  assert(view.players.find((p) => p.me)?.name === "Ann");
  assertEquals(view.grid.length, 15);
  rules.leave(s, "b");
  assertEquals(rules.view(s, "a").players.length, 1);
});

Deno.test("odd character data is cleaned up, not trusted", () => {
  const s = rules.init({ seed: 1 });
  rules.enter(s, "x", { name: "N".repeat(100), color: "<script>" });
  const p = rules.view(s, "x").players[0];
  assertEquals(p.name.length, 24);
  assertEquals(p.color, "#9cf");
});
