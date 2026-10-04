// Runs foreign code (a realm's rules, a renderer) in sandboxed frames.
//
// Each frame has a blank, unique origin (sandbox="allow-scripts" without
// allow-same-origin), so the code inside cannot read this app's storage or
// keys, cannot reach other frames, and (by its content security policy) cannot
// open network connections. The app page's own policy (frame-src 'none', in
// index.html) stops a frame from navigating itself to a web address, which
// would otherwise hand it the network. It talks to the app only through postMessage.
// The calls available inside are the runtime interface in specs/RUNTIME.md.

const POLICY = "default-src 'none'; script-src 'unsafe-inline' blob: data:; " +
  "style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:";

// Shared by both kinds of frame: load an ES module from text.
const LOADER = `
async function loadModule(code) {
  try {
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    return (await import(url)).default;
  } catch (first) {
    try {
      return (await import("data:text/javascript;base64," + btoa(unescape(encodeURIComponent(code))))).default;
    } catch {
      throw first;
    }
  }
}
function report(error) {
  parent.postMessage({ type: "error", error: String(error && error.stack || error) }, "*");
}
addEventListener("error", (e) => report(e.error || e.message));
addEventListener("unhandledrejection", (e) => report(e.reason));
`;

// The rules frame keeps the realm's state and players; the app sends it events.
const RULES_FRAME = `
let rules, state;
const players = new Set();
const send = (m) => parent.postMessage(m, "*");
addEventListener("message", async (e) => {
  if (e.source !== parent) return;
  const m = e.data;
  try {
    if (m.type === "load") {
      rules = await loadModule(m.code);
      state = rules.init ? rules.init({ seed: m.seed }) : {};
      send({ type: "loaded", ticksPerSecond: rules.ticksPerSecond || 10 });
    } else if (m.type === "enter") {
      const verdict = rules.enter ? rules.enter(state, m.player, m.character) : true;
      if (verdict === true || verdict === undefined) players.add(m.player);
      send({ type: "entered", id: m.id, ok: verdict === true || verdict === undefined,
             reason: typeof verdict === "string" ? verdict : undefined });
    } else if (m.type === "act") {
      if (players.has(m.player) && rules.act) rules.act(state, m.player, m.action);
    } else if (m.type === "leave") {
      if (players.delete(m.player) && rules.leave) rules.leave(state, m.player);
    } else if (m.type === "step") {
      if (rules.tick) rules.tick(state);
      const views = {};
      for (const p of players) views[p] = rules.view ? rules.view(state, p) : state;
      send({ type: "views", views });
    }
  } catch (error) { report(error); }
});
send({ type: "ready" });
`;

// The renderer frame draws views and turns player input into actions.
const RENDERER_FRAME = `
let viewListener = () => {};
addEventListener("message", async (e) => {
  if (e.source !== parent) return;
  const m = e.data;
  try {
    if (m.type === "load") {
      const renderer = await loadModule(m.code);
      renderer.start(document.body, {
        me: m.me,
        character: m.character,
        onView(fn) { viewListener = fn; },
        act(action) { parent.postMessage({ type: "act", action }, "*"); },
      });
      parent.postMessage({ type: "loaded" }, "*");
    } else if (m.type === "view") {
      viewListener(m.view);
    }
  } catch (error) { report(error); }
});
parent.postMessage({ type: "ready" }, "*");
`;

/** @param {string} script */
function frameDocument(script) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000;color:#eee;font-family:system-ui,sans-serif}</style>
</head><body><script type="module">${LOADER}${script}</script></body></html>`;
}

/**
 * @param {HTMLElement} container
 * @param {string} script
 * @param {boolean} visible
 */
function makeFrame(container, script, visible) {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.srcdoc = frameDocument(script);
  if (!visible) frame.style.display = "none";
  container.append(frame);
  /** @type {(m: any) => void} */
  let onMessage = () => {};
  const ready = new Promise((resolve) => {
    window.addEventListener("message", (e) => {
      if (e.source !== frame.contentWindow) return;
      if (e.data?.type === "ready") resolve(undefined);
      else if (e.data?.type === "error") console.error("[sandboxed code]", e.data.error);
      else onMessage(e.data);
    });
  });
  return {
    frame,
    ready,
    /** @param {(m: any) => void} fn */
    listen(fn) {
      onMessage = fn;
    },
    /** @param {unknown} m */
    post(m) {
      frame.contentWindow?.postMessage(m, "*");
    },
  };
}

/**
 * A realm's rules, running in a hidden sandbox. Used by the referee.
 * @param {HTMLElement} container
 * @param {string} code
 */
export async function startRules(container, code) {
  const f = makeFrame(container, RULES_FRAME, false);
  await f.ready;
  /** @type {Map<number, (r: {ok: boolean, reason?: string}) => void>} */
  const waiting = new Map();
  let nextId = 1;
  /** @type {(views: Record<string, unknown>) => void} */
  let onViews = () => {};
  /** @type {(v: number) => void} */
  let loaded = () => {};
  const loadedPromise = new Promise((resolve) => (loaded = resolve));
  f.listen((m) => {
    if (m.type === "loaded") loaded(m.ticksPerSecond);
    else if (m.type === "entered") waiting.get(m.id)?.(m), waiting.delete(m.id);
    else if (m.type === "views") onViews(m.views);
  });
  f.post({ type: "load", code, seed: Math.floor(Math.random() * 2 ** 31) });
  const ticksPerSecond = await loadedPromise;
  return {
    ticksPerSecond: Math.min(Math.max(Number(ticksPerSecond) || 10, 1), 60),
    /** @param {string} player @param {unknown} character @returns {Promise<{ok: boolean, reason?: string}>} */
    enter(player, character) {
      const id = nextId++;
      const result = new Promise((resolve) => waiting.set(id, resolve));
      f.post({ type: "enter", id, player, character });
      return /** @type {Promise<{ok: boolean, reason?: string}>} */ (result);
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
    stop() {
      f.frame.remove();
    },
  };
}

/**
 * A renderer, running in a visible sandbox.
 * @param {HTMLElement} container
 * @param {string} code
 * @param {string} me the player's address
 * @param {unknown} character
 * @param {(action: unknown) => void} onAction
 */
export async function startRenderer(container, code, me, character, onAction) {
  const f = makeFrame(container, RENDERER_FRAME, true);
  f.frame.className = "renderer";
  f.frame.setAttribute("allow", "fullscreen; gamepad");
  await f.ready;
  f.listen((m) => {
    if (m.type === "act") onAction(m.action);
  });
  f.post({ type: "load", code, me, character });
  f.frame.focus();
  return {
    /** @param {unknown} view */
    show(view) {
      f.post({ type: "view", view });
    },
    focus() {
      f.frame.focus();
    },
    stop() {
      f.frame.remove();
    },
  };
}
