// Signed claims: how a good name is earned in one place and shown in
// another. Any key may sign a short statement about any address: something
// that happened ("pulled the sword from the stone", "entered", "won the spring
// award") or how things stand ("in good standing since March"). Whoever it is about keeps it, or not, and may show
// it to someone else with a fresh proof that it is theirs. Nobody is obliged to
// issue, keep, show or accept one. See specs/PROTOCOL.md ("Claims").

import { checkPass } from "./announce.js";
import { sign, verify } from "./crypto.js";
import { open, seal } from "./envelope.js";

/** @typedef {import("./envelope.js").Envelope} Envelope */

/** What a claim says is the issuer's business, but it must stay short (characters of JSON). */
export const MAX_SAYS = 1024;
/** And the whole signed claim must stay small, whatever else its issuer adds (characters of JSON). */
export const MAX_CLAIM = 4096;

/**
 * @typedef {object} Claim  a checked claim
 * @property {string} issuer   who vouches: a realm's address (its own, even when a referee under a pass signed)
 * @property {string} about    the address it is about
 * @property {unknown} says    what the issuer says
 * @property {number} time     when it was signed, by the issuer's clock
 * @property {number} [expires] when it stops counting, for a statement about how things stand, which the
 *                              issuer renews while it still holds; absent for something that simply happened
 * @property {Envelope} signed the signed original, which is what can be kept and shown again
 */

/**
 * Sign a claim.
 * @param {CryptoKeyPair} issuerKeys  the issuer's key, or a referee key the issuer gave a pass to
 * @param {string} about      the address it is about
 * @param {unknown} says      any JSON, at most MAX_SAYS characters
 * @param {number} [lifetimeMs]  how long it counts; left out, it lasts
 * @param {Envelope} [pass]   the pass, when a referee key signs; the claim then lasts no longer than the pass
 * @returns {Promise<Envelope>}
 */
export function makeClaim(issuerKeys, about, says, lifetimeMs, pass) {
  const text = JSON.stringify(says ?? null);
  if (text.length > MAX_SAYS) throw new Error(`A claim may say at most ${MAX_SAYS} characters.`);
  const expires = Math.min(lifetimeMs ? Date.now() + lifetimeMs : Infinity, pass ? /** @type {any} */ (pass.body).expires : Infinity);
  return seal(issuerKeys, about, "emind.claim", {
    says: JSON.parse(text),
    ...(Number.isFinite(expires) ? { expires } : {}),
    ...(pass ? { pass } : {}),
  });
}

/**
 * Check a claim: signed, in date, and (under a pass) signed by a referee the issuer allowed.
 * @param {unknown} value
 * @returns {Promise<Claim | null>}
 */
export async function checkClaim(value) {
  try {
    if (JSON.stringify(value).length > MAX_CLAIM) return null;
  } catch {
    return null;
  }
  const signed = await open(value);
  const body = /** @type {any} */ (signed?.body);
  if (!signed || signed.kind !== "emind.claim" || !signed.to || !body) return null;
  if (body.expires !== undefined && (typeof body.expires !== "number" || body.expires < Date.now())) return null;
  if (JSON.stringify(body.says ?? null).length > MAX_SAYS) return null;
  let issuer = signed.from;
  if (body.pass !== undefined) {
    // A referee speaks for its realm only while its pass lasts, so nothing it signs outlives the pass.
    // (Otherwise a referee key stolen later could sign false claims dated back to when it was good.)
    const pass = await checkPass(body.pass);
    if (!pass || pass.referee !== signed.from || !(body.expires <= pass.expires)) return null;
    issuer = pass.realm;
  }
  return { issuer, about: signed.to, says: body.says ?? null, time: signed.time, expires: body.expires, signed };
}

/**
 * Show a claim to someone: the claim plus proof, made with the key it is about, that the
 * one showing it is the one it is about. The proof names the audience, so it cannot be passed on.
 * @param {CryptoKeyPair} subjectKeys  the key the claim is about
 * @param {Envelope} claim
 * @param {string} audience  who it is shown to; for a realm, its address, a line break, and the visitor's address there
 */
export async function showClaim(subjectKeys, claim, audience) {
  return { claim, proof: await sign(subjectKeys.privateKey, "show", `${audience}\n${claim.sig}`) };
}

/**
 * Check a shown claim. A claim about the very address showing it needs no proof: whoever is showing it has
 * already proved, by signing their messages, that they are the one it is about.
 * @param {unknown} shown @param {string} audience
 * @param {string} [shownBy]  the address showing it, when that is known for certain
 * @returns {Promise<Claim | null>}
 */
export async function checkShown(shown, audience, shownBy) {
  const s = /** @type {any} */ (shown);
  const claim = await checkClaim(s?.claim);
  if (!claim) return null;
  if (shownBy && claim.about === shownBy) return claim;
  return await verify(claim.about, "show", `${audience}\n${claim.signed.sig}`, s.proof) ? claim : null;
}

/**
 * The second signature. The one a claim is about signs it too, which shows that both parties hold the
 * same claim: an agreement of sorts. It does not show that the claim is true, only that its subject has
 * seen it and put their name beside the issuer's.
 * @param {CryptoKeyPair} subjectKeys  the key the claim is about
 * @param {Envelope} claim
 * @returns {Promise<string>} the signature, to keep beside the claim as `{ claim, seen }`
 */
export function countersign(subjectKeys, claim) {
  return sign(subjectKeys.privateKey, "seen", claim.sig);
}

/**
 * Check a claim signed by both parties.
 * @param {unknown} both  `{ claim, seen }`
 * @returns {Promise<Claim | null>}
 */
export async function checkBoth(both) {
  const b = /** @type {any} */ (both);
  const claim = await checkClaim(b?.claim);
  if (!claim) return null;
  return await verify(claim.about, "seen", claim.signed.sig, b.seen) ? claim : null;
}
