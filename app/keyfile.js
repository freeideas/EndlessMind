// The key file: everything this browser holds keys for (the character and the
// realms it published), saved as one JSON file. A key is the object, wherever
// it is, so loading this file in any copy of the app, on any server, brings
// the character and the realms along. Realm files travel in it too, so a realm
// can be hosted from a server that has never seen it.
//
// The file is not locked with a passphrase: whoever gets it holds the keys.

import { checkAnnouncement, makeAnnouncement } from "../shared/announce.js";
import { addressOf, keyPairFromSecret } from "../shared/crypto.js";
import { parseStrictJson, utf8 } from "../shared/encoding.js";
import { myCharacter } from "./character.js";
import { announce, fetchFile, ownedRealms, upload } from "./realms.js";
import * as store from "./store.js";

const FORMAT = "emind-keys/0";

/** @returns {Promise<string>} the key file's text */
export async function saveKeys() {
  const character = await myCharacter();
  const realms = [];
  for (const realm of await ownedRealms()) {
    if (!realm.secret) continue;
    /** @type {Record<string, string>} */
    const files = {};
    const listed = /** @type {import("../shared/announce.js").ManifestBody} */ (realm.manifest.body).files;
    for (const [name, hash] of Object.entries(listed)) files[name] = await fetchFile(hash);
    realms.push({ secret: realm.secret, manifest: realm.manifest, files });
  }
  return JSON.stringify({
    format: FORMAT,
    character: character.secret ? { secret: character.secret, info: character.info } : undefined,
    realms,
  }, null, 1);
}

/**
 * Load a key file: take on its character, and host its realms from this server.
 * @param {string} text
 * @returns {Promise<{ character: boolean, realms: number }>} what was loaded
 */
export async function loadKeys(text) {
  // Longer than a message, so parse plainly; every part is checked below.
  const file = text.length <= 256 * 1024 ? /** @type {any} */ (parseStrictJson(text)) : JSON.parse(text);
  if (!file || file.format !== FORMAT) throw new Error("This is not an Endless Mind key file.");

  let realms = 0;
  for (const saved of Array.isArray(file.realms) ? file.realms : []) {
    const keys = await keyPairFromSecret(saved.secret);
    const address = await addressOf(keys.publicKey);
    // Checks the manifest's shape and that this key signed it.
    const checked = await checkAnnouncement(await makeAnnouncement(keys, saved.manifest));
    if (!checked) throw new Error("A realm in this file does not match its key.");
    for (const [name, hash] of Object.entries(checked.manifest.files)) {
      if (typeof saved.files?.[name] !== "string" || (await upload(name, utf8(saved.files[name]))) !== hash) {
        throw new Error(`The file ${name} of ${checked.manifest.name} is missing or changed.`);
      }
    }
    const realm = { address, name: checked.manifest.name, keys, secret: saved.secret, manifest: saved.manifest };
    await announce(realm);
    await store.put("realm:" + address, realm);
    realms++;
  }

  if (file.character) {
    const keys = await keyPairFromSecret(file.character.secret);
    const info = file.character.info ?? {};
    await store.put("character", {
      address: await addressOf(keys.publicKey),
      keys,
      secret: file.character.secret,
      info: {
        name: String(info.name ?? "Visitor").slice(0, 40),
        color: String(info.color ?? "#9cf").slice(0, 40),
        description: String(info.description ?? "").slice(0, 200),
      },
    });
  }
  return { character: Boolean(file.character), realms };
}
