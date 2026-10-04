// Lantern Maze: a second renderer for the same views, in plain text. It shows
// that how a realm looks is separate from the realm: the rules send the same
// data, and this draws it as letters. A portal lets the actor choose.
//   #  wall     .  seed     @  you     o  another runner     S  lantern spirit

export default {
  /**
   * @param {HTMLElement} root
   * @param {{ me: string, character: any, onView: (fn: (view: any) => void) => void, act: (action: unknown) => void }} game
   */
  start(root, game) {
    root.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-family:ui-monospace,monospace";
    const maze = document.createElement("pre");
    maze.style.cssText = "margin:0;font-size:min(3.6vw,3.6vh,18px);line-height:1.15;letter-spacing:.2em";
    const scores = document.createElement("div");
    const pad = document.createElement("div");
    // Buttons as well as keys, so it works by touch and with a screen reader.
    for (const [label, dir] of [["Up", "up"], ["Left", "left"], ["Down", "down"], ["Right", "right"]]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.style.cssText = "font:inherit;margin:2px;padding:6px 10px";
      button.onclick = () => game.act({ dir });
      pad.append(button);
    }
    root.append(maze, scores, pad);

    game.onView((v) => {
      const rows = v.grid.map((/** @type {string} */ row) => [...row]);
      for (const [x, y] of v.spirits) rows[y][x] = "S";
      for (const a of v.actors) rows[a.y][a.x] = a.me ? "@" : "o";
      maze.textContent = rows.map((/** @type {string[]} */ row) => row.join("")).join("\n");
      scores.textContent = `Round ${v.round}. ` +
        v.actors.map((/** @type {any} */ a) => `${a.me ? "You" : a.name}: ${a.score}${a.safe ? " (safe)" : ""}`).join(", ");
    });

    const keys = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
    addEventListener("keydown", (e) => {
      const dir = keys[/** @type {keyof keys} */ (e.key)];
      if (!dir) return;
      e.preventDefault();
      game.act({ dir });
    });
  },
};
