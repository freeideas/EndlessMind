// A visitor's own copy of repeatable rules follows the referee move by move
// and catches it the moment it strays.

import { assert, assertEquals } from "jsr:@std/assert@1";
import maze from "../examples/maze-chase/rules.js";
import { startHost } from "../host/host.js";
import { startServer } from "../server/server.js";
import { checkAnnouncement, releaseOf } from "../shared/announce.js";
import { makeChecker } from "../shared/check.js";
import { generateKeyPair } from "../shared/crypto.js";
import { directRules } from "../shared/referee.js";
import { visit } from "../shared/visitor.js";

const turn = () => new Promise((r) => setTimeout(r, 0));

/** A referee's driver, and one player's checking copy fed from it. @param {(message: any) => any} [meddle] */
async function table(meddle = (m) => m) {
  const host = await directRules(maze);
  const copy = await directRules(maze);
  /** @type {string[]} */
  const alarms = [];
  const checker = makeChecker((check, me, adopt) => /** @type {NonNullable<typeof copy.replay>} */ (copy.replay)(check, me, adopt), "ann", (why) => alarms.push(why));
  let first = true;
  /** @type {Promise<unknown>} */
  let last = Promise.resolve();
  host.onViews((views, checks) => {
    if (!checks || !("ann" in checks)) return;
    // What travels is JSON, so the checker sees what a visitor would.
    const m = meddle(JSON.parse(JSON.stringify({ view: views.ann, check: checks.ann })));
    last = checker.state(m.check, m.view, "view" in m, first);
    first = false;
  });
  return { host, checker, alarms, settle: async () => { await turn(); await last; } };
}

Deno.test("a copy of repeatable rules agrees with an honest referee through entries, moves and leaving", async () => {
  const { host, checker, alarms, settle } = await table();
  assert(host.repeatable);
  await host.enter("ann", { name: "Ann", color: "red" });
  const dirs = ["up", "down", "left", "right"];
  for (let tick = 0; tick < 150; tick++) {
    if (tick === 10) await host.enter("bo", { name: "Bo" });
    if (tick === 90) host.leave("bo");
    if (tick % 3 === 0) {
      const action = { dir: dirs[(tick * 7) % 4] };
      checker.sent(action);
      host.act("ann", action);
    }
    if (tick > 10 && tick < 90 && tick % 4 === 0) host.act("bo", { dir: dirs[tick % 4] });
    host.step();
    await settle();
  }
  assertEquals(alarms, []);
  host.stop();
});

Deno.test("a referee that changes a view, or makes a move in a player's name, is caught", async () => {
  let tick = 0;
  const cheat = await table((m) => {
    if (++tick === 5) m.view.players[0].score += 100;
    return m;
  });
  await cheat.host.enter("ann", {});
  for (let i = 0; i < 6; i++) {
    cheat.host.step();
    await cheat.settle();
  }
  assertEquals(cheat.alarms, ["showed you something its public rules would not"]);
  cheat.host.stop();

  const forge = await table();
  await forge.host.enter("ann", {});
  forge.host.step();
  await forge.settle();
  forge.host.act("ann", { dir: "left" }); // ann's app never sent this
  forge.host.step();
  await forge.settle();
  assertEquals(forge.alarms, ["made a move in your name that you did not make"]);
  forge.host.stop();

  const silent = await table((m) => ({ view: m.view }));
  await silent.host.enter("ann", {});
  silent.host.step();
  await silent.settle();
  assertEquals(silent.alarms, ["sent nothing to check it by"]);
  silent.host.stop();
});

Deno.test("a visitor checks a real host over the network, in a private session", async () => {
  const dir = await Deno.makeTempDir();
  const s = await startServer({ port: 0, hostname: "127.0.0.1", dataDir: `${dir}/data` });
  const base = `http://127.0.0.1:${s.port}`;
  try {
    const host = await startHost({ server: base, realmDir: "examples/maze-chase", keysFile: `${dir}/maze.json`, log: () => {} });
    const found = await checkAnnouncement((await (await fetch(`${base}/announce/${host.address}`)).json()).announcement);
    assert(found);
    const keys = await generateKeyPair();
    const copy = await directRules(maze);
    /** @type {string[]} */
    const alarms = [];
    let checked = 0;
    /** @type {ReturnType<typeof makeChecker> | undefined} */
    let checker;
    const visitor = await visit({
      server: base, address: found.referee, keys, release: await releaseOf(/** @type {any} */ (found.announcement.body).manifest),
      character: { name: "Tester" }, status: () => {}, onView: () => {},
      onCheck: (check, view, hasView, first) => {
        checked++;
        checker?.state(check, view, hasView, first);
      },
    });
    const { addressOf } = await import("../shared/crypto.js");
    checker = makeChecker((check, me, adopt) => /** @type {NonNullable<typeof copy.replay>} */ (copy.replay)(check, me, adopt), await addressOf(keys.publicKey), (why) => alarms.push(why));
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      if (i % 5 === 0) {
        const action = { dir: ["up", "down", "left", "right"][i % 4] };
        checker.sent(action);
        visitor.act(action);
      }
    }
    assert(checked > 5, "the host sent nothing to check");
    assertEquals(alarms, []);
    visitor.stop();
    host.stop();
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    await s.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});

/** One player's checker fed by hand, as a referee of these rules would feed it. @param {any} rules */
async function byHand(rules) {
  const host = await directRules(rules), copy = await directRules(rules);
  /** @type {string[]} */
  const alarms = [];
  /** @type {string[]} */
  const notices = [];
  const checker = makeChecker(
    (check, me, adopt) => /** @type {NonNullable<typeof copy.replay>} */ (copy.replay)(check, me, adopt),
    "ann", (why) => alarms.push(why), (what) => notices.push(what),
  );
  /** @type {any[]} */
  const sent = [];
  host.onViews((views, checks) => {
    if (checks && "ann" in checks) sent.push(JSON.parse(JSON.stringify({ view: views.ann, check: checks.ann })));
  });
  /** One tick; returns what the referee would send ann. */
  const tick = async () => {
    host.step();
    await turn();
    return sent.at(-1);
  };
  return { host, checker, alarms, notices, tick };
}

const counter = {
  repeatable: true,
  init: () => ({ score: {} }),
  enter(/** @type {any} */ s, /** @type {string} */ p) { s.score[p] = 0; },
  act(/** @type {any} */ s, /** @type {string} */ p, /** @type {any} */ a) {
    if (a && typeof a.by === "number") {
      a.by = Math.min(a.by, 3); // rules that tidy a move in place must not confuse the check
      s.score[p] += a.by;
    }
  },
  leave(/** @type {any} */ s, /** @type {string} */ p) { delete s.score[p]; },
  view(/** @type {any} */ s, /** @type {string} */ p) {
    if (s.score[p] === 7) throw new Error("a view that throws");
    return { score: s.score[p] };
  },
};

Deno.test("honest quirks raise no alarm: tidied moves, a view that throws, a starting point sent twice", async () => {
  const { host, checker, alarms, notices, tick } = await byHand(counter);
  await host.enter("ann", {});
  let m = await tick();
  await checker.state(m.check, m.view, "view" in m, true);
  for (const by of [9, 1, 3, 2]) { // 3, 4, 7 (the view throws), 9
    checker.sent({ by });
    host.act("ann", { by });
    if (by === 3) host.resync?.("ann"); // as after a repeated welcome: a second starting point, mid-session
    m = await tick();
    await checker.state(m.check, m.view, "view" in m, false);
  }
  assertEquals([alarms, notices], [[], []]);
  host.stop();
});

Deno.test("a referee cannot skip the starting point, slip in a false one, or move a player in and out", async () => {
  const never = await byHand(counter);
  await never.host.enter("ann", {});
  for (let i = 0; i < 22; i++) {
    const m = await never.tick();
    await never.checker.state({ inputs: [] }, { score: 5000 }, true, i === 0);
  }
  assertEquals(never.alarms, ["never gave a starting point to check it from"]);

  const doctored = await byHand(counter);
  await doctored.host.enter("ann", {});
  let m = await doctored.tick();
  await doctored.checker.state(m.check, m.view, true, true);
  const lie = JSON.stringify({ state: { score: { ann: 5000 } }, players: ["ann"] });
  await doctored.checker.state({ start: lie, inputs: [["tick"]] }, { score: 5000 }, true, false);
  assertEquals(doctored.alarms, ["described a state that the moves it sent do not lead to"]);

  const puppet = await byHand(counter);
  await puppet.host.enter("ann", {});
  m = await puppet.tick();
  await puppet.checker.state(m.check, m.view, true, true);
  await puppet.checker.state({ inputs: [["leave", "ann"], ["enter", "ann", {}], ["tick"]] }, { score: 0 }, true, false);
  assertEquals(puppet.alarms, ["made you leave or enter without your asking"]);

  // After a break the copy must take the referee's word for the state, and the player is told so.
  const again = await byHand(counter);
  await again.host.enter("ann", {});
  m = await again.tick();
  await again.checker.state(m.check, m.view, true, true);
  again.host.resync?.("ann");
  m = await again.tick();
  await again.checker.state(m.check, m.view, true, true);
  assertEquals([again.alarms, again.notices.length], [[], 1]);
  for (const t of [never, doctored, puppet, again]) t.host.stop();
});

Deno.test("one player's oversize move is not passed on to everyone", async () => {
  const { host, tick } = await byHand(counter);
  await host.enter("ann", {});
  await host.enter("bo", {});
  await tick();
  host.act("bo", { by: 1, pad: "x".repeat(5000) });
  host.act("bo", { by: 2 });
  const m = await tick();
  assertEquals(m.check.inputs, [["act", "bo", { by: 2 }], ["tick"]]);
  assertEquals((await host.enter("cy", { name: "x".repeat(40_000) })).ok, false);
  host.stop();
});
