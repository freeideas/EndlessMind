// Signed JSON: notes and records. See "Signed JSON" in specs/PROTOCOL.md.

import { base64url, fromBase64url, sign, verify } from "./keys.js";

const enc = new TextEncoder();

/** JSON with object keys sorted at every level and no spaces; numbers must be integers. @param {unknown} value @returns {string} */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("numbers must be integers");
  return JSON.stringify(value);
}

/** The bytes every signer signs: the canonical JSON of everything except `sigs`. @param {Record<string, unknown>} object */
export function signedBytes(object) {
  const { sigs: _, ...body } = object;
  return enc.encode(canonical(body));
}

/**
 * Add one signature to a note or record, keeping any signatures it already has.
 * @param {Record<string, any>} object
 * @param {import("./keys.js").Signer} signer
 */
export async function addSignature(object, signer) {
  const sig = base64url(await sign(signer, signedBytes(object)));
  return { ...object, sigs: { ...(object.sigs ?? {}), [signer.id]: sig } };
}

/**
 * The IDs whose signatures on this object are valid.
 * @param {Record<string, any>} object
 */
export async function validSigners(object) {
  const bytes = signedBytes(object);
  const ok = [];
  for (const [id, sig] of Object.entries(object.sigs ?? {})) {
    if (typeof sig === "string" && (await verify(id, fromBase64url(sig), bytes))) ok.push(id);
  }
  return ok;
}

/** A record is complete when every ID in `signers` has validly signed it. @param {Record<string, any>} record */
export async function isComplete(record) {
  if (!Array.isArray(record.signers) || record.signers.length === 0) return false;
  const ok = await validSigners(record);
  return record.signers.every((/** @type {string} */ id) => ok.includes(id));
}
