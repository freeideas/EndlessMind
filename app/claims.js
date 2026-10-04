// The player's record: signed claims that realms gave this character,
// kept in this browser with its keys. Keeping them, and showing them, is the
// player's choice. See shared/claim.js.

import { addressesIn } from "./character.js";
import { checkClaim } from "../shared/claim.js";
import * as store from "./store.js";

/** @typedef {import("../shared/envelope.js").Envelope} Envelope */

/** One change at a time, so two claims arriving together are both kept. @type {Promise<unknown>} */
let turn = Promise.resolve();

/**
 * The claims held from one realm that still count.
 * @param {string} realm @returns {Promise<Envelope[]>}
 */
export async function held(realm) {
  /** @type {Envelope[]} */
  const kept = (await store.get("claim:" + realm))?.list ?? [];
  const checked = await Promise.all(kept.map((signed) => checkClaim(signed)));
  return kept.filter((_, i) => checked[i]?.issuer === realm);
}

/**
 * Keep a claim a realm signed for this player, if it is what it says it is.
 * A newer one that says the same thing replaces the older.
 * @param {string} realm  the realm it must come from
 * @param {string} me     the address it must be about (omit when restoring a backup)
 * @param {unknown} signed
 * @returns {Promise<boolean>} whether it was kept
 */
export function keep(realm, me, signed) {
  return turn = turn.then(async () => {
    const claim = await checkClaim(signed);
    if (!claim || claim.issuer !== realm || (me && claim.about !== me)) return false;
    const says = JSON.stringify(claim.says);
    const others = (await held(realm)).filter((old) => JSON.stringify(/** @type {any} */ (old.body).says ?? null) !== says);
    await store.put("claim:" + realm, { realm, list: [claim.signed, ...others].slice(0, 32) });
    return true;
  }).catch(() => false);
}

/** Everything held, for the home page and for backups. @returns {Promise<{ realm: string, list: Envelope[] }[]>} */
export async function record() {
  /** @type {{ realm: string }[]} */
  const kept = await store.list("claim:");
  return Promise.all(kept.map(async ({ realm }) => ({ realm, list: await held(realm) })));
}

/**
 * Add the record from a backup to what is held. Nothing held is thrown away: a backup may be older than
 * the record here. Only claims about the backup's character are taken.
 * @param {unknown} claims @param {string} secret  the character's secret from the same backup
 */
export async function restore(claims, secret) {
  // Oldest first, so the newest end up in front as they were.
  for (const signed of Array.isArray(claims) ? [...claims].reverse() : []) {
    const claim = await checkClaim(signed);
    if (!claim) continue;
    const mine = await addressesIn(secret, claim.issuer).catch(() => new Map());
    if (mine.has(claim.about)) await keep(claim.issuer, claim.about, signed);
  }
}
