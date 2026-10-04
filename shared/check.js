// Checking a referee. When a realm's rules are public and repeatable (the same
// moves in the same order always give the same state), a visitor's app runs its
// own copy of the rules, feeds it the moves the referee says it applied, and
// compares what that copy would show the player with what the referee sent.
// A referee that strays from the public rules in any way the player can see is
// caught at once. See specs/RUNTIME.md ("Checking the referee").

import { canonicalJson } from "./encoding.js";

/** @param {unknown} value */
const plain = (value) => canonicalJson(JSON.parse(JSON.stringify(value ?? null)));

/**
 * @param {(check: any, me: string) => unknown} replay  applies a check to the visitor's own copy of the
 *   rules and returns the view that copy gives this player (it may return a promise)
 * @param {string} me     this player's address in the realm
 * @param {(why: string) => void} alarm  called once, with what the referee did, if it is caught
 */
export function makeChecker(replay, me, alarm) {
  let started = false, failed = false;
  /** This player's own recent moves, oldest first, to spot a move made in their name. @type {string[]} */
  const mine = [];
  /** @type {Promise<unknown>} */
  let chain = Promise.resolve();
  /** @param {string} why */
  const fail = (why) => {
    if (!failed) alarm(why);
    failed = true;
  };

  /** @param {any} check @param {unknown} view @param {boolean} hasView @param {boolean} first */
  async function one(check, view, hasView, first) {
    if (failed) return;
    // Each session begins from a full copy of the state; moves sent before one arrives cannot be followed.
    if (first) started = false;
    if (!check) return fail("sent nothing to check it by");
    if (typeof check.start !== "string") {
      if (!started) return;
      for (const [kind, player, data] of check.inputs ?? []) {
        if (kind !== "act" || player !== me) continue;
        const at = mine.indexOf(plain(data));
        if (at < 0) return fail("made a move in your name that you did not make");
        mine.splice(0, at + 1);
      }
    }
    started = true;
    const expected = await replay(check, me);
    const same = hasView ? expected !== undefined && plain(expected) === plain(view) : expected === undefined;
    if (!same) fail("showed you something its public rules would not");
  }

  return {
    /** Note a move this player is sending. @param {unknown} action */
    sent(action) {
      mine.push(plain(action));
      if (mine.length > 1000) mine.shift();
    },
    /**
     * Check one message from the referee.
     * @param {unknown} check    what the referee sent to check it by
     * @param {unknown} view     the view it sent
     * @param {boolean} hasView  whether it sent a view at all
     * @param {boolean} first    whether this is the first message of a session
     */
    state(check, view, hasView, first) {
      chain = chain.then(() => one(check, view, hasView, first)).catch(() => fail("could not be followed by your copy of its rules"));
      return chain;
    },
  };
}
