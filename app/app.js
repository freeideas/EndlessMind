// The reference Endless Mind app: the page players open. It keeps the player's
// keys and character, finds and publishes realms, and runs realms and
// renderers in sandboxes. Its menu ("More realms") is always there, outside
// any realm's control.

import { myCharacter, updateCharacter } from "./character.js";
import { Relay } from "../shared/relay.js";
import { exampleFiles, ownedRealm, ownedRealms, publish, search } from "./realms.js";
import { play } from "./session.js";
import { loadKeys, saveKeys } from "./keyfile.js";
import { askToPersist } from "./store.js";

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
 * @param {string} address @param {string} [release] @param {string} [origin]
 */
function realmLink(address, release, origin = location.origin) {
  return `${origin}/#emind:${address}?via=${new URL(origin).host}` + (release ? `&release=${release}` : "");
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
const relay = new Relay((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
relay.connect().catch(() => status("Cannot reach the server. Retrying..."));

function showMe() {
  const me = $("me");
  me.replaceChildren(el("i", { style: `background:${character.info.color}` }), character.info.name);
}

/** @param {string} [tag] */
async function showSearch(tag) {
  const list = $("search-results");
  const realms = await search(tag);
  list.replaceChildren(...(realms.length ? realms : []).map((r) =>
    el("li", {}, [
      el("span", { class: r.online ? "dot on" : "dot", title: r.online ? "Referee online" : "Referee offline" }),
      el("a", { href: `#emind:${r.address}` }, [r.name]),
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
    copyButton.onclick = () => copy(realmLink(r.address));
    return el("li", {}, [el("a", { href: `#emind:${r.address}` }, [r.name]), copyButton]);
  }));
  if (!realms.length) list.append(el("li", {}, ["None yet."]));
}

async function showHome() {
  $("realm").hidden = true;
  $("home").hidden = false;
  $("copy-link").hidden = true;
  $("copy-version-link").hidden = true;
  $("more-realms").hidden = true;
  $("realm-name").textContent = "";
  /** @type {HTMLInputElement} */ ($("char-name")).value = character.info.name;
  /** @type {HTMLInputElement} */ ($("char-desc")).value = character.info.description;
  /** @type {HTMLInputElement} */ ($("char-color")).value = toHexColor(character.info.color);
  await Promise.all([showSearch(), showOwned()]);
}

/** @type {{ name: string, release: string, stop: () => void } | null} */
let current = null;

/** @param {string} address @param {string} [release] @param {string[]} [via] servers the link hints at */
async function showRealm(address, release, via = []) {
  $("home").hidden = true;
  $("realm").hidden = false;
  $("copy-link").hidden = false;
  $("copy-version-link").hidden = false;
  $("more-realms").hidden = false;
  $("realm-name").textContent = "";
  $("copy-link").onclick = () => copy(realmLink(address));
  $("copy-version-link").onclick = () => current && copy(realmLink(address, current.release));
  const stage = $("stage");
  stage.replaceChildren();
  try {
    await relay.ready;
    const owned = await ownedRealm(address);
    current = await play(address, character, relay, stage, { status, owned, release });
    $("realm-name").textContent = current.name;
  } catch (error) {
    const message = el("p", { style: "padding:16px" }, [String(/** @type {Error} */ (error).message ?? error)]);
    if (/** @type {any} */ (error).code === "release-changed") {
      message.append(" ", el("a", { href: `#emind:${address}` }, ["Open the current version"]));
    }
    const app = /** @type {any} */ (error).app;
    if (app) {
      // Only the https address the realm's own key signed, and only as a link the player chooses to follow.
      message.append(` It is played in its own app, ${app.name}: `, el("a", { href: app.url, rel: "noopener" }, [app.url]),
        ". A program you install runs outside any sandbox and can do anything on your computer, so get it only if you trust this realm's maker.");
    }
    if (/** @type {any} */ (error).code === "not-here") {
      for (const host of via) {
        if (host === location.host || !/^[a-z0-9.-]+(:\d+)?$/.test(host)) continue;
        message.append(" ", el("a", { href: realmLink(address, release, `${location.protocol}//${host}`) }, [`Open it on ${host}`]));
      }
    }
    stage.replaceChildren(message);
  }
}

async function route() {
  current?.stop();
  current = null;
  const match = decodeURIComponent(location.hash.slice(1)).match(/^(?:web\+)?emind:([a-z0-9-]+)(?:\?(.*))?$/);
  const query = new URLSearchParams(match?.[2] ?? "");
  if (match) await showRealm(match[1], query.get("release") ?? undefined, query.get("via")?.split(",") ?? []);
  else await showHome();
}

/** @param {string} color */
function toHexColor(color) {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return "#888888";
  probe.fillStyle = color;
  return probe.fillStyle.startsWith("#") ? probe.fillStyle : "#888888";
}

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

/** @param {Map<string, Uint8Array<ArrayBuffer>>} files */
async function publishAndOpen(files) {
  try {
    status("Publishing...");
    const realm = await publish(files);
    status(`Published ${realm.name}. Share the link so others can join.`, 8000);
    location.hash = `emind:${realm.address}`;
  } catch (error) {
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

$("load-keys").onchange = async (e) => {
  const input = /** @type {HTMLInputElement} */ (e.target);
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!confirm("Loading a key file replaces the character in this browser with the one in the file. Continue?")) return;
  try {
    const loaded = await loadKeys(await file.text());
    if (loaded.character) Object.assign(character, await myCharacter());
    showMe();
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
