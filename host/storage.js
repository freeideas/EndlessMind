// Realm-owned JSON data, kept beside the host's key file. Writes replace a
// complete file atomically; realm code decides what and when to save.

/** @param {string} path @param {Record<string, unknown>} [initial] */
export async function fileStorage(path, initial = {}) {
  let values = initial;
  try {
    values = JSON.parse(await Deno.readTextFile(path));
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  let queue = Promise.resolve();
  return {
    /** @param {string} key */
    async get(key) {
      await queue;
      return Object.hasOwn(values, key) ? structuredClone(values[key]) : undefined;
    },
    /** @param {string} key @param {unknown} value */
    put(key, value) {
      const copy = JSON.parse(JSON.stringify(value));
      const write = queue.then(async () => {
        const next = { ...values, [key]: copy };
        const temp = `${path}.${crypto.randomUUID()}.tmp`;
        try {
          await Deno.writeTextFile(temp, JSON.stringify(next), { mode: 0o600 });
          await Deno.rename(temp, path);
          values = next;
        } finally {
          await Deno.remove(temp).catch(() => {});
        }
      });
      queue = write.catch(() => {});
      return write;
    },
    async snapshot() {
      await queue;
      return structuredClone(values);
    },
  };
}
