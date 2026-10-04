// The app's local storage: one IndexedDB database holding key pairs (which
// cannot be exported) and small records. Nothing here leaves the device.

const DB_NAME = "everygame";
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
  const store = (await db()).transaction(STORE, mode).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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

/** @param {string} key */
export function remove(key) {
  return run("readwrite", (s) => s.delete(key));
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
