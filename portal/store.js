// The portal's local storage: one IndexedDB database holding the character, the
// realms this browser has keys for, and their keys. Clearing the site's data
// clears it, which is why the portal offers "Save my keys" (keyfile.js).

const DB_NAME = "endlessmind";
const STORE = "things";

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/**
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} action
 * @returns {Promise<T>}
 */
async function run(mode, action) {
  const transaction = (await db()).transaction(STORE, mode);
  const store = transaction.objectStore(STORE);
  return new Promise((resolve, reject) => {
    const request = action(store);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error ?? new Error("Storage write aborted"));
    transaction.onerror = () => reject(transaction.error);
  });
}

/** @param {string} key @returns {Promise<any>} */
export function get(key) {
  return run("readonly", (s) => s.get(key));
}

/** @param {string} key @param {unknown} value */
export function put(key, value) {
  return run("readwrite", (s) => s.put(value, key));
}

/**
 * A realm's optional JSON storage.
 * @param {string} address
 * @param {boolean} [bounded]  for rules the actor did not choose to host (a realm played alone): at most
 *   64 values of 256 KB each, so a stranger's rules cannot fill the storage the actor's keys live in
 */
export function realmStorage(address, bounded = false) {
  const prefix = `state:${address}:`;
  return {
    /** @param {string} key */
    async get(key) { return (await get(prefix + key))?.value; },
    /** @param {string} key @param {unknown} value */
    async put(key, value) {
      const text = JSON.stringify(value);
      if (bounded) {
        if (text.length > 256 * 1024 || key.length > 200) throw new Error("Too large to save for a realm played alone.");
        const kept = await list(prefix);
        if (kept.length >= 64 && !kept.some((entry) => entry.key === key)) throw new Error("A realm played alone may save at most 64 values.");
      }
      return put(prefix + key, { key, value: JSON.parse(text) });
    },
  };
}

/** @param {string} address */
export async function savedState(address) {
  return Object.fromEntries((await list(`state:${address}:`)).map((entry) => [entry.key, entry.value]));
}

/** @param {string} prefix @returns {Promise<any[]>} */
export async function list(prefix) {
  const range = IDBKeyRange.bound(prefix, prefix + "￿");
  return run("readonly", (s) => s.getAll(range));
}

/** Ask the browser not to clear this site's storage when space runs low. */
export async function askToPersist() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* not supported: fine */ }
}
