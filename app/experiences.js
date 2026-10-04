// The player's record: signed experiences that realms gave this character,
// kept in this browser with its keys. Keeping them, and showing them, is the
// player's choice. See shared/experience.js.

import { checkExperience } from "../shared/experience.js";
import * as store from "./store.js";

/** @typedef {import("../shared/envelope.js").Envelope} Envelope */

/** One change at a time, so two experiences arriving together are both kept. @type {Promise<unknown>} */
let turn = Promise.resolve();

/**
 * The experiences held from one realm that still count.
 * @param {string} realm @returns {Promise<Envelope[]>}
 */
export async function held(realm) {
  /** @type {Envelope[]} */
  const kept = (await store.get("exp:" + realm))?.list ?? [];
  const checked = await Promise.all(kept.map((signed) => checkExperience(signed)));
  return kept.filter((_, i) => checked[i]?.issuer === realm);
}

/**
 * Keep an experience a realm signed for this player, if it is what it claims to be.
 * A newer one that says the same thing replaces the older.
 * @param {string} realm  the realm it must come from
 * @param {string} me     the address it must be about (omit when restoring a backup)
 * @param {unknown} signed
 */
export function keep(realm, me, signed) {
  return turn = turn.then(async () => {
    const experience = await checkExperience(signed);
    if (!experience || experience.issuer !== realm || (me && experience.about !== me)) return;
    const says = JSON.stringify(experience.says);
    const others = (await held(realm)).filter((old) => JSON.stringify(/** @type {any} */ (old.body).says ?? null) !== says);
    await store.put("exp:" + realm, { realm, list: [experience.signed, ...others].slice(0, 32) });
  }).catch(() => {});
}

/** Everything held, for the home page and for backups. @returns {Promise<{ realm: string, list: Envelope[] }[]>} */
export async function record() {
  /** @type {{ realm: string }[]} */
  const kept = await store.list("exp:");
  return Promise.all(kept.map(async ({ realm }) => ({ realm, list: await held(realm) })));
}

/** Replace the record with one from a backup, which belongs to the character in that backup. @param {unknown} experiences */
export async function restore(experiences) {
  await turn;
  for (const { realm } of await store.list("exp:")) await store.put("exp:" + realm, { realm, list: [] });
  for (const signed of Array.isArray(experiences) ? experiences : []) {
    const experience = await checkExperience(signed);
    if (experience) await keep(experience.issuer, "", signed);
  }
}
