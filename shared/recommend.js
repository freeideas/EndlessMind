// Recommendations: signed claims that say "this realm (or this actor) is
// good", made by an actor or a realm and kept by servers so others can find
// them. A recommendation proves only who said it. Whose word counts is each
// reader's choice (see "Finding realms" in specs/DESIGN.md and
// "Recommendations" in specs/PROTOCOL.md).

import { checkClaim, makeClaim } from "./claim.js";

/** @typedef {import("./envelope.js").Envelope} Envelope */
/** @typedef {import("./claim.js").Claim} Claim */

/** A recommendation counts for 30 days and is renewed while its author still means it. */
export const RECOMMENDATION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/** At most this many claims go with one as proof of playing, and a note has at most this many characters. */
export const MAX_PROOF = 4, MAX_NOTE = 280;

/**
 * What a recommendation says: a recommendation (with an optional note and the servers where its subject
 * is found), "not for me", or that an earlier one is withdrawn.
 * @typedef {{ recommend: { note?: string, via?: string[] } } | { notForMe: true } | { withdrawn: true }} Saying
 */

/**
 * Sign a recommendation, or a "not for me", or a withdrawal.
 * @param {CryptoKeyPair} keys  the author's key (an actor's lasting key, or a realm's)
 * @param {string} subject  the address recommended: a realm's, or an actor's
 * @param {{ note?: unknown, via?: string[] } | "not for me" | "withdrawn"} what
 * @param {Envelope} [pass]  when a referee key signs for its realm
 */
export function makeRecommendation(keys, subject, what, pass) {
  /** @type {Saying} */
  let says;
  if (what === "not for me") says = { notForMe: true };
  else if (what === "withdrawn") says = { withdrawn: true };
  else {
    const note = typeof what.note === "string" ? what.note.slice(0, MAX_NOTE) : "";
    says = { recommend: { ...(note ? { note } : {}), ...(what.via?.length ? { via: what.via.slice(0, 8) } : {}) } };
  }
  return makeClaim(keys, subject, says, RECOMMENDATION_LIFETIME_MS, pass);
}

/**
 * @typedef {object} Recommendation  a checked recommendation
 * @property {string} author   who says it: an actor's address, or a realm's
 * @property {string} subject  what it is about
 * @property {"recommend" | "notForMe" | "withdrawn"} kind
 * @property {string} [note]
 * @property {string[]} via    servers where the subject can be found
 * @property {number} time
 * @property {number} expires
 * @property {Claim[]} proof   claims the subject signed about the author: proof that the author played there
 * @property {Claim[]} standing  claims other realms signed about the author: what the author has earned elsewhere,
 *                               which a reader may count when it trusts those realms
 * @property {{ claim: Envelope, proof?: Envelope[], standing?: Envelope[] }} record  what is kept and passed on
 */

/**
 * Check a recommendation and any proof that goes with it. Proof that is not what it says is left out.
 * @param {unknown} value  `{ claim, proof?, standing? }`
 * @returns {Promise<Recommendation | null>}
 */
export async function checkRecommendation(value) {
  const v = /** @type {any} */ (value);
  const claim = await checkClaim(v?.claim);
  if (!claim || typeof claim.expires !== "number") return null;
  // A recommendation fades: it may not reach further ahead than its lifetime (plus a day for clocks that differ).
  if (claim.expires > Date.now() + RECOMMENDATION_LIFETIME_MS + 24 * 60 * 60 * 1000) return null;
  const says = /** @type {any} */ (claim.says);
  /** @type {Recommendation["kind"]} */
  let kind;
  if (says?.notForMe === true) kind = "notForMe";
  else if (says?.withdrawn === true) kind = "withdrawn";
  else if (says?.recommend && typeof says.recommend === "object") kind = "recommend";
  else return null;
  const note = kind === "recommend" && typeof says.recommend.note === "string" ? says.recommend.note.slice(0, MAX_NOTE) : undefined;
  const via = kind === "recommend" && Array.isArray(says.recommend.via)
    ? says.recommend.via.filter((/** @type {unknown} */ s) => typeof s === "string" && /^https?:\/\/[^\s\/?#]+$/.test(s)).slice(0, 8)
    : [];
  const proof = [];
  for (const one of Array.isArray(v.proof) ? v.proof.slice(0, MAX_PROOF) : []) {
    const p = await checkClaim(one);
    if (p && p.issuer === claim.about && p.about === claim.issuer) proof.push(p);
  }
  const standing = [];
  for (const one of Array.isArray(v.standing) ? v.standing.slice(0, MAX_PROOF) : []) {
    const p = await checkClaim(one);
    if (p && p.about === claim.issuer && p.issuer !== claim.about && p.issuer !== claim.issuer) standing.push(p);
  }
  return {
    author: claim.issuer,
    subject: claim.about,
    kind,
    ...(note ? { note } : {}),
    via,
    time: claim.time,
    expires: claim.expires,
    proof,
    standing,
    record: {
      claim: claim.signed,
      ...(proof.length ? { proof: proof.map((p) => p.signed) } : {}),
      ...(standing.length ? { standing: standing.map((p) => p.signed) } : {}),
    },
  };
}
