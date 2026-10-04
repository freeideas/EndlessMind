// Foreign code has its own blank origin. Only rules receive realm-local storage.
const POLICY =
  "default-src 'none'; script-src 'unsafe-inline' blob: data:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:";
const LOADER = `
async function loadModule(code) {
  return (await import('data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(code))))).default;
}
const send = m => parent.postMessage(m, '*');
const report = e => send({type:'error', error:String(e?.stack || e)});
addEventListener('error', e => report(e.error || e.message));
addEventListener('unhandledrejection', e => report(e.reason));
`;
const RULES = `
let rules, state, nextStorageId = 0;
const players = new Set(), waiting = new Map();
function storageCall(op, key, value) {
  const storageId = ++nextStorageId;
  return new Promise((resolve, reject) => {
    waiting.set(storageId, {resolve,reject});
    send({type:'storage', storageId, op, key, value});
  });
}
const storage = { get: key => storageCall('get', key), put: (key,value) => storageCall('put',key,value) };
async function handle(m) {
  if (m.type === 'load') {
    rules = await loadModule(m.code);
    state = rules.init ? await rules.init({seed:m.seed, storage}) : {};
    return rules.ticksPerSecond || 10;
  }
  if (m.type === 'enter') {
    const verdict = rules.enter ? await rules.enter(state,m.player,m.character) : true;
    const ok = verdict === true || verdict === undefined;
    if (ok) players.add(m.player);
    return {ok, reason:typeof verdict === 'string' ? verdict : undefined};
  }
  if (m.type === 'act' && players.has(m.player) && rules.act) await rules.act(state,m.player,m.action);
  if (m.type === 'leave' && players.delete(m.player) && rules.leave) await rules.leave(state,m.player);
  if (m.type === 'step') {
    if (rules.tick) await rules.tick(state);
    send({type:'views', views:Object.fromEntries([...players].map(p => [p, rules.view ? rules.view(state,p) : state]))});
  }
}
let stepping = false;
addEventListener('message', async e => {
  if (e.source !== parent) return;
  const m = e.data;
  if (m.type === 'stored') {
    const p = waiting.get(m.storageId); waiting.delete(m.storageId);
    if (p) m.error ? p.reject(new Error(m.error)) : p.resolve(m.value);
    return;
  }
  if (m.type === 'step' && stepping) return;
  if (m.type === 'step') stepping = true;
  try { const value = await handle(m); if (m.id) send({type:'reply', id:m.id, value}); }
  catch (e) { m.id ? send({type:'reply', id:m.id, error:String(e)}) : report(e); }
  finally { if (m.type === 'step') stepping = false; }
});
send({type:'ready'});
`;
const RENDERER = `
let viewListener = () => {};
addEventListener('message', async e => {
  if (e.source !== parent) return;
  const m = e.data;
  try {
    if (m.type === 'load') {
      const renderer = await loadModule(m.code);
      await renderer.start(document.body, {me:m.me, character:m.character,
        onView(fn) { viewListener = fn; }, act(action) { send({type:'act',action}); }});
      send({type:'reply', id:m.id});
    } else if (m.type === 'view') viewListener(m.view);
  } catch (e) { m.id ? send({type:'reply',id:m.id,error:String(e)}) : report(e); }
});
send({type:'ready'});
`;

/** @param {HTMLElement} container @param {string} script @param {boolean} visible @param {AbortSignal} [signal] */
function makeFrame(container, script, visible, signal) {
  signal?.throwIfAborted();
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.srcdoc =
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLICY}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden;background:#000;color:#eee;font-family:system-ui,sans-serif}</style></head><body><script type="module">${LOADER}${script}</script></body></html>`;
  frame.hidden = !visible;
  let stopped = false, nextId = 0;
  /** @type {Map<number, {resolve: (v: any) => void, reject: (e: Error) => void}>} */
  const waiting = new Map();
  /** @type {(m: any) => void} */
  let onMessage = () => {};
  /** @param {number} id */
  function promise(id) {
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
    });
  }
  const ready = promise(0);
  function stop() {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("message", receive);
    signal?.removeEventListener("abort", stop);
    frame.remove();
    for (const p of waiting.values()) {
      p.reject(new Error("Realm closed"));
    }
    waiting.clear();
  }
  function receive(/** @type {MessageEvent} */ e) {
    if (e.source !== frame.contentWindow) return;
    const m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "ready" || m.type === "reply") {
      const id = m.type === "ready" ? 0 : m.id;
      const p = waiting.get(id);
      if (p) {
        waiting.delete(id);
        m.error ? p.reject(new Error(m.error)) : p.resolve(m.value);
      }
    } else if (m.type === "error") console.error("[realm]", m.error);
    else onMessage(m);
  }
  window.addEventListener("message", receive);
  signal?.addEventListener("abort", stop, { once: true });
  container.append(frame);
  const post = (/** @type {unknown} */ m) => {
    if (!stopped) frame.contentWindow?.postMessage(m, "*");
  };
  return {
    frame,
    ready,
    post,
    stop,
    /** @param {(m: any) => void} fn */
    listen(fn) {
      onMessage = fn;
    },
    /** @param {Record<string, unknown>} m */
    call(m) {
      if (stopped) return Promise.reject(new Error("Realm closed"));
      const id = ++nextId, result = promise(id);
      post({ ...m, id });
      return result;
    },
  };
}

/** @param {HTMLElement} container @param {string} code @param {import('../shared/referee.js').RealmStorage} storage @param {AbortSignal} [signal] */
export async function startRules(container, code, storage, signal) {
  const f = makeFrame(container, RULES, false, signal);
  /** @type {(views: Record<string, unknown>) => void} */
  let onViews = () => {};
  f.listen((m) => {
    if (m.type === "views") onViews(m.views);
    if (m.type === "storage") {
      (async () => {
        if (typeof m.key !== "string") throw new Error("Storage keys must be strings.");
        if (m.op === "get") return await storage.get(m.key);
        if (m.op === "put") return await storage.put(m.key, m.value);
        throw new Error("Unknown storage operation");
      })().then(
        (value) => f.post({ type: "stored", storageId: m.storageId, value }),
        (error) => f.post({ type: "stored", storageId: m.storageId, error: String(error) }),
      );
    }
  });
  try {
    await f.ready;
    const rate = await f.call({ type: "load", code, seed: Math.floor(Math.random() * 2 ** 31) });
    return {
      ticksPerSecond: Math.min(Math.max(Number(rate) || 10, 1), 60),
      /** @param {string} player @param {unknown} character */
      enter(player, character) {
        return f.call({ type: "enter", player, character });
      },
      /** @param {string} player @param {unknown} action */
      act(player, action) {
        f.post({ type: "act", player, action });
      },
      /** @param {string} player */
      leave(player) {
        f.post({ type: "leave", player });
      },
      step() {
        f.post({ type: "step" });
      },
      /** @param {(views: Record<string, unknown>) => void} fn */
      onViews(fn) {
        onViews = fn;
      },
      stop: f.stop,
    };
  } catch (e) {
    f.stop();
    throw e;
  }
}

/** @param {HTMLElement} container @param {string} code @param {string} me @param {unknown} character @param {(action: unknown) => void} onAction @param {AbortSignal} [signal] */
export async function startRenderer(container, code, me, character, onAction, signal) {
  const f = makeFrame(container, RENDERER, true, signal);
  f.frame.className = "renderer";
  f.frame.setAttribute("allow", "fullscreen; gamepad");
  f.listen((m) => {
    if (m.type === "act") onAction(m.action);
  });
  try {
    await f.ready;
    await f.call({ type: "load", code, me, character });
    f.frame.focus();
    return {
      /** @param {unknown} view */
      show(view) {
        f.post({ type: "view", view });
      },
      stop: f.stop,
    };
  } catch (e) {
    f.stop();
    throw e;
  }
}
