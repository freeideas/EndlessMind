import { directRules } from "../shared/referee.js";

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
// The rules run in a worker inside the sandboxed frame, so rules stuck in an
// endless loop cannot freeze the page, and removing the frame stops them. The
// worker runs the same driver as the host program (directRules), inserted here
// as source text because sandboxed code cannot import the portal's files.
const RULES_BRIDGE = `
const directRules = ${directRules.toString()};
function startRules(send, listen) {
  let driver, nextStorageId = 0;
  const waiting = new Map();
  const report = e => send({type:"error", error:String(e?.stack || e)});
  function storageCall(op, key, value) {
    const storageId = ++nextStorageId;
    return new Promise((resolve, reject) => {
      waiting.set(storageId, {resolve, reject});
      send({type:"storage", storageId, op, key, value});
    });
  }
  const storage = { get: key => storageCall("get", key), put: (key, value) => storageCall("put", key, value) };
  listen(async m => {
    if (m.type === "stored") {
      const p = waiting.get(m.storageId); waiting.delete(m.storageId);
      if (p) m.error ? p.reject(new Error(m.error)) : p.resolve(m.value);
      return;
    }
    try {
      let value;
      if (m.type === "load") {
        const rules = (await import("data:text/javascript;base64," + btoa(unescape(encodeURIComponent(m.code))))).default;
        driver = await directRules(rules, storage, report);
        driver.onViews((views, checks) => send({type:"views", views, checks}));
        driver.onRemove((actor, reason) => send({type:"remove", actor, reason}));
        driver.onClaim((actor, says, days) => new Promise((resolve, reject) => {
          const storageId = ++nextStorageId;
          waiting.set(storageId, {resolve, reject});
          send({type:"claim", storageId, actor, says, days});
        }));
        driver.onGo((actor, link, carry) => send({type:"go", actor, link, carry}));
        driver.onNear((actor, link) => send({type:"near", actor, link}));
        driver.onRecommend((link, note) => new Promise((resolve, reject) => {
          const storageId = ++nextStorageId;
          waiting.set(storageId, {resolve, reject});
          send({type:"recommend", storageId, link, note});
        }));
        value = {rate: driver.ticksPerSecond, repeatable: driver.repeatable};
      } else if (m.type === "enter") value = await driver.enter(m.actor, m.character, m.claims);
      else if (m.type === "replay") value = driver.replay(m.check, m.me, m.adopt);
      else if (m.type === "resync") driver.resync(m.actor);
      else if (m.type === "act") driver.act(m.actor, m.action);
      else if (m.type === "leave") driver.leave(m.actor);
      else if (m.type === "seen") driver.seen(m.actor, m.both);
      else if (m.type === "step") driver.step();
      if (m.id) send({type:"reply", id:m.id, value});
    } catch (e) { m.id ? send({type:"reply", id:m.id, error:String(e)}) : report(e); }
  });
  send({type:"ready"});
}
`;
const RULES_WORKER = RULES_BRIDGE + "startRules(m => postMessage(m), fn => { onmessage = e => fn(e.data); });";
// "<" is written as an escape so the text can sit inside the frame's script element.
const RULES = `
const worker = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(RULES_WORKER).replaceAll("<", "\\u003c")}], {type:"text/javascript"})));
worker.onmessage = e => send(e.data);
worker.onerror = e => { e.preventDefault(); report(e.message || "The rules stopped with an error."); };
addEventListener("message", e => { if (e.source === parent) worker.postMessage(e.data); });
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
        onView(fn) { viewListener = fn; }, act(action) { send({type:'act',action}); },
        offer(link) { send({type:'offer', link: String(link).slice(0, 2048)}); }});
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
  /** @type {(views: Record<string, unknown>, checks?: Record<string, unknown>) => void} */
  let onViews = () => {};
  /** @type {(actor: string, reason: string) => void} */
  let onRemove = () => {};
  /** @type {(actor: string, says: unknown, days?: number) => Promise<unknown>} */
  let onClaim = () => Promise.resolve(null);
  /** @type {(actor: string, link: string, carry: unknown) => void} */
  let onGo = () => {};
  /** @type {(actor: string, link: string) => void} */
  let onNear = () => {};
  /** @type {(link: string, note: unknown) => Promise<unknown>} */
  let onRecommend = () => Promise.resolve(null);
  f.listen((m) => {
    if (m.type === "go") onGo(m.actor, m.link, m.carry);
    if (m.type === "near") onNear(m.actor, m.link);
    if (m.type === "recommend") {
      Promise.resolve().then(() => onRecommend(m.link, m.note)).then(
        (value) => f.post({ type: "stored", storageId: m.storageId, value }),
        (error) => f.post({ type: "stored", storageId: m.storageId, error: String(error) }),
      );
    }
    if (m.type === "views") onViews(m.views, m.checks);
    if (m.type === "remove") onRemove(m.actor, m.reason);
    if (m.type === "claim") {
      Promise.resolve().then(() => onClaim(m.actor, m.says, m.days)).then(
        (value) => f.post({ type: "stored", storageId: m.storageId, value }),
        (error) => f.post({ type: "stored", storageId: m.storageId, error: String(error) }),
      );
    }
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
    const loaded = await f.call({ type: "load", code });
    return {
      ticksPerSecond: Math.min(Math.max(Number(loaded.rate) || 10, 1), 60),
      repeatable: Boolean(loaded.repeatable),
      /** @param {string} actor */
      resync(actor) {
        f.post({ type: "resync", actor });
      },
      /** @param {unknown} check @param {string} me @param {boolean} adopt @returns {Promise<{ view: unknown, differs: boolean }>} */
      replay(check, me, adopt) {
        return f.call({ type: "replay", check, me, adopt });
      },
      /** @param {string} actor @param {unknown} character @param {unknown[]} [claims] */
      enter(actor, character, claims) {
        return f.call({ type: "enter", actor, character, claims });
      },
      /** @param {(actor: string, says: unknown, days?: number) => Promise<unknown>} fn */
      onClaim(fn) {
        onClaim = fn;
      },
      /** @param {(actor: string, link: string, carry: unknown) => void} fn */
      onGo(fn) {
        onGo = fn;
      },
      /** @param {(actor: string, link: string) => void} fn */
      onNear(fn) {
        onNear = fn;
      },
      /** @param {(link: string, note: unknown) => Promise<unknown>} fn */
      onRecommend(fn) {
        onRecommend = fn;
      },
      /** @param {string} actor @param {unknown} action */
      act(actor, action) {
        f.post({ type: "act", actor, action });
      },
      /** @param {string} actor */
      leave(actor) {
        f.post({ type: "leave", actor });
      },
      /** @param {string} actor @param {{ claim: unknown, seen: string }} both */
      seen(actor, both) {
        f.post({ type: "seen", actor, both });
      },
      step() {
        f.post({ type: "step" });
      },
      /** @param {(views: Record<string, unknown>, checks?: Record<string, unknown>) => void} fn */
      onViews(fn) {
        onViews = fn;
      },
      /** @param {(actor: string, reason: string) => void} fn */
      onRemove(fn) {
        onRemove = fn;
      },
      stop: f.stop,
    };
  } catch (e) {
    f.stop();
    throw e;
  }
}

/**
 * @param {HTMLElement} container @param {string} code @param {string} me @param {unknown} character @param {(action: unknown) => void} onAction
 * @param {AbortSignal} [signal] @param {(link: string) => void} [onOffer]  the renderer offers the actor a link, which the portal shows
 */
export async function startRenderer(container, code, me, character, onAction, signal, onOffer) {
  const f = makeFrame(container, RENDERER, true, signal);
  f.frame.className = "renderer";
  f.frame.setAttribute("allow", "fullscreen; gamepad");
  f.listen((m) => {
    if (m.type === "act") onAction(m.action);
    if (m.type === "offer" && typeof m.link === "string") onOffer?.(m.link);
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
