// The reference Endless Mind app: the page players open. It keeps the player's
// keys and character, finds and publishes realms, and runs realms and
// renderers in sandboxes. Its menu ("More realms") is always there, outside
// any realm's control.

import { myCharacter, updateCharacter } from "./character.js";
import { exampleFiles, ownedRealms, publish, publishOwned, search, serverOrigin } from "./realms.js";
import { play, startHosting, startRoom } from "./session.js";
import { loadKeys, saveKeys } from "./keyfile.js";
import { askToPersist, get, list, put } from "./store.js";
import { record } from "./claims.js";

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @type {ReturnType<typeof setTimeout> | undefined} */
let statusTimer;
/** @param {string} text @param {number} [ms] */
function status(text, ms = 5000) {
  const el = $("status");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove("show"), ms);
}

/** @param {string} tag @param {Record<string, string>} [attrs] @param {(Node | string)[]} [children] */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/**
 * A link people can share. The key names the realm but says nothing about
 * where it is, so the link carries a hint: the server it is announced on.
 * @param {string} address @param {string} [release] @param {string | string[]} [origin] one server, or all that are known
 */
function realmLink(address, release, origin = selectedServer) {
  const via = [origin].flat().map(encodeURIComponent).join(",");
  return `${location.origin}/#emind:${address}?via=${via}` + (release ? `&release=${release}` : "");
}

/** @param {string} text */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    status("Link copied.");
  } catch {
    prompt("Copy this link:", text);
  }
}

/** Replace the page with an explanation and stop. @param {string} title @param {string} html */
function cannotRun(title, html) {
  document.body.innerHTML = `<main style="padding:16px;max-width:640px"><h2>${title}</h2><p>${html}</p></main>`;
  throw new Error(title);
}

if (!globalThis.crypto?.subtle) {
  cannotRun("This page needs a secure connection", `Browsers only allow the key functions Endless Mind uses on
    <b>https</b> addresses or on <b>localhost</b>. Open this server through https, or on the computer running it.
    See <code>specs/RUNNING.md</code> in the Endless Mind repository.`);
}
// Having Web Crypto does not mean having Ed25519 keys, so test the exact operation.
const ed25519Works = await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])
  .then(() => true, () => false);
if (!ed25519Works) {
  cannotRun("This browser is too old", `Endless Mind needs Ed25519 keys, which arrived in Chrome and Edge 137,
    Firefox 129 and Safari 17. Please update your browser, or try another one.`);
}

askToPersist();
const character = await myCharacter();
let selectedServer = await get("server") ?? location.origin;
/** Realms and rooms this tab referees. @type {Map<string, {server: string, stop: () => void, room?: string}>} */
const hosts = new Map();
const starting = new Set();
/** @type {AbortController | undefined} */
let visiting;

function showMe() {
  const me = $("me");
  me.replaceChildren(el("i", { style: `background:${character.info.color}` }), character.info.name);
}

/** @param {string} [tag] */
async function showSearch(tag) {
  const list = $("search-results");
  let realms;
  try { realms = await search(tag, selectedServer); }
  catch { list.replaceChildren(el("li", {}, ["Cannot reach this helper server. Your keys and realms are still here."])); return; }
  list.replaceChildren(...(realms.length ? realms : []).map((r) =>
    el("li", {}, [
      el("span", { class: r.online ? "dot on" : "dot", title: r.online ? "Referee online" : "Referee offline" }),
      el("a", { href: realmLink(r.address) }, [r.alone ? `${r.name} (play alone)` : r.name]),
      el("span", { class: "tags" }, [r.tags.join(", ")]),
    ])
  ));
  if (!realms.length) list.append(el("li", {}, ["No realms found on this server yet."]));
}

async function showOwned() {
  const list = $("owned");
  const realms = await ownedRealms();
  list.replaceChildren(...realms.map((r) => {
    const copyButton = el("button", {}, ["Copy link"]);
    const targetServer = hosts.get(r.address)?.server ?? selectedServer;
    copyButton.onclick = () => copy(realmLink(r.address, undefined, targetServer));
    const hostButton = /** @type {HTMLButtonElement} */ (el("button", {class:"host-toggle"}, [hosts.has(r.address) ? "Stop hosting" : "Start hosting"]));
    hostButton.disabled = starting.has(r.address) || !/** @type {any} */ (r.manifest.body).main;
    hostButton.onclick = async () => {
      if (hosts.has(r.address)) { hosts.get(r.address)?.stop(); return; }
      starting.add(r.address); hostButton.disabled = true;
      try {
        const server = selectedServer;
        const host = await startHosting(r, server, $("hosts"), status, () => { hosts.delete(r.address); showOwned(); });
        hosts.set(r.address, { ...host, server });
        status(`Hosting ${r.name}. You can visit other realms while this tab stays open.`, 8000);
      } catch (e) { status(String(e), 8000); }
      finally { starting.delete(r.address); await showOwned(); }
    };
    const publishButton = el("button", {class:"republish"}, ["Publish here"]);
    publishButton.onclick = async () => {
      try { await publishOwned(r, selectedServer); status(`Published ${r.name}.`); await showSearch(); }
      catch (e) { status(String(e), 8000); }
    };
    return el("li", {"data-address":r.address}, [el("a", { href: realmLink(r.address, undefined, targetServer) }, [r.name]), hostButton, publishButton, copyButton]);
  }));
  for (const [address, host] of hosts) {
    if (!host.room) continue;
    const stopButton = el("button", { class: "host-toggle" }, ["End room"]);
    stopButton.onclick = () => host.stop();
    const copyButton = el("button", {}, ["Copy link"]);
    copyButton.onclick = () => copy(realmLink(address, undefined, host.server));
    list.append(el("li", { "data-address": address }, [el("a", { href: realmLink(address, undefined, host.server) }, [`${host.room} (room)`]), stopButton, copyButton]));
  }
  if (!list.children.length) list.append(el("li", {}, ["None yet."]));
}

/** The player's record: what realms have signed about this character. */
async function showRecord() {
  const list = $("record");
  const all = (await record()).filter((r) => r.list.length);
  list.replaceChildren(...all.flatMap((r) => r.list.map((signed) => {
    const body = /** @type {any} */ (signed.body);
    const says = typeof body.says === "string" ? body.says : JSON.stringify(body.says);
    const until = body.expires ? `, until ${new Date(body.expires).toLocaleDateString()}` : "";
    return el("li", {}, [el("span", {}, [says]), el("span", { class: "tags" }, [`from ${r.realm.slice(0, 16)}...${until}`])]);
  })));
  if (!all.length) list.append(el("li", {}, ["Nothing yet. Realms can sign what you do in them, and you choose where to show it."]));
}

$("forget-showing").onclick = async () => {
  for (const kept of await list("show:")) await put("show:" + kept.address, undefined);
  status("Forgotten. Realms that ask to see your claims will be asked about again.");
};

async function showHome() {
  $("realm").hidden = true;
  $("home").hidden = false;
  $("copy-link").hidden = true;
  $("copy-version-link").hidden = true;
  $("play-alone").hidden = true;
  $("start-room").hidden = true;
  $("more-realms").hidden = true;
  $("realm-name").textContent = "";
  /** @type {HTMLInputElement} */ ($("server-address")).value = selectedServer;
  /** @type {HTMLInputElement} */ ($("char-name")).value = character.info.name;
  /** @type {HTMLInputElement} */ ($("char-desc")).value = character.info.description;
  /** @type {HTMLInputElement} */ ($("char-color")).value = toHexColor(character.info.color);
  /** @type {HTMLInputElement} */ ($("char-private")).checked = Boolean(await get("private"));
  await Promise.all([showSearch(), showOwned(), showRecord()]);
}

/** @type {Awaited<ReturnType<typeof play>> | null} */
let current = null;
const ENTERING = "emind-entering";
function entering() {
  try { return sessionStorage.getItem(ENTERING); } catch { return null; }
}
/** @param {string} [address] */
function noteEntering(address) {
  try { address ? sessionStorage.setItem(ENTERING, address) : sessionStorage.removeItem(ENTERING); } catch { /* no storage: no guard */ }
}
addEventListener("pagehide", () => noteEntering());

/** @param {string} address @param {string} [release] @param {string[]} [via] servers the link hints at */
async function showRealm(address, release, via = []) {
  const controller = new AbortController();
  visiting = controller;
  // A renderer stuck in an endless loop can freeze the page, and reloading
  // would open the same realm again. So the app notes which realm it is in and
  // clears the note when leaving; finding the note still there means the last
  // visit did not end cleanly, and the player is asked before going back in.
  if (entering() === address) {
    $("home").hidden = true;
    $("realm").hidden = false;
    $("more-realms").hidden = false;
    const again = el("button", { id: "open-anyway" }, ["Open it anyway"]);
    again.onclick = route;
    $("stage").replaceChildren(el("p", { style: "padding:16px" }, [
      "This realm did not close cleanly last time. It may have frozen the page. ", again,
    ]));
    return;
  }
  noteEntering(address);
  // The link's hints first, then servers this app remembers for the realm, then the chosen server.
  /** @type {string[]} */
  let servers = [];
  for (const hint of [...via, ...(await get("servers:" + address).catch(() => []) ?? []), selectedServer]) {
    try { servers.push(serverOrigin(hint)); } catch { /* ignore a malformed hint */ }
  }
  servers = [...new Set(servers)];
  let server = servers[0];
  if (controller.signal.aborted) return;
  $("home").hidden = true;
  $("realm").hidden = false;
  $("copy-link").hidden = false;
  $("copy-version-link").hidden = false;
  $("play-alone").hidden = true;
  $("start-room").hidden = true;
  $("more-realms").hidden = false;
  $("realm-name").textContent = "";
  $("copy-link").onclick = () => copy(realmLink(address, undefined, servers));
  $("copy-version-link").onclick = () => current && copy(realmLink(address, current.release, servers));
  const stage = $("stage");
  stage.replaceChildren();
  try {
    const opened = current = await play(address, character, stage, { status, servers, release, signal:controller.signal,
      // The player answers once for each realm whose claims are asked for, and is asked again
      // whenever this realm starts asking for another.
      mayShow: async (name, realms) => {
        /** @type {{ address: string, answers: Record<string, boolean> }} */
        const kept = await get("show:" + address) ?? { address, answers: {} };
        const fresh = realms.filter((r) => !(r in kept.answers));
        if (fresh.length) {
          const answer = confirm(`${name} asks to see what is said of you in ${fresh.length} other realm(s) you have played:\n${fresh.join("\n")}\nShowing your signed claims tells it which player you are in those realms. Show them?`);
          for (const r of fresh) kept.answers[r] = answer;
          await put("show:" + address, kept);
        }
        return realms.filter((r) => kept.answers[r]);
      } });
    $("realm-name").textContent = opened.name;
    ({ server, servers } = opened);
    // Public rules need no referee: anyone may run their own copy, or referee a room for friends.
    $("play-alone").hidden = !opened.alone || opened.alone === address;
    $("play-alone").onclick = () => { location.hash = `emind:${opened.alone}?via=${encodeURIComponent(server)}`; };
    const source = "source" in opened ? opened.source : undefined;
    $("start-room").hidden = !source;
    $("start-room").onclick = async () => {
      if (!source) return;
      try {
        const room = await startRoom(source, server, $("hosts"), status, () => { hosts.delete(room.address); showOwned(); });
        hosts.set(room.address, { stop: room.stop, server, room: opened.name });
        location.hash = `emind:${room.address}?via=${encodeURIComponent(server)}`;
        status("Room started. Copy its link to invite others. It lasts while this tab stays open.", 8000);
      } catch (e) { status(String(e), 8000); }
    };
  } catch (error) {
    if (controller.signal.aborted) return;
    const message = el("p", { style: "padding:16px" }, [String(/** @type {Error} */ (error).message ?? error)]);
    if (/** @type {any} */ (error).code === "release-changed") {
      message.append(" ", el("a", { href: realmLink(address, undefined, server) }, ["Open the current version"]));
    }
    const app = /** @type {any} */ (error).app;
    if (app) {
      // Only the https address the realm's own key signed, and only as a link the player chooses to follow.
      message.append(` It is played in its own app, ${app.name}: `, el("a", { href: app.url, rel: "noopener" }, [app.url]),
        ". A program you install runs outside any sandbox and can do anything on your computer, so get it only if you trust this realm's maker.");
    }
    stage.replaceChildren(message);
  }
}

async function route() {
  // Leaving a realm the ordinary way clears the note; a fresh page load keeps it.
  if (visiting) noteEntering();
  visiting?.abort();
  current?.stop();
  current = null;
  let hash = location.hash.slice(1);
  if (!hash.startsWith("emind:") && !hash.startsWith("web+emind:")) {
    try { hash = decodeURIComponent(hash); } catch { hash = ""; }
  }
  const match = hash.match(/^(?:web\+)?emind:([a-z0-9-]+)(?:\?(.*))?$/);
  const query = new URLSearchParams(match?.[2] ?? "");
  if (match) await showRealm(match[1], query.get("release") ?? undefined, query.get("via")?.split(",") ?? []).catch(e => status(String(e)));
  else await showHome();
}

/** @param {string} color */
function toHexColor(color) {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return "#888888";
  probe.fillStyle = color;
  return probe.fillStyle.startsWith("#") ? probe.fillStyle : "#888888";
}

$("char-private").onchange = (e) => put("private", /** @type {HTMLInputElement} */ (e.target).checked);

$("character-form").onsubmit = async (e) => {
  e.preventDefault();
  const updated = await updateCharacter({
    name: /** @type {HTMLInputElement} */ ($("char-name")).value.trim() || character.info.name,
    description: /** @type {HTMLInputElement} */ ($("char-desc")).value.trim(),
    color: /** @type {HTMLInputElement} */ ($("char-color")).value,
  });
  character.info = updated.info;
  showMe();
  status("Character saved.");
};

$("search-form").onsubmit = (e) => {
  e.preventDefault();
  showSearch(/** @type {HTMLInputElement} */ ($("search-tag")).value.trim() || undefined);
};

$("server-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    selectedServer = serverOrigin(/** @type {HTMLInputElement} */ ($("server-address")).value.trim());
    await put("server", selectedServer);
    await showHome();
  } catch (error) { status(String(error)); }
};

$("open-link-form").onsubmit = (e) => {
  e.preventDefault();
  const text = /** @type {HTMLInputElement} */ ($("realm-link")).value.trim();
  const hash = text.includes("#") ? text.slice(text.indexOf("#") + 1) : text;
  if (/^(?:web\+)?emind:/.test(hash)) location.hash = hash;
  else status("Paste an Endless Mind realm link.");
};

/** @param {Map<string, Uint8Array<ArrayBuffer>>} files */
async function publishAndOpen(files) {
  try {
    status("Publishing...");
    const realm = await publish(files, selectedServer);
    await showHome();
    status(`Published ${realm.name}. Choose Start hosting in Your realms, then open its link to visit.`, 10000);
  } catch (error) {
    await showOwned();
    status(String(/** @type {Error} */ (error).message ?? error), 8000);
  }
}

$("publish-example").onclick = async () => publishAndOpen(await exampleFiles("maze-chase"));

$("publish-files").onchange = async (e) => {
  const input = /** @type {HTMLInputElement} */ (e.target);
  /** @type {Map<string, Uint8Array<ArrayBuffer>>} */
  const files = new Map();
  for (const file of input.files ?? []) files.set(file.name, new Uint8Array(await file.arrayBuffer()));
  input.value = "";
  await publishAndOpen(files);
};

$("save-keys").onclick = async () => {
  try {
    const url = URL.createObjectURL(new Blob([await saveKeys()], { type: "application/json" }));
    el("a", { href: url, download: "endless-mind-keys.json" }).click();
    URL.revokeObjectURL(url);
    status("Keys saved. Anyone who gets this file can be your character and host your realms.", 8000);
  } catch (error) {
    status(String(/** @type {Error} */ (error).message ?? error), 8000);
  }
};

$("save-backup").onclick = async () => {
  try {
    const url = URL.createObjectURL(new Blob([await saveKeys({files:true,storage:true})], {type:"application/json"}));
    el("a", {href:url,download:"endless-mind-backup.json"}).click();
    URL.revokeObjectURL(url);
    status("Saved keys, locally held files, and realm storage.");
  } catch (e) { status(String(e)); }
};

$("load-keys").onchange = async (e) => {
  const input = /** @type {HTMLInputElement} */ (e.target);
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!confirm("Loading a key file replaces the character in this browser with the one in the file. Continue?")) return;
  try {
    visiting?.abort(); current?.stop(); current = null;
    for (const host of [...hosts.values()]) host.stop();
    const loaded = await loadKeys(await file.text());
    if (loaded.character) Object.assign(character, await myCharacter());
    showMe();
    location.hash = "";
    await showHome();
    status(`Loaded ${loaded.character ? "your character and " : ""}${loaded.realms} realm(s).`, 8000);
  } catch (error) {
    status(String(/** @type {Error} */ (error).message ?? error), 8000);
  }
};

// Browsers let a web page handle only link types that start with "web+".
if ("registerProtocolHandler" in navigator && location.protocol === "https:") {
  $("links-section").hidden = false;
  $("register-links").onclick = () => {
    try {
      navigator.registerProtocolHandler("web+emind", `${location.origin}/#%s`);
    } catch (error) {
      status(String(error));
    }
  };
}

addEventListener("hashchange", route);
showMe();
route().then(() => (document.body.dataset.ready = "1"));
