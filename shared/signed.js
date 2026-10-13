// Signed JSON: sign-in notes and records, and the words a player adds to a record. See "Signed JSON"
// and "Records" in specs/PROTOCOL.md.

import { base64url, digest, fromBase64url, hex, sign, verify } from "./keys.js";

const NOTE_MAX = 500; // the most characters a player's own words on a record may have

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

/** The bytes every signer signs: the canonical JSON of everything except `sigs` and `notes`. @param {Record<string, unknown>} object */
export function signedBytes(object) {
  const { sigs: _, notes: _n, ...body } = object;
  return new TextEncoder().encode(canonical(body));
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

/**
 * The bytes a note's writer signs: they name the record by the SHA-256 of its signed bytes, so a note
 * belongs to one exact record.
 * @param {Record<string, any>} record
 * @param {string} text
 */
async function noteBytes(record, text) {
  const note = { v: 1, type: "note", record: hex(await digest("SHA-256", signedBytes(record))), text };
  return new TextEncoder().encode(canonical(note));
}

/**
 * Add a signer's own words to a record, in place of any they added before. Only their proof covers
 * them, and the record's proofs stay valid.
 * @param {Record<string, any>} record
 * @param {import("./keys.js").Signer} signer
 * @param {string} text at most 500 characters
 */
export async function addNote(record, signer, text) {
  if (typeof text !== "string" || !text || text.length > NOTE_MAX) throw new Error(`a note is 1 to ${NOTE_MAX} characters`);
  const sig = base64url(await sign(signer, await noteBytes(record, text)));
  return { ...record, notes: { ...(record.notes ?? {}), [signer.id]: { text, sig } } };
}

/**
 * The notes on a record that check out, by their writers' IDs: each written by one of the record's
 * signers, for this exact record. Any other note is left out.
 * @param {Record<string, any>} record
 * @returns {Promise<Record<string, { text: string, sig: string }>>}
 */
export async function validNotes(record) {
  /** @type {Record<string, { text: string, sig: string }>} */
  const ok = {};
  const notes = record.notes && typeof record.notes === "object" && !Array.isArray(record.notes) ? record.notes : {};
  for (const id of Array.isArray(record.signers) ? record.signers : []) {
    const note = Object.hasOwn(notes, id) ? notes[id] : null;
    if (!note || typeof note.text !== "string" || !note.text || note.text.length > NOTE_MAX || typeof note.sig !== "string") continue;
    try {
      if (await verify(id, fromBase64url(note.sig), await noteBytes(record, note.text))) ok[id] = { text: note.text, sig: note.sig };
    } catch {
      // Not readable, so not a note.
    }
  }
  return ok;
}
