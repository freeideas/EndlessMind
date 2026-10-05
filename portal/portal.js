// The reference Endless Mind portal: the page actors open. It keeps the actor's
// keys and character, finds and publishes realms, and runs realms and
// renderers in sandboxes. Its menu ("More realms") is always there, outside
// any realm's control.

import { myCharacter, updateCharacter } from "./character.js";
import { exampleFiles, fetchBytes, ownedRealms, publish, publishOwned, search, serverOrigin } from "./realms.js";
import { MAX_PICTURE_BYTES, pictureType } from "../shared/announce.js";
import { isAddress } from "../shared/crypto.js";
import { makeLink, parseLink } from "../shared/link.js";
import { allMine, describe, follow, following, lasting, mine, picks, readAddress, renewMine, say, suggestions, unfollow } from "./finding.js";
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
 * @param {string} [renderer] the hash of a renderer to show the realm with, when not its own
 */
function realmLink(address, release, origin = selectedServer, renderer) {
  const via = [origin].flat().map(encodeURIComponent).join(",");
  return `${location.origin}/#emind:${address}?via=${via}` + (release ? `&release=${release}` : "") + (renderer ? `&renderer=${renderer}` : "");
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

/** Picture addresses made for the current list of realms, let go when the list is shown again. @type {string[]} */
let pictureUrls = [];

/**
 * Show a realm's picture once it scrolls into view, after checking it matches its hash.
 * @param {HTMLImageElement} img @param {{ hash: string, type: string }} picture @param {string} server
 */
function loadPicture(img, picture, server) {
  const seen = new IntersectionObserver(async (entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    seen.disconnect();
    try {
      const bytes = await fetchBytes(picture.hash, server);
      if (bytes.length > MAX_PICTURE_BYTES) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: picture.type }));
      pictureUrls.push(url);
      img.src = url;
    } catch { /* a missing picture leaves the empty frame */ }
  });
  seen.observe(img);
}

/**
 * One realm in a list: its picture, name, tags and the start of its description, and anything more.
 * @param {{ address: string, name: string, tags?: string[], description?: string, picture?: { hash: string, type: string },
 *   online?: boolean, alone?: boolean }} r @param {string[]} servers where it is found
 * @param {(Node | string)[]} [more]
 */
function realmItem(r, servers, more = []) {
  const img = /** @type {HTMLImageElement} */ (el("img", { class: "picture", alt: "" }));
  if (r.picture) loadPicture(img, r.picture, servers[0]);
  return el("li", { class: "realm" }, [
    img,
    el("div", {}, [
      el("div", { class: "row" }, [
        el("span", { class: r.online ? "dot on" : "dot", title: r.online ? "Referee online" : "Referee offline" }),
        el("a", { href: realmLink(r.address, undefined, servers) }, [r.alone ? `${r.name} (play alone)` : r.name]),
        el("span", { class: "tags" }, [(r.tags ?? []).join(", ")]),
      ]),
      ...(r.description ? [el("p", { class: "description" }, [r.description.slice(0, 300)])] : []),
      ...more,
    ]),
  ]);
}

/** A realm's listing from its checked announcement. @param {string} address @param {Awaited<ReturnType<typeof describe>>} d */
function listed(address, d) {
  const m = /** @type {NonNullable<typeof d>} */ (d).found.manifest;
  const type = m.picture ? pictureType(m.picture) : undefined;
  return {
    address, name: m.name, tags: m.tags, description: m.description, online: d?.found.online,
    ...(m.picture && type ? { picture: { hash: m.files[m.picture], type } } : {}),
  };
}

/** Servers this portal has visited realms on, most recent first. @returns {Promise<string[]>} */
async function usedServers() {
  return (await get("used-servers").catch(() => [])) ?? [];
}

/** @param {string} server */
async function noteServer(server) {
  await put("used-servers", [server, ...(await usedServers()).filter((s) => s !== server)].slice(0, 8)).catch(() => {});
}

/** The picks of the chosen server and of the servers most recently used. */
async function showPicks() {
  const list = $("picks");
  const servers = [...new Set([selectedServer, ...(await usedServers())])].slice(0, 4);
  const items = [];
  for (const server of servers) {
    const { note, picks: chosen } = await picks(server);
    const host = new URL(server).host;
    for (const p of chosen) {
      const d = await describe(p.address, p.servers);
      if (!d) continue;
      items.push(realmItem(listed(p.address, d), [d.server, ...p.servers], [
        el("p", { class: "voices" }, [`Picked by ${host}${p.note ? `: "${p.note}"` : note ? ` (${note})` : ""}`]),
      ]));
    }
  }
  list.replaceChildren(...items);
  if (!items.length) list.append(el("li", {}, ["None of the servers you use has picked any realms."]));
}

/** Suggestions weighed from the actors and realms this actor follows. */
async function showSuggestions() {
  const list = $("suggestions");
  const followedNow = new Set((await following()).map((f) => f.address));
  const found = await suggestions(character, [...new Set([selectedServer, ...(await usedServers())])].slice(0, 4));
  const items = [];
  for (const s of found.slice(0, 15)) {
    const d = await describe(s.address, s.via);
    if (!d) continue;
    const voices = el("p", { class: "voices" }, ["Recommended by "]);
    s.voices.slice(0, 4).forEach((v, i) => {
      if (i) voices.append(", ");
      voices.append(v.name + (v.played ? " (has played it)" : "") + (v.note ? `: "${v.note}"` : ""));
      if (!followedNow.has(v.author) && isAddress(v.author)) {
        const b = el("button", { type: "button", title: "Count their recommendations for you" }, ["Follow"]);
        b.onclick = async () => { await follow(v.author, "", []); status("Following. Their recommendations now count for you."); showHome(); };
        voices.append(" ", b);
      }
    });
    if (s.voices.length > 4) voices.append(` and ${s.voices.length - 4} more`);
    items.push(realmItem(listed(s.address, d), [d.server, ...s.via], [voices]));
  }
  list.replaceChildren(...items);
  if (!items.length) list.append(el("li", {}, ["Nothing yet. Follow actors or realms whose taste you trust, or recommend realms you like."]));
}

/** Who this actor follows, and what this actor has said. */
async function showFollowing() {
  const list = $("following");
  list.replaceChildren(...(await following()).map((f) => {
    const b = el("button", { class: "small" }, ["Unfollow"]);
    b.onclick = async () => { await unfollow(f.address); showHome(); };
    return el("li", {}, [el("span", {}, [f.name]), el("code", { class: "tags" }, [f.address.slice(0, 24) + "..."]), b]);
  }));
  if (!list.children.length) list.append(el("li", {}, ["Nobody yet."]));
  const said = $("mine");
  said.replaceChildren(...(await allMine()).filter((m) => m.kind !== "withdrawn").map((m) => {
    const b = el("button", { class: "small" }, ["Withdraw"]);
    b.onclick = async () => {
      try { await say(character, m.subject, "withdrawn", [selectedServer]); status("Withdrawn."); }
      catch (e) { status(String(e)); }
      showHome();
    };
    const what = m.kind === "notForMe" ? "Not for me" : "Recommended";
    const target = m.via.length ? el("a", { href: realmLink(m.subject, undefined, m.via) }, [m.subject.slice(0, 24) + "..."]) : el("code", {}, [m.subject.slice(0, 24) + "..."]);
    return el("li", {}, [el("span", {}, [what]), target, ...(m.note ? [el("span", { class: "tags" }, [`"${m.note}"`])] : []), b]);
  }));
  if (!said.children.length) said.append(el("li", {}, ["Nothing yet. Open a realm and choose Recommend."]));
}

$("follow-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const { address, servers } = readAddress(/** @type {HTMLInputElement} */ ($("follow-what")).value);
    let name = /** @type {HTMLInputElement} */ ($("follow-name")).value.trim();
    if (!name && servers.length) name = (await describe(address, servers))?.found.manifest.name ?? "";
    await follow(address, name, servers);
    /** @type {HTMLInputElement} */ ($("follow-what")).value = "";
    /** @type {HTMLInputElement} */ ($("follow-name")).value = "";
    status("Following.");
    showHome();
  } catch (error) { status("Paste an actor's lasting address (ed25519-...) or a realm link."); }
};

$("copy-address").onclick = async () => copy((await lasting(character)).address);

/** @param {string} [tag] */
async function showSearch(tag) {
  const list = $("search-results");
  /** @type {import("./realms.js").Listed[]} */
  let realms;
  try { realms = await search(tag, selectedServer); }
  catch { list.replaceChildren(el("li", {}, ["Cannot reach this helper server. Your keys and realms are still here."])); return; }
  for (const url of pictureUrls) URL.revokeObjectURL(url);
  pictureUrls = [];
  const server = selectedServer;
  list.replaceChildren(...realms.map((r) =>
    realmItem(r, [server], r.picked ? [el("p", { class: "voices" }, [`Picked by ${new URL(server).host}`])] : [])
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

/** The actor's record: what realms have signed about this character. */
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
  $("look").hidden = true;
  $("more-realms").hidden = true;
  for (const id of ["offer", "recommend", "not-for-me", "follow-realm"]) $(id).hidden = true;
  $("realm-name").textContent = "";
  /** @type {HTMLInputElement} */ ($("server-address")).value = selectedServer;
  $("my-address").textContent = (await lasting(character)).address;
  /** @type {HTMLInputElement} */ ($("char-name")).value = character.info.name;
  /** @type {HTMLInputElement} */ ($("char-desc")).value = character.info.description;
  /** @type {HTMLInputElement} */ ($("char-color")).value = toHexColor(character.info.color);
  /** @type {HTMLInputElement} */ ($("char-private")).checked = Boolean(await get("private"));
  await Promise.all([showSearch(), showOwned(), showRecord(), showFollowing()]);
  // These ask several servers, so they fill in when ready. Recommendations are renewed while the portal is used.
  showSuggestions().catch(() => {});
  showPicks().catch(() => {});
  renewMine(character, [selectedServer]).catch(() => {});
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

/**
 * A door the current realm opened: where it leads, and the travel note to show there.
 * @type {{ to: string, ticket: import("../shared/envelope.js").Envelope, from: string } | null}
 */
let walking = null;
/** The realm being left through a door, kept on screen until the next shows its first view. @type {{ controller?: AbortController, current: { stop: () => void } | null } | null} */
let leaving = null;
/** When doors were last walked through, so a realm cannot bounce an actor around endlessly. @type {number[]} */
let hops = [];
function letGo() {
  leaving?.controller?.abort();
  leaving?.current?.stop();
  leaving = null;
}

/**
 * A link the realm's renderer offers: shown in the portal's own menu, opened only if the actor chooses it.
 * @param {string} link @param {AbortController} controller
 */
async function offerLink(link, controller) {
  let to;
  try { to = parseLink(link); } catch { return; }
  const button = $("offer");
  button.textContent = "Go to another realm";
  button.title = `This realm offers a link to ${to.address}. It opens only if you choose it.`;
  button.hidden = false;
  button.onclick = () => { location.hash = makeLink(to.address, to.servers); };
  const d = await describe(to.address, to.servers);
  if (d && !controller.signal.aborted) button.textContent = `Go to ${d.found.manifest.name}`;
}

/** The realm menu's Recommend, Not for me and Follow. @param {string} address @param {string} name @param {string[]} servers */
async function setUpRecommend(address, name, servers) {
  const rec = $("recommend"), nope = $("not-for-me"), fol = $("follow-realm");
  const recommended = (await mine(address))?.kind === "recommend";
  const followed = (await following()).some((f) => f.address === address);
  const again = () => setUpRecommend(address, name, servers);
  rec.textContent = recommended ? "Recommended" : "Recommend";
  rec.title = recommended ? "You recommend this realm. Choose this to withdraw it." : "Sign a recommendation of this realm that others can find";
  fol.textContent = followed ? "Following" : "Follow";
  rec.hidden = nope.hidden = fol.hidden = false;
  rec.onclick = async () => {
    try {
      if (recommended) {
        if (!confirm(`Withdraw your recommendation of ${name}?`)) return;
        await say(character, address, "withdrawn", [selectedServer]);
        status("Withdrawn.");
      } else {
        const note = prompt(`Recommend ${name}. Add a short note if you like (at most 280 characters):`, "");
        if (note === null) return;
        await say(character, address, { note: note.trim(), via: servers }, [selectedServer]);
        status(`You recommend ${name}. People who follow you will see it.`, 8000);
      }
    } catch (e) { status(String(e), 8000); }
    again();
  };
  nope.onclick = async () => {
    if (!confirm(`Hide ${name} from your suggestions? For people who follow you, it counts a little against it.`)) return;
    try { await say(character, address, "not for me", [selectedServer]); status("Hidden from your suggestions."); }
    catch (e) { status(String(e), 8000); }
    again();
  };
  fol.onclick = async () => {
    if (followed) await unfollow(address);
    else await follow(address, name, servers);
    status(followed ? `No longer following ${name}.` : `Following ${name}: what it recommends now counts for you.`);
    again();
  };
}

/**
 * @param {string} address @param {string} [release] @param {string[]} [via] servers the link hints at
 * @param {string} [renderer=""] @param {{ ticket: import("../shared/envelope.js").Envelope, from: string }} [door] when arriving through a door
 */
async function showRealm(address, release, via = [], renderer = "", door) {
  const controller = new AbortController();
  visiting = controller;
  // A renderer stuck in an endless loop can freeze the page, and reloading
  // would open the same realm again. So the portal notes which realm it is in and
  // clears the note when leaving; finding the note still there means the last
  // visit did not end cleanly, and the actor is asked before going back in.
  if (entering() === address) {
    $("home").hidden = true;
    $("realm").hidden = false;
    $("more-realms").hidden = false;
    letGo();
    const again = el("button", { id: "open-anyway" }, ["Open it anyway"]);
    again.onclick = route;
    $("stage").replaceChildren(el("p", { style: "padding:16px" }, [
      "This realm did not close cleanly last time. It may have frozen the page. ", again,
    ]));
    return;
  }
  noteEntering(address);
  // The link's hints first, then servers this portal remembers for the realm, then the chosen server.
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
  // How this actor likes to see this realm: a look named in the link, or else the one chosen here before.
  /** @type {{ name: string, code: string } | undefined} */
  const localLook = await get("look:" + address);
  if (!renderer) renderer = await get("chosen:" + address) ?? "";
  if (controller.signal.aborted) return;
  // A link copied while another look is chosen keeps that look, if others could fetch it.
  const shared = renderer?.startsWith("sha256-") ? renderer : "";
  $("copy-link").onclick = () => copy(realmLink(address, undefined, servers, shared));
  $("copy-version-link").onclick = () => current && copy(realmLink(address, current.release, servers, shared));
  $("look").hidden = true;
  for (const id of ["offer", "recommend", "not-for-me", "follow-realm"]) $(id).hidden = true;
  const stage = $("stage");
  // Through a door, the realm left stays on screen until this one shows its first view.
  const layer = el("div", { class: door ? "layer arriving" : "layer" });
  if (door) stage.append(layer);
  else stage.replaceChildren(layer);
  let arrived = !door;
  const arrive = () => {
    clearTimeout(waiting);
    if (arrived) return;
    arrived = true;
    letGo();
    for (const other of [...stage.children]) if (other !== layer) other.remove();
    layer.classList.remove("arriving");
  };
  const waiting = door ? setTimeout(arrive, 10_000) : undefined;
  try {
    const opened = current = await play(address, character, layer, { status, servers, release, signal:controller.signal, renderer, localLook,
      ticket: door?.ticket,
      onFirstView: () => {
        if (door && !arrived) status(`You came through a door from ${door.from}. Your browser's Back button goes back.`, 6000);
        arrive();
      },
      onGo: (link, ticket) => {
        if (controller.signal.aborted || visiting !== controller) return;
        let to;
        try { to = parseLink(link); } catch { return; }
        const now = Date.now();
        hops = hops.filter((t) => now - t < 30_000);
        if (hops.length >= 5) return status("This realm is sending you through doors too quickly, so the portal stopped following them.", 8000);
        hops.push(now);
        walking = { to: to.address, ticket, from: $("realm-name").textContent || "the last realm" };
        location.hash = makeLink(to.address, to.servers);
      },
      onOffer: (link) => offerLink(link, controller),
      // The actor answers once for each realm whose claims are asked for, and is asked again
      // whenever this realm starts asking for another.
      mayShow: async (name, realms) => {
        /** @type {{ address: string, answers: Record<string, boolean> }} */
        const kept = await get("show:" + address) ?? { address, answers: {} };
        const fresh = realms.filter((r) => !(r in kept.answers));
        if (fresh.length) {
          const answer = confirm(`${name} asks to see what is said of you in ${fresh.length} other realm(s) you have played:\n${fresh.join("\n")}\nShowing your signed claims tells it which actor you are in those realms. Show them?`);
          for (const r of fresh) kept.answers[r] = answer;
          await put("show:" + address, kept);
        }
        return realms.filter((r) => kept.answers[r]);
      } });
    $("realm-name").textContent = opened.name;
    ({ server, servers } = opened);
    noteServer(server);
    if (isAddress(address)) setUpRecommend(address, opened.name, servers).catch(() => {});
    // The actor chooses how the realm looks, when there is more than one way.
    const look = /** @type {HTMLSelectElement} */ ($("look"));
    look.replaceChildren(...opened.looks.map((l) => {
      const option = /** @type {HTMLOptionElement} */ (el("option", { value: l.hash }, [l.label]));
      option.selected = l.hash === opened.look;
      return option;
    }), el("option", { value: "file" }, ["A file on this device..."]));
    look.hidden = false;
    /** Remember the choice for this realm and show it. @param {string} value */
    const choose = async (value) => {
      const own = opened.looks[0].hash === value && opened.looks[0].label === "Its own look";
      await put("chosen:" + address, own ? undefined : value);
      // Only a look others could fetch goes in the link; the rest is this actor's own business.
      const next = realmLink(address, release, servers, !own && value.startsWith("sha256-") ? value : "");
      if (location.href === next) route();
      else location.href = next;
    };
    look.onchange = () => {
      if (look.value !== "file") return choose(look.value);
      look.value = opened.look;
      $("look-file").click();
    };
    // A renderer the actor wrote, or had an agent write: kept for this realm, and never sent anywhere.
    $("look-file").onchange = async (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) return status("A renderer may be at most 2 MB.");
      await put("look:" + address, { name: file.name.slice(0, 40), code: await file.text() });
      await choose("local");
    };
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
    arrive();
    const message = el("p", { style: "padding:16px" }, [String(/** @type {Error} */ (error).message ?? error)]);
    if (/** @type {any} */ (error).code === "release-changed") {
      message.append(" ", el("a", { href: realmLink(address, undefined, server) }, ["Open the current version"]));
    }
    const portal = /** @type {any} */ (error).portal;
    if (portal) {
      // Only the https address the realm's own key signed, and only as a link the actor chooses to follow.
      message.append(` It is played in its own portal, ${portal.name}: `, el("a", { href: portal.url, rel: "noopener" }, [portal.url]),
        ". A program you install runs outside any sandbox and can do anything on your computer, so get it only if you trust this realm's maker.");
    }
    layer.replaceChildren(message);
  }
}

async function route() {
  // Leaving a realm the ordinary way clears the note; a fresh page load keeps it.
  if (visiting) noteEntering();
  const door = walking;
  walking = null;
  letGo();
  // Walking through a door keeps the realm left running until the next one shows itself.
  if (door) leaving = { controller: visiting, current };
  else {
    visiting?.abort();
    current?.stop();
  }
  current = null;
  let hash = location.hash.slice(1);
  if (!hash.startsWith("emind:") && !hash.startsWith("web+emind:")) {
    try { hash = decodeURIComponent(hash); } catch { hash = ""; }
  }
  const match = hash.match(/^(?:web\+)?emind:([a-z0-9-]+)(?:\?(.*))?$/);
  const query = new URLSearchParams(match?.[2] ?? "");
  const arriving = door && match?.[1] === door.to ? door : undefined;
  if (!arriving) letGo();
  if (match) await showRealm(match[1], query.get("release") ?? undefined, query.get("via")?.split(",") ?? [], query.get("renderer") ?? "", arriving).catch(e => status(String(e)));
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
