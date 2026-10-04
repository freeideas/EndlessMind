// Offline exports: keys alone, or keys with locally held files and optional data.
import { checkAnnouncement, makeAnnouncement } from "../shared/announce.js";
import { addressOf, keyPairFromSecret } from "../shared/crypto.js";
import { bundleFiles, checkKeyFormat, encodeFile, KEY_FORMAT } from "../shared/bundle.js";
import { myCharacter } from "./character.js";
import { ownedRealm, ownedRealms } from "./realms.js";
import * as store from "./store.js";
import { record, restore } from "./claims.js";

/** @param {{files?: boolean, storage?: boolean}} [options] */
export async function saveKeys(options = {}) {
  const character = await myCharacter();
  const realms = [];
  for (const realm of await ownedRealms()) {
    if (options.files) {
      const listed =
        /** @type {import('../shared/announce.js').ManifestBody} */ (realm.manifest.body).files;
      for (const name of Object.keys(listed)) {
        if (!Object.hasOwn(realm.files ?? {}, name)) {
          throw new Error(
            `${realm.name} is missing local file ${name}. Save my keys still works. Choose its original helper server and Publish here to recover files before making a full backup.`,
          );
        }
      }
    }
    realms.push({
      secret: realm.secret,
      manifest: realm.manifest,
      ...(options.files
        ? {
          files: Object.fromEntries(
            Object.entries(realm.files ?? {}).map(([name, bytes]) => [name, encodeFile(bytes)]),
          ),
        }
        : {}),
      ...(options.storage ? { storage: await store.savedState(realm.address) } : {}),
    });
  }
  // The character's record of signed claims goes with its secret: they are useless to anyone else.
  const claims = (await record()).flatMap((r) => r.list);
  return JSON.stringify({ format: KEY_FORMAT, character, claims, realms }, null, 1);
}

/** Loading is local; publishing and hosting remain explicit actions. @param {string} text */
export async function loadKeys(text) {
  const file = JSON.parse(text);
  checkKeyFormat(file?.format);
  // Validate everything before changing local records.
  const prepared = [];
  for (const saved of Array.isArray(file.realms) ? file.realms : []) {
    const keys = await keyPairFromSecret(saved.secret);
    const address = await addressOf(keys.publicKey);
    const checked = await checkAnnouncement(await makeAnnouncement(keys, saved.manifest));
    if (!checked) throw new Error("A realm in this file does not match its key.");
    const old = await ownedRealm(address);
    const files = { ...old?.files, ...await bundleFiles(file, saved) };
    // Keep only files matching this version, including when importing keys alone.
    for (const name of Object.keys(files)) {
      if (
        /** @type {any} */ (old?.manifest.body)?.files?.[name] !== checked.manifest.files[name] &&
          !Object.hasOwn(saved.files ?? {}, name)
      ) delete files[name];
    }
    if (
      saved.storage !== undefined &&
      (!saved.storage || typeof saved.storage !== "object" || Array.isArray(saved.storage))
    ) throw new Error("Invalid realm storage.");
    prepared.push({
      realm: {
        address,
        name: checked.manifest.name,
        keys,
        secret: saved.secret,
        manifest: saved.manifest,
        files,
      },
      storage: saved.storage,
    });
  }
  if (file.character) await keyPairFromSecret(file.character.secret);
  for (const { realm, storage } of prepared) {
    await store.put("realm:" + realm.address, realm);
    for (const [key, value] of Object.entries(storage ?? {})) {
      await store.realmStorage(realm.address).put(key, value);
    }
  }
  if (file.character) {
    const info = file.character.info ?? {};
    await store.put("character", {
      secret: file.character.secret,
      info: {
        name: String(info.name ?? "Visitor").slice(0, 40),
        color: String(info.color ?? "#9cf").slice(0, 40),
        description: String(info.description ?? "").slice(0, 200),
      },
    });
  }
  if (file.character) await restore(file.claims, file.character.secret);
  return { character: Boolean(file.character), realms: prepared.length };
}
