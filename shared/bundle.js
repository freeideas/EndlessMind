// Portable local backups. Files are bytes, encoded as base64 only in JSON.
import { hashOf } from "./crypto.js";
import { utf8 } from "./encoding.js";

export const KEY_FORMAT = "emind-keys/1";

/** @param {Uint8Array} bytes */
export function encodeFile(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(text);
}

/** @param {string} text */
export function decodeFile(text) {
  return Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
}

/** Read old text backups as well as byte-preserving backups. @param {any} file @param {any} entry */
export async function bundleFiles(file, entry) {
  /** @type {Record<string, Uint8Array<ArrayBuffer>>} */
  const files = {};
  for (const [name, value] of Object.entries(entry.files ?? {})) {
    if (typeof value !== "string") throw new Error(`Invalid file: ${name}`);
    const bytes = file.format === KEY_FORMAT ? decodeFile(value) : utf8(value);
    if (await hashOf(bytes) !== entry.manifest.body.files[name]) {
      throw new Error(`Changed file: ${name}`);
    }
    Object.defineProperty(files, name, { value: bytes, enumerable: true });
  }
  return files;
}

/** @param {unknown} format */
export function checkKeyFormat(format) {
  if (format !== KEY_FORMAT && format !== "emind-keys/0") {
    throw new Error("This is not an Endless Mind key file.");
  }
}
