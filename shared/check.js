// Checking a referee. When a realm's rules are public and repeatable (the same
// moves in the same order always give the same state), a visitor's portal runs its
// own copy of the rules, feeds it the moves the referee says it applied, and
// compares what that copy would show the actor with what the referee sent.
// A referee that strays from the public rules in any way the actor can see is
// caught at once. See specs/RUNTIME.md ("Checking the referee").
//
// What it cannot do: a copy has to start from the referee's own account of the
// state, at the start of every session. Between those points nothing gets past
// it; each new starting point after the first is told to the actor.

import { canonicalJson } from "./encoding.js";

/** @param {unknown} value */
const plain = (value) => canonicalJson(JSON.parse(JSON.stringify(value ?? null)));

/**
 * @param {(check: any, me: string, adopt: boolean) => { view: unknown, differs: boolean } | Promise<{ view: unknown, differs: boolean }>} replay
 *   applies a check to the visitor's own copy of the rules (RulesDriver.replay)
 * @param {string} me     this actor's address in the realm
 * @param {(why: string) => void} alarm    called once, with what the referee did, if it is caught
 * @param {(what: string) => void} [notice]  called when checking is weaker than usual, though nothing is wrong
 */
export function makeChecker(replay, me, alarm, notice = () => {}) {
  let started = false, everStarted = false, failed = false, off = false, waited = 0;
  /** This actor's own recent moves, oldest first, to spot a move made in their name. @type {string[]} */
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
    if (failed || off) return;
    // Each session begins from the referee's account of the state; until it arrives nothing can be followed.
    if (first) {
      started = false;
      waited = 0;
    }
    if (!check) return fail("sent nothing to check it by");
    if (check.unchecked) {
      off = true;
      return notice(`this realm's referee cannot be checked: ${String(check.unchecked).slice(0, 100)}.`);
    }
    const hasStart = typeof check.start === "string";
    if (!started && !hasStart) {
      if (++waited > 20) fail("never gave a starting point to check it from");
      return;
    }
    if (started) {
      // Entering and leaving happen between sessions, never inside one, and every move must be one this portal sent.
      for (const [kind, actor, data] of check.inputs ?? []) {
        if (actor !== me) continue;
        if (kind !== "act") return fail("made you leave or enter without your asking");
        const at = mine.indexOf(plain(data));
        if (at < 0) return fail("made a move in your name that you did not make");
        mine.splice(0, at + 1);
      }
    } else if (everStarted) {
      notice("checking of this realm's referee started over after a break, from the referee's own account of the state.");
    }
    const adopt = !started;
    started = everStarted = true;
    const mineNow = await replay(check, me, adopt);
    if (mineNow.differs) return fail("described a state that the moves it sent do not lead to");
    const expected = mineNow.view;
    const same = hasView ? expected !== undefined && plain(expected) === plain(view) : expected === undefined;
    if (!same) fail("showed you something its public rules would not");
  }

  return {
    /** Note a move this actor is sending. @param {unknown} action */
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
