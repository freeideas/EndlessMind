// Lantern Maze: the default renderer. Draws each view as a flat 2D maze and
// turns arrow keys, WASD and swipes into moves. Anyone may write another
// renderer for the same views (glowing 3D corridors, say); the realm cannot
// tell the difference.

export default {
  /**
   * @param {HTMLElement} root
   * @param {{ me: string, character: any, onView: (fn: (view: any) => void) => void, act: (action: unknown) => void }} game
   */
  start(root, game) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    root.append(canvas);
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    /** @type {any} */
    let view = null;
    let lastTick = -1;
    let tickAt = performance.now();
    /** Previous positions, for smooth movement between ticks. @type {Map<string, number[]>} */
    let before = new Map();
    /** @type {Map<string, number[]>} */
    let after = new Map();

    game.onView((v) => {
      if (v.tick === lastTick) return;
      lastTick = v.tick;
      before = after;
      after = new Map();
      v.actors.forEach((/** @type {any} */ p, /** @type {number} */ i) => after.set("p" + p.name + i, [p.x, p.y]));
      v.spirits.forEach((/** @type {number[]} */ s, /** @type {number} */ i) => after.set("s" + i, s));
      tickAt = performance.now();
      view = v;
    });

    const keys = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
    };
    addEventListener("keydown", (e) => {
      const dir = keys[/** @type {keyof keys} */ (e.key)];
      if (dir) {
        e.preventDefault();
        game.act({ dir });
      }
    });
    /** @type {{x: number, y: number} | null} */
    let touch = null;
    canvas.addEventListener("pointerdown", (e) => (touch = { x: e.clientX, y: e.clientY }));
    canvas.addEventListener("pointerup", (e) => {
      if (!touch) return;
      const dx = e.clientX - touch.x;
      const dy = e.clientY - touch.y;
      touch = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
      game.act({ dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up") });
    });
    canvas.addEventListener("pointerdown", () => window.focus());

    /** @param {string} key @param {number[]} to @param {number} t */
    function lerp(key, to, t) {
      const from = before.get(key);
      if (!from || Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) > 1) return to;
      return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    }

    function frame() {
      requestAnimationFrame(frame);
      const dpr = devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#07070d";
      ctx.fillRect(0, 0, w, h);
      if (!view) {
        ctx.fillStyle = "#aab";
        ctx.font = "16px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Waiting for the realm...", w / 2, h / 2);
        return;
      }
      const rows = view.grid.length;
      const cols = view.grid[0].length;
      const hud = 34;
      const cell = Math.floor(Math.min(w / cols, (h - hud) / rows));
      const ox = Math.floor((w - cell * cols) / 2);
      const oy = hud + Math.floor((h - hud - cell * rows) / 2);
      const now = performance.now();
      const t = Math.min((now - tickAt) / 140, 1);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const c = view.grid[y][x];
          if (c === "#") {
            ctx.fillStyle = "#1d2a5a";
            ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
            ctx.fillStyle = "#2b3d80";
            ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
          } else if (c === "D") {
            // A door to another maze: a doorway of warm light.
            const glow = 0.6 + 0.4 * Math.sin(now / 400);
            ctx.fillStyle = `rgba(255, 210, 120, ${glow})`;
            ctx.fillRect(ox + x * cell + cell * 0.15, oy + y * cell, cell * 0.7, cell);
          } else if (c === ".") {
            const pulse = 0.75 + 0.25 * Math.sin(now / 300 + x + y);
            ctx.fillStyle = `rgba(190, 255, 140, ${pulse})`;
            ctx.beginPath();
            ctx.arc(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, Math.max(cell * 0.12, 1.5), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      view.spirits.forEach((/** @type {number[]} */ s, /** @type {number} */ i) => {
        const [x, y] = lerp("s" + i, s, t);
        const cx = ox + (x + 0.5) * cell;
        const cy = oy + (y + 0.5) * cell;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 1.3);
        glow.addColorStop(0, "rgba(255, 240, 200, 0.95)");
        glow.addColorStop(0.25, "rgba(255, 170, 60, 0.8)");
        glow.addColorStop(1, "rgba(255, 120, 0, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 1.3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.textAlign = "center";
      ctx.font = `${Math.max(10, Math.floor(cell * 0.45))}px system-ui`;
      view.actors.forEach((/** @type {any} */ p, /** @type {number} */ i) => {
        const [x, y] = lerp("p" + p.name + i, [p.x, p.y], t);
        const cx = ox + (x + 0.5) * cell;
        const cy = oy + (y + 0.5) * cell;
        if (p.safe && Math.floor(now / 150) % 2) return;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.38, 0, Math.PI * 2);
        ctx.fill();
        if (p.me) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = "#fff";
        ctx.fillText(p.name, cx, cy - cell * 0.55);
      });

      ctx.textAlign = "left";
      ctx.font = "14px system-ui";
      const board = [...view.actors].sort((a, b) => b.score - a.score)
        .map((p) => `${p.me ? "▶ " : ""}${p.name} ${p.score}`).join("   ");
      ctx.fillStyle = "#dde";
      ctx.fillText(`Round ${view.round}   ${board}`, 10, 22);
    }
    frame();
  },
};
