// The reference EveryGame app: the page players open. It keeps the player's
// keys and character, finds and publishes realms, and runs realms and
// renderers in sandboxes. Its menu ("More realms") is always there, outside
// any realm's control.

import { myCharacter, updateCharacter } from "./character.js";
import { defaultRelayUrl, Relay } from "./net.js";
import { exampleFiles, ownedRealm, ownedRealms, publish, search } from "./realms.js";
import { play } from "./session.js";
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

/** @param {string} address */
function realmLink(address) {
  return `${location.origin}/#realm=${address}`;
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

if (!globalThis.crypto?.subtle) {
  document.body.innerHTML = `<main style="padding:16px;max-width:640px">
    <h2>This page needs a secure connection</h2>
    <p>Browsers only allow the key functions EveryGame uses on <b>https</b> addresses or on
    <b>localhost</b>. Open this server through https, or on the computer running it.
    See <code>specs/RUNNING.md</code> in the EveryGame repository.</p></main>`;
  throw new Error("insecure context");
}

askToPersist();
const character = await myCharacter();
const relay = new Relay(defaultRelayUrl());
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
      el("a", { href: `#realm=${r.address}` }, [r.name]),
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
    return el("li", {}, [el("a", { href: `#realm=${r.address}` }, [r.name]), copyButton]);
  }));
  if (!realms.length) list.append(el("li", {}, ["None yet."]));
}

async function showHome() {
  $("realm").hidden = true;
  $("home").hidden = false;
  $("copy-link").hidden = true;
  $("more-realms").hidden = true;
  $("realm-name").textContent = "";
  /** @type {HTMLInputElement} */ ($("char-name")).value = character.info.name;
  /** @type {HTMLInputElement} */ ($("char-desc")).value = character.info.description;
  /** @type {HTMLInputElement} */ ($("char-color")).value = toHexColor(character.info.color);
  await Promise.all([showSearch(), showOwned()]);
}

/** @type {{ stop: () => void } | null} */
let current = null;

/** @param {string} address */
async function showRealm(address) {
  $("home").hidden = true;
  $("realm").hidden = false;
  $("copy-link").hidden = false;
  $("more-realms").hidden = false;
  $("realm-name").textContent = "";
  $("copy-link").onclick = () => copy(realmLink(address));
  const stage = $("stage");
  stage.replaceChildren();
  try {
    await relay.ready;
    const owned = await ownedRealm(address);
    current = await play(address, character, relay, stage, { status, owned });
    $("realm-name").textContent = /** @type {any} */ (current).name;
  } catch (error) {
    stage.replaceChildren(el("p", { style: "padding:16px" }, [String(/** @type {Error} */ (error).message ?? error)]));
  }
}

async function route() {
  current?.stop();
  current = null;
  const match = location.hash.match(/realm=([^&]+)/);
  if (match) await showRealm(decodeURIComponent(match[1]));
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
    location.hash = `realm=${realm.address}`;
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

addEventListener("hashchange", route);
showMe();
route().then(() => (document.body.dataset.ready = "1"));
