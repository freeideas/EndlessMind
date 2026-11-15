// The sign-in box for a realm's page, served by the realm library at <base>endlessmind/signin.js.
//
//   import { mountSignIn } from "./endlessmind/signin.js";
//   const signIn = mountSignIn(document.querySelector("#signin"), { onChange: (me) => redraw(me) });
//   ... after something may have earned a record: signIn.refresh();
//   ... to open the claim box for the records that are waiting: signIn.claim();
//
// It shows "playing as a guest" with a sign-in button, or the player ID with any records waiting to be
// claimed. Signing in and claiming each show a QR code, a link for this computer and a short address.
// A realm that asks for it lets the screen in only once the player types the number their phone shows.

const BASE = new URL("../", import.meta.url).href;

// The page this box is on, as a path under the realm's address ("" for the game itself), so that a
// phone that signs in or claims is led back here, such as to a host's board.
const BACK = (() => {
  const base = new URL(BASE);
  return location.origin === base.origin && location.pathname.startsWith(base.pathname) ? location.pathname.slice(base.pathname.length) : "";
})();

// A tab that has just claimed records has them in its EntryPortal already, so "Get my records back"
// would only confuse there. It is offered to a player who signed in again, such as on a new phone.
const CLAIMED = "em-claimed";
/** @param {string} player */
const rememberClaim = (player) => {
  try {
    sessionStorage.setItem(CLAIMED, player);
  } catch { /* storage may be blocked; the link then shows as before */ }
};
/** @param {string} player */
const justClaimed = (player) => {
  try {
    return sessionStorage.getItem(CLAIMED) === player;
  } catch {
    return false;
  }
};

// On a phone or tablet a code would be shown on the very device meant to scan it, so there the buttons
// go straight to the EntryPortal in this tab, and showing a code is offered for a different phone.
const ON_PHONE = matchMedia("(pointer: coarse) and (hover: none)").matches;

const STYLE = `
.em-box { font: inherit; overflow-wrap: anywhere; }
.em-row { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center; }
.em-panel { margin-top: .8rem; padding: 1rem; border: 1px solid currentColor; border-radius: 12px; max-width: 22rem; }
.em-panel h3 { margin: 0 0 .6rem; font-size: 1.1em; }
.em-box summary { cursor: pointer; }
.em-qr { width: 220px; max-width: 100%; aspect-ratio: 1; }
.em-qr svg { width: 100%; height: 100%; display: block; border-radius: 6px; }
.em-typed { font-family: ui-monospace, Menlo, monospace; font-size: .9em; word-break: break-all; user-select: all; }
.em-small { font-size: .85em; opacity: .8; }
.em-box button { font: inherit; cursor: pointer; padding: .35rem .9rem; border-radius: 8px; border: 1px solid currentColor; background: transparent; color: inherit; }
.em-box button.em-quiet { border: 0; text-decoration: underline; padding: .35rem .3rem; opacity: .8; }
.em-box input.em-number { font: inherit; font-size: 1.6em; width: 3.2em; text-align: center; padding: .2rem; border-radius: 8px; border: 1px solid currentColor; background: transparent; color: inherit; }
`;

/**
 * @param {HTMLElement} box where to draw
 * @param {{ onChange?: (me: any) => void }} [options]
 */
export function mountSignIn(box, options = {}) {
  if (!document.getElementById("em-style")) {
    const style = document.createElement("style");
    style.id = "em-style";
    style.textContent = STYLE;
    document.head.append(style);
  }
  box.classList.add("em-box");
  /** @type {any} */
  let me = null;
  let timer = -1;
  let panelOpen = false;

  /** @param {string} tag @param {Record<string, any>} [props] @param {(Node | string)[]} [children] */
  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  async function refresh() {
    me = await (await fetch(BASE + "endlessmind/me", { cache: "no-store" })).json();
    if (!panelOpen) draw();
    options.onChange?.(me);
    return me;
  }

  function draw() {
    clearInterval(timer);
    panelOpen = false;
    if (!me?.player) {
      const button = el("button", { textContent: "Sign in", onclick: () => openPanel("join") });
      const other = ON_PHONE ? [el("button", { className: "em-quiet", textContent: "Use a different phone", onclick: () => openPanel("join", false) })] : [];
      box.replaceChildren(el("div", { className: "em-row" }, [el("span", { textContent: "Playing as a guest." }), button, ...other]));
      return;
    }
    const out = el("button", {
      textContent: "Sign out",
      onclick: async () => {
        await fetch(BASE + "endlessmind/signout", { method: "POST" });
        refresh();
      },
    });
    const rename = el("button", { textContent: "Change name", onclick: () => openPanel("rename") });
    const rows = [
      el("div", { className: "em-row" }, [
        el("span", {}, ["Signed in as ", el("strong", { className: "em-name", textContent: me.playerName, title: "Player ID " + me.player })]),
        rename,
        out,
      ]),
    ];
    if (me.claims > 0) {
      const claim = el("button", { textContent: "Claim", onclick: () => openPanel("claim") });
      const what = me.claims === 1 ? "1 record is" : `${me.claims} records are`;
      rows.push(el("div", { className: "em-row" }, [el("span", { textContent: `${what} waiting for you to claim.` }), claim]));
    }
    if (me.records > 0 && me.claims === 0 && !justClaimed(me.player)) {
      // For a player whose EntryPortal lost its records, such as after setting up a new phone.
      rows.push(el("div", { className: "em-row" }, [
        el("button", { className: "em-quiet", textContent: "Get my records back", onclick: () => openPanel("restore") }),
      ]));
    }
    box.replaceChildren(...rows);
  }

  /**
   * @param {"join" | "rename" | "claim" | "restore"} kind
   * @param {boolean} [here] go to the EntryPortal in this tab instead of showing a code
   */
  async function openPanel(kind, here = ON_PHONE) {
    clearInterval(timer);
    panelOpen = true;
    const path = { join: "endlessmind/start", rename: "endlessmind/start?rename", claim: "endlessmind/claim", restore: "endlessmind/restore" }[kind];
    const url = new URL(BASE + path);
    if (BACK) url.searchParams.set("back", BACK);
    const response = await fetch(url, { method: "POST" });
    const code = await response.json();
    if (!response.ok) return draw();
    if (kind === "claim" && me?.player) rememberClaim(me.player);
    if (here) {
      location.href = code.link;
      return;
    }
    const join = kind === "join" || kind === "rename";
    const device = ON_PHONE ? "this phone" : "this computer";
    const words = {
      join: ["Sign in with your phone", "Point your phone's camera at this code and tap the link it shows. Nothing to install.", `Sign in on ${device}`],
      rename: ["Change your name", "Scan this code with the phone you signed in with, change your name there, and this screen shows it.", `Change it on ${device}`],
      claim: ["Claim with your phone", "Point your phone's camera at this code to keep your records on your phone.", `Claim on ${device}`],
      restore: ["Get your records back", "Point the camera of the phone that holds your EntryPortal at this code, and it keeps every record this game has for you.", `Get them on ${device}`],
    }[kind];
    const qr = el("div", { className: "em-qr", title: "Point your phone's camera at this code" });
    qr.innerHTML = code.qr; // an SVG drawn by this realm's own server
    qr.dataset.link = code.link;
    const status = el("p", { className: "em-small" });
    const panel = el("div", { className: "em-panel" }, [
      el("h3", { textContent: words[0] }),
      el("p", { textContent: words[1] }),
      qr,
      el("p", {
        className: "em-small",
        textContent: "Scan this code only because you just pressed a button here. If someone sent or showed you a code, do not scan it: it would sign them in as you.",
      }),
      el("details", { className: "em-small" }, [
        el("summary", { textContent: "No phone, or the code won't scan?" }),
        el("p", {}, [
          el("a", { href: code.link, target: "_blank", textContent: words[2] }),
        ]),
        el("p", {}, [
          join ? "Or type this address into your EntryPortal: " : "Or open this address on your phone: ",
          el("span", { className: "em-typed", textContent: code.typed }),
        ]),
      ]),
      status,
      el("button", { textContent: "Cancel", onclick: draw }),
    ]);
    box.replaceChildren(panel);
    const tick = async () => {
      const left = Math.max(0, Math.round((code.expires - Date.now()) / 1000));
      status.textContent = `This code works for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} more.`;
      let state;
      try {
        state = (await (await fetch(`${BASE}endlessmind/wait/${code.code}?token=${code.token}`, { cache: "no-store" })).json()).state;
      } catch {
        return;
      }
      if (!panelOpen || box.firstChild !== panel) return;
      if (state === "in" || state === "claimed") {
        panelOpen = false;
        clearInterval(timer);
        refresh();
      } else if (state === "number") {
        clearInterval(timer);
        askNumber(code, /** @type {"join" | "rename"} */ (kind));
      } else if (state === "expired" || state === "unknown") {
        if (join) openPanel(kind);
        else draw();
      }
    };
    timer = Number(setInterval(tick, 1500));
    tick();
  }

  /**
   * The phone that signed in shows a number; typing it here lets this screen in. Someone who showed
   * a stolen code to another person never sees their phone, so cannot finish.
   * @param {any} code @param {"join" | "rename"} kind
   */
  function askNumber(code, kind) {
    const input = el("input", { className: "em-number", inputMode: "numeric", maxLength: 2, autocomplete: "off", ariaLabel: "The number on your phone" });
    const problem = el("p", { className: "em-small" });
    const form = el("form", {}, [
      el("p", { textContent: "Your phone shows a two-digit number. Type it here to finish signing in." }),
      el("div", { className: "em-row" }, [input, el("button", { type: "submit", textContent: "Finish signing in" })]),
      problem,
    ]);
    form.onsubmit = async (/** @type {Event} */ event) => {
      event.preventDefault();
      const response = await fetch(`${BASE}endlessmind/confirm/${code.code}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: code.token, number: input.value }),
      });
      const { state } = await response.json();
      if (state === "in") {
        panelOpen = false;
        return refresh();
      }
      // One try only: a wrong number ends this sign-in, so nobody can guess their way in.
      problem.textContent = state === "wrong" ? "That number is not the one on the phone, so this sign-in was stopped." : "This sign-in has expired.";
      form.querySelector("button")?.replaceWith(el("button", { type: "button", textContent: "Start again", onclick: () => openPanel(kind) }));
      input.disabled = true;
    };
    box.replaceChildren(el("div", { className: "em-panel" }, [
      el("h3", { textContent: "One more step" }),
      form,
      el("button", { className: "em-quiet", textContent: "Cancel", onclick: draw }),
    ]));
    input.focus();
  }

  refresh();
  return { refresh, claim: () => openPanel("claim") };
}
