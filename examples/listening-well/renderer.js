// The Listening Well: the default renderer. Shows what has been asked and
// answered, and sends the actor's question to the realm as a move. What
// answers is on the referee's side; this code never sees how.

export default {
  /**
   * @param {HTMLElement} root
   * @param {{ me: string, character: any, onView: (fn: (view: any) => void) => void, act: (action: unknown) => void }} game
   */
  start(root, game) {
    root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#10151c;color:#e8e6df;font:16px/1.45 system-ui,sans-serif";
    const here = root.appendChild(document.createElement("div"));
    here.style.cssText = "padding:10px 14px;color:#8fa3b8;font-size:14px;border-bottom:1px solid #263140";
    const talk = root.appendChild(document.createElement("div"));
    talk.style.cssText = "flex:1;overflow-y:auto;padding:14px";
    const row = root.appendChild(document.createElement("div"));
    row.style.cssText = "display:flex;gap:8px;padding:10px 14px;border-top:1px solid #263140";
    const input = row.appendChild(document.createElement("input"));
    input.maxLength = 200;
    input.placeholder = "Lower a question into the well";
    input.setAttribute("aria-label", "Your question");
    input.style.cssText = "flex:1;min-width:0;padding:10px;border-radius:8px;border:1px solid #3a4a5e;background:#18202b;color:inherit;font:inherit";
    const button = row.appendChild(document.createElement("button"));
    button.textContent = "Ask";
    button.style.cssText = "padding:10px 16px;border-radius:8px;border:0;background:#5c8fd6;color:#fff;font:inherit";

    function ask() {
      const question = input.value.trim();
      if (!question || button.disabled) return;
      game.act({ ask: question });
      input.value = "";
    }
    button.addEventListener("click", ask);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") ask();
    });

    let shown = "";
    game.onView((view) => {
      button.disabled = Boolean(view.waiting);
      button.textContent = view.waiting ? "Listening..." : "Ask";
      here.textContent = "At the well: " + view.here.join(", ");
      const now = JSON.stringify(view.talk);
      if (now === shown) return;
      shown = now;
      talk.replaceChildren(...view.talk.map((/** @type {any} */ t) => {
        const item = document.createElement("div");
        item.style.cssText = "margin-bottom:14px";
        const who = item.appendChild(document.createElement("div"));
        who.style.color = t.color;
        who.textContent = `${t.name} asks: ${t.question}`;
        const answer = item.appendChild(document.createElement("div"));
        answer.style.cssText = "margin-top:4px;padding-left:12px;border-left:2px solid #3a4a5e;font-style:italic";
        answer.textContent = t.answer ?? "The water stirs...";
        return item;
      }));
      if (!view.talk.length) talk.textContent = "The well is quiet. Ask it something.";
      talk.scrollTop = talk.scrollHeight;
    });
  },
};
