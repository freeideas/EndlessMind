// The pictures for the Endless Mind explainer. One function per scene in script.md.
// Words on screen go through s.text (so `check` can read them); everything else is drawn in s.draw.
// Recurring people: the maker (orange, cap), the player (teal, star), friends (blue, pink, yellow),
// hosts (purple, glasses) and a thief (gray, mask).

const INK = '#26221d';
const PAPER = '#fffdf8';
const C = {
  maker: '#ee8f3a', player: '#2c9c8f', blue: '#4f84c4', pink: '#e07397', yellow: '#f1c04e',
  host: '#7b5fa6', thief: '#8f887b', gray: '#b9b3a7', green: '#4f9a66', red: '#df5a3f', night: '#171b2e',
};
const FRIENDS = [C.blue, C.pink, C.yellow];
const TAU = Math.PI * 2;

// ---------- small drawing helpers ----------

function rr(c, x, y, w, h, r, fill, stroke = INK, lw = 4) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function seg(c, x1, y1, x2, y2, color = INK, lw = 4, dash) {
  c.save(); c.beginPath(); c.setLineDash(dash || []); c.moveTo(x1, y1); c.lineTo(x2, y2);
  c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.stroke(); c.restore();
}
function dot(c, x, y, r, fill, stroke, lw = 4) {
  c.beginPath(); c.arc(x, y, r, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function star(c, x, y, r, fill, stroke = INK, lw = 3) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
}
function cross(c, x, y, r, color = C.red, lw = 9) {
  seg(c, x - r, y - r, x + r, y + r, color, lw); seg(c, x + r, y - r, x - r, y + r, color, lw);
}
function tick(c, x, y, r, color = C.green, lw = 9) {
  c.save(); c.beginPath(); c.moveTo(x - r, y); c.lineTo(x - r * 0.25, y + r * 0.7); c.lineTo(x + r, y - r * 0.7);
  c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); c.restore();
}
function arrowTo(c, x1, y1, x2, y2, p = 1, color = INK, lw = 5, dash) {
  const ex = x1 + (x2 - x1) * p, ey = y1 + (y2 - y1) * p;
  seg(c, x1, y1, ex, ey, color, lw, dash);
  const a = Math.atan2(y2 - y1, x2 - x1), h = 20;
  seg(c, ex, ey, ex - Math.cos(a - 0.45) * h, ey - Math.sin(a - 0.45) * h, color, lw);
  seg(c, ex, ey, ex - Math.cos(a + 0.45) * h, ey - Math.sin(a + 0.45) * h, color, lw);
}
// Dots that keep travelling along a line: "messages".
function flow(c, x1, y1, x2, y2, t, color, n = 2, speed = 0.45, r = 8) {
  for (let i = 0; i < n; i++) {
    const u = (((t * speed + i / n) % 1) + 1) % 1;
    dot(c, x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, r, color, INK, 2.5);
  }
}

// A friendly figure standing with its feet at (x, y). k = 1 is about 185 px tall.
function fig(c, x, y, k, o = {}) {
  const { color = C.player, mood = 1, t = 0, wave = false, walk = false, hat, look = 0, up = false, shrug = false } = o;
  const bob = Math.sin(t * 2.2 + x * 0.01) * 2.5 * k;
  const sw = walk ? Math.sin(t * 9) * 13 * k : 0;
  c.save(); c.translate(x, y); c.lineCap = 'round'; c.lineJoin = 'round';
  const lw = Math.max(3, 4.5 * k);
  seg(c, -14 * k, -30 * k, -14 * k - sw, 0, INK, lw); seg(c, 14 * k, -30 * k, 14 * k + sw, 0, INK, lw);
  seg(c, -14 * k - sw, 0, -24 * k - sw, 0, INK, lw); seg(c, 14 * k + sw, 0, 24 * k + sw, 0, INK, lw);
  c.translate(0, bob);
  // arms behind the body
  const sad = mood < 0;
  let lh = [-58 * k, sad ? -42 * k : -58 * k], rh = [58 * k, sad ? -42 * k : -58 * k];
  if (up) { lh = [-62 * k, -142 * k]; rh = [62 * k, -142 * k]; }
  if (shrug) { lh = [-70 * k, -108 * k]; rh = [70 * k, -108 * k]; }
  if (wave) rh = [64 * k, -138 * k + Math.sin(t * 8) * 9 * k];
  seg(c, -32 * k, -98 * k, lh[0], lh[1], INK, lw); seg(c, 32 * k, -98 * k, rh[0], rh[1], INK, lw);
  rr(c, -38 * k, -120 * k, 76 * k, 96 * k, 32 * k, color, INK, lw);
  dot(c, 0, -150 * k, 34 * k, '#fbe6cc', INK, lw);
  if (hat === 'mask') {
    c.save(); c.beginPath(); c.arc(0, -150 * k, 34 * k, 0, TAU); c.clip();
    c.fillStyle = INK; c.fillRect(-40 * k, -166 * k, 80 * k, 22 * k); c.fillRect(-40 * k, -190 * k, 80 * k, 16 * k); c.restore();
    dot(c, 0, -150 * k, 34 * k, null, INK, lw);
    dot(c, -12 * k, -155 * k, 4.5 * k, PAPER); dot(c, 12 * k, -155 * k, 4.5 * k, PAPER);
  } else {
    dot(c, -12 * k + look * 4 * k, -155 * k, 4.2 * k, INK); dot(c, 12 * k + look * 4 * k, -155 * k, 4.2 * k, INK);
  }
  c.beginPath(); c.strokeStyle = INK; c.lineWidth = Math.max(2.5, 3.5 * k);
  if (mood > 0) c.arc(0, -146 * k, 13 * k, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (mood < 0) c.arc(0, -126 * k, 12 * k, 1.2 * Math.PI, 1.8 * Math.PI);
  else { c.moveTo(-9 * k, -136 * k); c.lineTo(9 * k, -136 * k); }
  c.stroke();
  if (hat === 'cap') {
    c.beginPath(); c.arc(0, -160 * k, 35 * k, Math.PI, TAU); c.closePath(); c.fillStyle = '#c96a1f'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    seg(c, 30 * k, -160 * k, 58 * k, -158 * k, INK, lw * 1.3);
  } else if (hat === 'star') {
    star(c, 0, -196 * k, 17 * k, C.yellow, INK, Math.max(2, 3 * k));
  } else if (hat === 'glasses') {
    c.lineWidth = Math.max(2, 3 * k); c.strokeStyle = INK;
    c.strokeRect(-24 * k, -164 * k, 20 * k, 16 * k); c.strokeRect(4 * k, -164 * k, 20 * k, 16 * k); seg(c, -4 * k, -157 * k, 4 * k, -157 * k, INK, Math.max(2, 3 * k));
  }
  c.restore();
}

// A glowing lantern.
function lamp(c, x, y, r, color, glow = 1) {
  if (glow > 0) {
    const g = c.createRadialGradient(x, y, r * 0.5, x, y, r * 5.5);
    g.addColorStop(0, color + 'cc'); g.addColorStop(0.35, color + '44'); g.addColorStop(1, color + '00');
    c.save(); c.globalAlpha *= glow; c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 5.5, 0, TAU); c.fill(); c.restore();
  }
  dot(c, x, y, r, color, PAPER, Math.max(1.5, r * 0.22));
}

// Lantern Tag: a dark maze of blocks with lanterns walking the corridors.
// Lanterns loop around rectangles of corridors, so they never cross a wall.
const LOOPS = [[0, 2, 0, 2], [1, 4, 1, 3], [2, 4, 0, 1], [0, 3, 2, 3], [1, 3, 0, 3]];
function maze(c, x, y, w, h, o = {}) {
  const { t = 0, colors = [C.maker], dark = 0, bar = true, r = 18 } = o;
  const top = bar ? Math.min(34, h * 0.12) : 0;
  c.save();
  rr(c, x, y, w, h, r, C.night, INK, 4);
  c.beginPath(); c.roundRect(x, y, w, h, r); c.clip();
  if (bar) {
    c.fillStyle = '#2a3050'; c.fillRect(x, y, w, top);
    for (let i = 0; i < 3; i++) dot(c, x + 20 + i * 20, y + top / 2, 5.5, ['#df5a3f', '#f1c04e', '#4f9a66'][i]);
  }
  const nx = 4, ny = 3, ix = x + 8, iy = y + top + 8, iw = w - 16, ih = h - top - 16;
  const cw = Math.min(iw / (nx * 3.2 + 1), ih / (ny * 3.2 + 1)) * 1.25;
  const bw = (iw - (nx + 1) * cw) / nx, bh = (ih - (ny + 1) * cw) / ny;
  c.fillStyle = '#39416a';
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    c.beginPath(); c.roundRect(ix + cw + i * (bw + cw), iy + cw + j * (bh + cw), bw, bh, 6); c.fill();
  }
  const px = (i) => ix + cw / 2 + i * (bw + cw), py = (j) => iy + cw / 2 + j * (bh + cw);
  colors.forEach((col, n) => {
    const [a, b, d, e] = LOOPS[n % LOOPS.length];
    const W = px(b) - px(a), H = py(e) - py(d), per = 2 * (W + H);
    let u = ((((t * 60 * (0.9 + n * 0.13)) / per + n * 0.37) % 1) + 1) % 1 * per;
    let lx, ly;
    if (u < W) { lx = px(a) + u; ly = py(d); }
    else if (u < W + H) { lx = px(b); ly = py(d) + (u - W); }
    else if (u < 2 * W + H) { lx = px(b) - (u - W - H); ly = py(e); }
    else { lx = px(a); ly = py(e) - (u - 2 * W - H); }
    lamp(c, lx, ly, cw * 0.36, col, 1 - dark);
  });
  if (dark > 0) { c.fillStyle = `rgba(10,10,18,${0.82 * dark})`; c.fillRect(x, y, w, h); }
  c.restore();
  rr(c, x, y, w, h, r, null, INK, 4);
}

function phone(c, x, y, w, h, o = {}) {
  rr(c, x, y, w, h, Math.min(46, w * 0.14), o.fill || PAPER, o.stroke || INK, 6);
  seg(c, x + w / 2 - w * 0.12, y + 22, x + w / 2 + w * 0.12, y + 22, o.stroke || INK, 6);
}

function server(c, x, y, k = 1, o = {}) {
  const { on = 1, color = C.host } = o;
  const w = 96 * k, h = 118 * k;
  rr(c, x - w / 2, y - h / 2, w, h, 12 * k, on ? PAPER : '#d9d4c8', INK, Math.max(3, 4 * k));
  for (let i = 0; i < 3; i++) {
    const yy = y - h / 2 + (16 + i * 33) * k;
    rr(c, x - w / 2 + 12 * k, yy, w - 24 * k, 22 * k, 6 * k, on ? color + '33' : '#c9c3b6', INK, Math.max(2, 2.5 * k));
    dot(c, x + w / 2 - 26 * k, yy + 11 * k, 5 * k, on ? C.green : '#8f887b');
  }
}

// A record: a card with a ribbon corner. Words go on with s.text.
function card(c, x, y, w, h, fill = PAPER) {
  rr(c, x - w / 2, y - h / 2, w, h, 16, fill, INK, 4.5);
  c.beginPath(); c.moveTo(x + w / 2 - 70, y - h / 2); c.lineTo(x + w / 2 - 70, y - h / 2 + 62); c.lineTo(x + w / 2 - 48, y - h / 2 + 46); c.lineTo(x + w / 2 - 26, y - h / 2 + 62); c.lineTo(x + w / 2 - 26, y - h / 2);
  c.fillStyle = C.yellow; c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
}
function seal(c, x, y, r, color) {
  dot(c, x, y, r, color, INK, 3.5); tick(c, x, y, r * 0.48, PAPER, 6);
}
// A game tile: a light card with a lantern-coloured badge.
function tile(c, x, y, w, h, o = {}) {
  rr(c, x - w / 2, y - h / 2, w, h, 18, o.fill || PAPER, INK, 4.5);
}
function lanternBadge(c, x, y, r, dim = 0) {
  dot(c, x, y, r, C.night, INK, 3.5);
  lamp(c, x, y, r * 0.36, dim ? '#77736b' : C.maker, dim ? 0 : 0.9);
}

// ---------- words that repeat ----------

function problem(s, n, line, at = 0.25) {
  s.text(`PROBLEM ${n} OF 5`, { x: s.cx, y: 104, size: 32, color: 'muted', at, enter: 'fade' });
  s.text(`"${line}"`, { x: s.cx, y: 178, size: 62, font: 'display', maxWidth: 1640, at });
}
function top(s, line, at, o = {}) {
  return s.text(line, { x: s.cx, y: 140, size: 70, font: 'display', maxWidth: 1640, at, ...o });
}
function lab(s, str, x, y, o = {}) {
  return s.text(str, { x, y, size: 36, enter: 'fade', ...o });
}
function D(s, at, fn, o = {}) {
  s.draw({ at, enter: 'fade', dur: 0.4, ...o }, fn);
}

export default {
  // 1. I made a game. Now what?
  s01(s) {
    s.text('I made a game. *Now what?*', { x: s.cx, y: 150, size: 84, font: 'display', at: 0, enter: 'none' });
    const hard = s.time('#hard');
    D(s, 0, (c) => {
      maze(c, 110, 290, 860, 540, { t: s.t, colors: [C.maker, '#cfd6ff', '#cfd6ff'] });
      fig(c, 1130, 900, 1.15, { color: C.maker, hat: 'cap', t: s.t, mood: s.t > hard ? 0 : 1, look: 1, up: s.t < hard - 0.3 });
    }, { enter: 'none' });
    s.text('A multi-player game,\nmade with AI,\nin one evening.', { x: 1540, y: 470, size: 50, bg: '#fbe2c6', border: 'ink', at: 0, out: hard - 0.35, outDur: 0.3, enter: 'none' });
    lab(s, 'Lantern Tag, on your computer', 540, 885, { at: '#here' });
    D(s, '#hard', (c) => fig(c, 1500, 900, 1, { color: C.blue, t: s.t, wave: true }));
    s.text('Looks great.\nHow do I play it?', { x: 1560, y: 470, size: 48, bg: 'surface', border: 'ink', at: '#hard', enter: 'pop' });
    D(s, '#friends', (c) => {
      fig(c, 1720, 900, 1, { color: C.pink, t: s.t + 1 });
      arrowTo(c, 1230, 800, 1400, 800, 1, INK, 4, [14, 12]); arrowTo(c, 1400, 800, 1230, 800, 1, INK, 4, [14, 12]);
    });
    lab(s, 'somewhere else', 1610, 965, { at: '#friends' });
  },

  // 2. The name.
  s02(s) {
    s.text('Endless Mind', { x: s.cx, y: 190, size: 130, font: 'display', at: '#name' });
    const cols = [C.maker, ...FRIENDS];
    D(s, 0.2, (c) => {
      cols.forEach((col, i) => {
        const x = 150 + i * 420;
        maze(c, x, 330, 370, 250, { t: s.t, colors: cols });
        fig(c, x + 185, 760, 0.75, { color: col, hat: i ? undefined : 'cap', t: s.t + i });
      });
    });
    D(s, '#four', (c) => {
      for (let i = 0; i < 5; i++) {
        const x = 700 + i * 130, on = i === 0 || s.t > s.time('#four') + 0.25 * i;
        dot(c, x, 900, 40, on ? (i ? C.yellow : C.green) + (i ? '' : '') : PAPER, INK, 4);
        if (i === 0) tick(c, x, 900, 18, PAPER, 7);
      }
    }, { at: '#name' });
    ['2', '3', '4', '5'].forEach((n, i) => s.text(n, { x: 830 + i * 130, y: 902, size: 44, font: 'display', at: s.time('#four') + 0.25 * (i + 1), enter: 'fade' }));
    lab(s, 'that problem', 520, 900, { at: '#name' });
    lab(s, 'and four more', 1400, 900, { at: '#four' });
  },

  // 3. The usual answer.
  s03(s) {
    problem(s, 1, 'How does anyone else play it?');
    s.list([
      { text: 'Rent a server', at: '#a' }, { text: 'Buy a name', at: '#b' }, { text: 'Set up certificates', at: '#c' },
      { text: 'Learn to deploy', at: '#d' }, { text: 'Keep it running', at: s.time('#d') + 1.1 },
    ], { x: 250, y: 330, size: 56, gap: 44, bullet: 'square', width: 800 });
    D(s, 0.2, (c) => {
      const sad = s.t > s.time('#c');
      maze(c, 1130, 330, 330, 220, { t: s.t, colors: [C.maker] });
      fig(c, 1620, 860, 1.3, { color: C.maker, hat: 'cap', t: s.t, mood: sad ? -1 : 0, look: -1 });
    });
    s.text('A second project.\n*Not the fun one.*', { x: 1290, y: 700, size: 52, font: 'display', at: '#second' });
  },

  // 4. Ask your agent instead.
  s04(s) {
    top(s, 'Ask your AI coding agent', '#ask');
    D(s, 0.2, (c) => {
      rr(c, 130, 270, 1060, 560, 20, PAPER, INK, 5);
      seg(c, 130, 340, 1190, 340, INK, 4);
      for (let i = 0; i < 3; i++) dot(c, 170 + i * 32, 305, 9, [C.red, C.yellow, C.green][i], INK, 2.5);
      fig(c, 1560, 960, 1.05, { color: C.maker, hat: 'cap', t: s.t, look: -1 });
    });
    s.text('your AI coding agent', { x: 660, y: 306, size: 32, color: 'muted', at: 0.2, enter: 'fade' });
    const line = (str, y, at, o = {}) => s.text(str, { x: 180, y, align: 'left', valign: 'top', size: 38, font: 'mono', maxWidth: 960, lineHeight: 1.35, at, enter: 'type', cps: 45, ...o });
    line('> Make a game called Lantern Tag for Endless Mind.', 375, '#ask');
    line("Players carry lanterns in a dark maze, and whoever is 'it' has a red one.", 505, '#build');
    line('Follow github.com/freeideas/EndlessMind', 690, '#point', { color: 'blue', bold: true });
    ['Claude', 'Codex', 'Gemini'].forEach((n, i) => s.box(n, { x: 1560, y: 300 + i * 100, w: 300, h: 78, size: 44, color: 'blue', at: s.time('#names') + i * 0.55, enter: 'pop' }));
    lab(s, 'any of them', 1560, 600, { size: 44, at: 'any' });
  },

  // 5. You get a link.
  s05(s) {
    top(s, 'You get a link.', '#link');
    s.icon('file-code', { x: 330, y: 500, size: 190, color: 'blue', label: 'writes the game', labelSize: 40, at: '#writes' });
    D(s, '#starts', (c) => {
      arrowTo(c, 500, 520, 640, 520, s.p('#starts', 0.4));
      maze(c, 690, 340, 540, 360, { t: s.t, colors: [C.maker, '#cfd6ff'] });
    });
    lab(s, 'starts it on your computer', 960, 760, { size: 40, at: '#starts' });
    D(s, '#link', (c) => arrowTo(c, 1270, 520, 1380, 520, s.p('#link', 0.4)));
    s.icon('link', { x: 1590, y: 470, size: 150, color: 'accent', at: '#link' });
    s.text('https://relay.\nendlessmind.com/...', { x: 1590, y: 650, size: 38, font: 'mono', bg: 'surface', border: 'ink', at: '#link', enter: 'pop' });
    D(s, '#link', (c) => fig(c, 1590, 960, 0.9, { color: C.maker, hat: 'cap', t: s.t, up: true }));
  },

  // 6. The link works anywhere.
  s06(s) {
    top(s, 'The link works anywhere.', '#anyone');
    const fy = [400, 610, 820];
    const all = s.t > s.time('#maze');
    D(s, 0.2, (c) => {
      maze(c, 110, 380, 430, 290, { t: s.t, colors: all ? [C.maker, ...FRIENDS] : [C.maker] });
      fig(c, 325, 900, 0.9, { color: C.maker, hat: 'cap', t: s.t, wave: s.between('#send', '#maze') });
    });
    lab(s, 'your computer', 325, 945, { at: 0.2 });
    D(s, '#anyone', (c) => {
      fy.forEach((y, i) => {
        if (s.t < s.time('#anyone') + i * 0.35) return;
        fig(c, 1680, y + 60, 0.8, { color: FRIENDS[i], t: s.t + i, look: -1, up: all });
        rr(c, 1500, y - 50, 96, 60, 12, PAPER, INK, 3.5);
        seg(c, 1524, y - 20, 1572, y - 20, C.red, 7);
      });
    });
    lab(s, 'friends, anywhere', 1640, 945, { at: s.time('#anyone') + 0.9 });
    D(s, '#relay', (c) => {
      dot(c, 960, 560, 118, '#e6efe9', INK, 5);
      c.save(); c.setLineDash([10, 10]); dot(c, 960, 560, 136, null, C.player, 3.5); c.restore();
    });
    s.text('relay', { x: 960, y: 540, size: 60, font: 'display', at: '#relay' });
    lab(s, 'a go-between', 960, 600, { size: 32, at: '#relay' });
    D(s, '#carries', (c) => {
      const p = s.p('#carries', 0.7);
      fy.forEach((y, i) => {
        seg(c, 1490, y - 20, 1490 - (1490 - 1085) * p, y - 20 + (560 - (y - 20)) * p * (1 - 0.0), FRIENDS[i], 5);
        if (p >= 1) flow(c, 1490, y - 20, 1085, 560 + (i - 1) * 30, s.t + i * 0.3, FRIENDS[i], 2, 0.5);
      });
      seg(c, 835, 560, 835 - (835 - 545) * p, 560 - 30 * p, INK, 5);
      if (p >= 1) flow(c, 835, 560, 545, 530, s.t, PAPER, 3, 0.5);
    });
    s.text('No server.', { x: 700, y: 870, size: 60, font: 'display', at: '#rented' });
    s.text('Nothing to install.', { x: 1170, y: 870, size: 60, font: 'display', at: '#install' });
    lab(s, 'all in the same maze', 325, 340, { at: '#maze', color: 'accent', size: 40 });
  },

  // 7. Playing together is already handled.
  s07(s) {
    top(s, 'Your agent answers five things', '#five');
    const ps = [[250, 460, C.maker, 'cap'], [250, 720, C.blue], [1670, 460, C.pink], [1670, 720, C.yellow]];
    D(s, 0.2, (c) => {
      ps.forEach(([x, y, col, hat], i) => {
        const tx = x < 960 ? 800 : 1120, fx = x < 960 ? x + 60 : x - 60;
        seg(c, fx, y - 80, tx, 430, INK, 4);
        flow(c, fx, y - 80, tx, 430, s.t + i * 0.2, col, 1, 0.55);
        flow(c, tx, 430, fx, y - 80, s.t + 0.5, PAPER, 1, 0.55);
        fig(c, x, y, 0.8, { color: col, hat, t: s.t + i, look: x < 960 ? 1 : -1 });
      });
    });
    s.text('Keeping players in step:\nnormally the hard part of a game.', { x: s.cx, y: 820, size: 50, at: 0.4, out: s.time('#e1') - 0.5, enter: 'fade' });
    s.box('game server', { x: 960, y: 430, w: 330, h: 150, size: 46, color: 'orange', at: 0.2 });
    const ev = [['started', 'play'], ['joined', 'user-plus'], ['left', 'user-minus'], ['message', 'message-square'], ['timer', 'timer']];
    ev.forEach(([n, icon], i) => s.box(n, { x: 400 + i * 280, y: 830, w: 250, h: 150, size: 40, icon, color: 'teal', at: `#e${i + 1}`, enter: 'pop' }));
    s.text('Enough for tag, for chess, for a whole world.', { x: s.cx, y: 965, size: 44, at: '#enough', enter: 'fade' });
  },

  // 8. Problem 2: keeping who you are.
  s08(s) {
    problem(s, 2, 'Players want to keep their progress and who they are.');
    D(s, 0.2, (c) => {
      rr(c, 110, 280, 580, 640, 24, '#eef4ee', INK, 5);
      fig(c, 400, 860, 1.25, { color: C.player, hat: s.t > s.time('#p3') ? 'star' : undefined, t: s.t, up: s.between('#keep', '#every') });
    });
    lab(s, 'one game', 400, 320, { at: 0.2, color: 'muted' });
    s.icon('trophy', { x: 590, y: 700, size: 130, color: 'yellow', at: '#keep', enter: 'pop' });
    s.box('Level 12', { x: 250, y: 420, w: 230, h: 84, size: 42, color: 'green', at: '#p1', enter: 'pop' });
    s.box('Rosy', { x: 540, y: 420, w: 190, h: 84, size: 42, color: 'teal', at: '#p2', enter: 'pop' });
    lab(s, 'their style', 400, 545, { at: '#p3', color: 'muted', size: 32 });
    D(s, 0.2, (c) => rr(c, 1230, 280, 580, 640, 24, '#f0eee8', INK, 5));
    s.icon('gamepad-2', { x: 1520, y: 600, size: 200, color: 'gray', at: 0.2, out: '#behind', enter: 'fade' });
    D(s, '#every', (c) => {
      arrowTo(c, 710, 600, 1210, 600, s.p('#every', 0.6), INK, 6, [16, 12]);
    });
    lab(s, 'another game', 1520, 320, { at: 0.2, color: 'muted' });
    D(s, '#normally', (c) => {
      rr(c, 770, 380, 380, 440, 18, PAPER, INK, 4.5);
      rr(c, 805, 470, 310, 62, 10, '#f1ede2', INK, 3); rr(c, 805, 600, 310, 62, 10, '#f1ede2', INK, 3);
    });
    lab(s, 'Sign up', 960, 420, { at: '#normally', size: 40 });
    lab(s, 'email', 830, 500, { at: '#normally', align: 'left', color: 'muted', size: 32 });
    lab(s, 'password', 830, 630, { at: '#normally', align: 'left', color: 'muted', size: 32 });
    lab(s, 'forgot your\npassword?', 960, 740, { at: '#normally', color: 'blue', size: 32 });
    D(s, '#behind', (c) => fig(c, 1520, 860, 1.25, { color: C.gray, t: s.t, mood: -1 }));
    s.box('Level 1', { x: 1380, y: 420, w: 210, h: 84, size: 42, color: 'gray', at: '#behind', enter: 'pop' });
    s.box('Guest', { x: 1650, y: 420, w: 190, h: 84, size: 42, color: 'gray', at: '#behind', enter: 'pop' });
  },

  // 9. Scan and tap.
  s09(s) {
    s.text('Scan.', { x: 760, y: 140, size: 76, font: 'display', at: '#scan' });
    s.text('Tap.', { x: 960, y: 140, size: 76, font: 'display', at: '#tap' });
    s.text('In.', { x: 1130, y: 140, size: 76, font: 'display', color: 'accent', at: '#in' });
    const inn = s.t >= s.time('#in');
    D(s, 0.2, (c) => {
      rr(c, 140, 260, 800, 520, 22, PAPER, INK, 5);
      seg(c, 540, 780, 540, 850, INK, 6); seg(c, 400, 850, 680, 850, INK, 6);
      if (inn) maze(c, 170, 330, 740, 420, { t: s.t, colors: [C.player, C.maker, C.blue], bar: false });
      fig(c, 1690, 900, 1.1, { color: C.player, hat: 'star', t: s.t, look: -1, up: inn });
      phone(c, 1080, 250, 440, 690);
    });
    D(s, '#code', (c) => {
      // A made-up square code: it only looks like one.
      const n = 21, q = 14, x0 = 540 - (n * q) / 2, y0 = 545 - (n * q) / 2;
      rr(c, x0 - 18, y0 - 18, n * q + 36, n * q + 36, 10, '#ffffff', INK, 3);
      c.fillStyle = INK;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const corner = (i < 7 && j < 7) || (i > 13 && j < 7) || (i < 7 && j > 13);
        const on = corner ? (() => { const a = i > 13 ? i - 14 : i, b = j > 13 ? j - 14 : j; return a === 0 || a === 6 || b === 0 || b === 6 || (a > 1 && a < 5 && b > 1 && b < 5); })() : ((i * 7 + j * 13 + i * j * 3) % 5 < 2);
        if (on) c.fillRect(x0 + i * q, y0 + j * q, q, q);
      }
    }, { out: '#in' });
    s.text('Guest', { x: 780, y: 300, size: 36, bg: 'surface', border: 'ink', at: 0.2, out: '#in', exit: 'none', enter: 'fade' });
    s.text('Rosy Nebula', { x: 730, y: 300, size: 38, bg: 'surface', border: 'ink', color: '#1f6f66', bold: true, at: '#in', enter: 'pop' });
    D(s, '#scan', (c) => {
      const p = s.p('#scan', 0.5);
      seg(c, 1070, 560, 1070 - 300 * p, 550, C.player, 5, [14, 12]);
      c.strokeStyle = C.player; c.lineWidth = 6; c.lineCap = 'round';
      [[1150, 330, 1, 1], [1450, 330, -1, 1], [1150, 470, 1, -1], [1450, 470, -1, -1]].forEach(([x, y, a, b]) => { c.beginPath(); c.moveTo(x + 40 * a, y); c.lineTo(x, y); c.lineTo(x, y + 40 * b); c.stroke(); });
    }, { out: s.time('#scan') + 0.7 });
    lab(s, 'Sign in to', 1300, 365, { at: s.time('#scan') + 0.8, size: 34, color: 'muted' });
    lab(s, 'relay.endlessmind.com', 1300, 420, { at: s.time('#scan') + 0.8, size: 34, bold: true });
    D(s, s.time('#scan') + 0.8, (c) => {
      const press = s.p('#tap', 0.25) * (1 - s.p(s.time('#tap') + 0.25, 0.3));
      rr(c, 1140 + press * 6, 560 + press * 6, 320 - press * 12, 96 - press * 12, 48, inn ? '#3b7f51' : '#1f7f74', INK, 4.5);
      const ring = s.p('#tap', 0.8);
      if (ring > 0 && ring < 1) { c.save(); c.globalAlpha *= 1 - ring; dot(c, 1300, 608, 60 + ring * 110, null, C.player, 7); c.restore(); }
    });
    s.text('Yes, this is me', { x: 1300, y: 608, size: 38, color: '#fffdf8', bold: true, bg: '#1f7f74', padding: 4, radius: 20, at: s.time('#scan') + 0.8, out: '#in', exit: 'none', enter: 'fade' });
    s.text('Signed in', { x: 1300, y: 608, size: 40, color: '#fffdf8', bold: true, bg: '#3b7f51', padding: 4, radius: 20, at: '#in', enter: 'fade' });
    lab(s, 'First time: the phone sets\nyou up in about a minute.', 1300, 790, { at: '#first', size: 32, color: 'muted' });
    s.text('You built *nothing*.', { x: 540, y: 930, size: 60, font: 'display', at: '#built' });
  },

  // 10. Why nobody can take it away.
  s10(s) {
    top(s, "Yours. Not ours. Not the game's.", '#phone', { y: 120 });
    D(s, 0.2, (c) => {
      fig(c, 250, 620, 1, { color: C.maker, hat: 'cap', t: s.t, look: 1 });
      maze(c, 330, 440, 170, 120, { t: s.t, colors: [C.maker], bar: false, r: 10 });
    });
    lab(s, 'you, and your game', 330, 665, { at: 0.2 });
    D(s, '#notyou', (c) => { arrowTo(c, 520, 500, 660, 500, s.p('#notyou', 0.4), INK, 6); if (s.p('#notyou', 0.4) >= 1) cross(c, 690, 500, 20); });
    s.icon('building-2', { x: 1640, y: 480, size: 150, color: 'purple', label: 'us', labelSize: 40, at: '#notus' });
    D(s, '#notus', (c) => { arrowTo(c, 1540, 500, 1280, 500, s.p('#notus', 0.4), INK, 6); if (s.p('#notus', 0.4) >= 1) cross(c, 1250, 500, 20); });
    D(s, 0.2, (c) => {
      const safe = s.p('#never', 0.5);
      if (safe > 0) { c.save(); c.globalAlpha *= safe; c.setLineDash([18, 14]); rr(c, 716, 196, 488, 778, 60, null, C.green, 7); c.restore(); }
      phone(c, 740, 220, 440, 730);
      if (s.t < s.time('#phrase')) fig(c, 960, 640, 1.2, { color: C.player, hat: 'star', t: s.t });
    });
    lab(s, "the player's identity", 960, 720, { at: 0.3, out: '#phrase', exit: 'none', size: 36 });
    s.text('secret phrase', { x: 960, y: 320, size: 50, font: 'display', at: '#phrase' });
    D(s, '#phrase', (c) => {
      for (let i = 0; i < 24; i++) {
        if (s.t < s.time('#phrase') + i * 0.045) break;
        const col = i % 3, row = Math.floor(i / 3), w = 96 + ((i * 37) % 3) * 12;
        rr(c, 792 + col * 118, 380 + row * 52, w, 34, 17, ['#cfe3df', '#f6dcc0', '#dcd3ea'][i % 3], INK, 2.5);
      }
    });
    lab(s, '24 ordinary words', 960, 825, { at: s.time('#phrase') + 0.8, size: 36 });
    lab(s, 'never leaves the phone', 960, 885, { at: '#never', size: 36, color: '#2f7a48', bold: true });
    D(s, '#leak', (c) => {
      const p = s.p('#leak', 0.8, 'out');
      fig(c, 120 + 330 * p, 960, 0.95, { color: C.thief, hat: 'mask', t: s.t, walk: p < 1, mood: p < 1 ? 1 : -1, look: 1 });
      if (p >= 1) cross(c, 610, 850, 20);
    });
    lab(s, 'no password to leak', 420, 1000, { at: '#leak', size: 34 });
    s.icon('lock-open', { x: 1560, y: 800, size: 110, color: 'green', at: '#lock' });
    lab(s, 'nobody can\nlock them out', 1560, 925, { at: '#lock', size: 36 });
  },

  // 11. One identity, every game.
  s11(s) {
    top(s, 'One identity, every game', '#every');
    const rock = s.t >= s.time('#rock'), lost = s.t >= s.time('#lost');
    D(s, 0.2, (c) => {
      c.save();
      if (lost) { c.translate(290, 560); c.rotate(-0.12 * s.p('#lost', 0.5)); c.translate(-290, -560); }
      phone(c, 120, 300, 340, 520, lost ? { fill: '#e2ddd0', stroke: '#8f887b' } : {});
      if (!lost) fig(c, 290, 560, 0.75, { color: C.player, hat: 'star', t: s.t });
      c.restore();
      if (lost) cross(c, 290, 560, 110, C.red, 14);
    });
    s.text('Rosy Nebula', { x: 290, y: 640, size: 38, color: '#1f6f66', bold: true, at: 0.2, out: '#rock', exit: 'none', enter: 'fade' });
    s.text('Rockstar 812', { x: 290, y: 640, size: 38, color: '#1f6f66', bold: true, at: '#rock', out: '#lost', enter: 'pop' });
    lab(s, 'the name is theirs to choose', 290, 870, { at: '#name', out: '#lost', size: 32, color: 'muted', maxWidth: 380 });
    lab(s, 'phone lost', 290, 870, { at: '#lost', size: 40, color: 'accent' });
    const tiles = [[820, 400, 'Lantern Tag', null], [1420, 400, 'a race', 'flag'], [820, 690, 'a puzzle', 'puzzle'], [1420, 690, 'a whole world', 'earth']];
    D(s, '#every', (c) => {
      const p = s.p('#every', 0.6);
      tiles.forEach(([x, y], i) => {
        if (i % 2 === 0) seg(c, 470, 560, 470 + (x - 250 - 470) * p, 560 + (y - 560) * p, C.player, 5, [12, 10]);
        else seg(c, 1070, y, 1070 + 100 * p, y, C.player, 5, [12, 10]);
        tile(c, x, y, 500, 230);
        if (i === 0) lanternBadge(c, x - 170, y - 40, 44);
      });
    }, { out: '#lost' });
    tiles.forEach(([x, y, name, icon], i) => {
      if (icon) s.icon(icon, { x: x - 170, y: y - 40, size: 84, color: ['blue', 'purple', 'green'][i - 1], at: '#every', out: '#lost', enter: 'fade' });
      lab(s, name, x - 100, y - 40, { align: 'left', size: 38, at: '#every', out: '#lost' });
      s.text('Rosy Nebula', { x, y: y + 58, size: 36, color: '#1f6f66', bold: true, bg: '#e3f1ee', at: s.time('#every') + 0.5, out: '#everywhere', exit: 'none', enter: 'fade' });
      s.text('Rockstar 812', { x: x - 30, y: y + 58, size: 36, color: '#1f6f66', bold: true, bg: '#e3f1ee', at: '#everywhere', out: '#lost', enter: 'pop' });
      s.icon('trophy', { x: x + 150, y: y + 56, size: 52, color: 'yellow', at: s.time('#arrives') + i * 0.3, out: '#lost', enter: 'pop' });
    });
    s.text('A name and a history. Not a stranger.', { x: 1120, y: 925, size: 48, font: 'display', at: '#arrives', out: '#lost' });
    D(s, '#shot', (c) => {
      arrowTo(c, 500, 560, 690, 560, s.p('#shot', 0.4), INK, 6);
      rr(c, 740, 370, 440, 380, 18, PAPER, INK, 5);
      for (let i = 0; i < 24; i++) rr(c, 778 + (i % 4) * 96, 470 + Math.floor(i / 4) * 42, 78, 26, 13, ['#cfe3df', '#f6dcc0', '#dcd3ea'][i % 3], INK, 2);
    });
    lab(s, 'screenshot', 960, 420, { at: '#shot', size: 40 });
    lab(s, 'of the secret phrase', 960, 800, { at: '#shot', size: 36 });
    D(s, '#back', (c) => {
      arrowTo(c, 1200, 560, 1370, 560, s.p('#back', 0.4), INK, 6);
      phone(c, 1420, 300, 340, 520);
      fig(c, 1590, 560, 0.75, { color: C.player, hat: 'star', t: s.t, up: true });
    });
    s.text('Rockstar 812', { x: 1590, y: 640, size: 38, color: '#1f6f66', bold: true, at: '#back', enter: 'pop' });
    s.icon('trophy', { x: 1520, y: 730, size: 60, color: 'yellow', at: s.time('#back') + 0.3, enter: 'pop' });
    s.icon('trophy', { x: 1660, y: 730, size: 60, color: 'yellow', at: s.time('#back') + 0.5, enter: 'pop' });
    lab(s, 'new phone, same player', 1590, 870, { at: '#back', size: 34, maxWidth: 400 });
    s.text('It all comes back.', { x: 960, y: 940, size: 56, font: 'display', at: s.time('#back') + 0.4 });
  },

  // 12. Problem 3: a real reputation.
  s12(s) {
    problem(s, 3, 'I want my game to earn a real reputation.');
    const fake = (c, x) => {
      rr(c, x - 250, 290, 500, 500, 20, PAPER, INK, 4.5);
      const rows = s.t > s.time('#ai') ? 6 : 3;
      for (let j = 0; j < rows; j++) {
        if (j >= 3 && s.t < s.time('#ai') + (j - 3) * 0.25) break;
        const y = 345 + j * 76;
        dot(c, x - 195, y, 24, '#cfcabd', INK, 3); dot(c, x - 203, y - 4, 3, INK); dot(c, x - 187, y - 4, 3, INK); seg(c, x - 203, y + 9, x - 187, y + 9, INK, 2.5);
        for (let i = 0; i < 5; i++) star(c, x - 115 + i * 62, y, 25, C.yellow, INK, 2.5);
      }
    };
    D(s, '#want', (c) => {
      tile(c, 960, 430, 480, 300);
      lanternBadge(c, 960, 350, 44);
      for (let i = 0; i < 5; i++) star(c, 836 + i * 62, 525, 25, null, '#8f887b', 3);
    });
    lab(s, 'Lantern Tag', 960, 440, { at: '#want', size: 46, bold: true });
    lab(s, 'new, no players yet', 960, 620, { at: '#want', size: 34, color: 'muted' });
    D(s, '#never', (c) => [[960, C.blue], [820, C.pink], [1100, C.yellow]].forEach(([x, col], i) => { if (s.t > s.time('#never') + i * 0.35) fig(c, x, 905, 0.95, { color: col, t: s.t + i, shrug: s.t > s.time('#nobody'), mood: s.t > s.time('#nobody') ? 0 : 1 }); }));
    D(s, 0.2, (c) => { fake(c, 370); fake(c, 1550); });
    lab(s, 'other games', 370, 835, { at: 0.2, out: '#stars', exit: 'none', color: 'muted' });
    lab(s, 'easy to fake', 370, 835, { at: '#stars', out: '#ai', exit: 'none', size: 40 });
    s.icon('bot', { x: 620, y: 860, size: 100, color: 'gray', at: '#ai' });
    lab(s, 'free to fake', 370, 835, { at: '#ai', size: 40, color: 'accent' });
    D(s, '#nobody', (c) => { const p = s.p('#nobody', 0.5); seg(c, 150, 320, 150 + 440 * p, 320 + 440 * p, C.red, 12); seg(c, 1330, 320, 1330 + 440 * p, 320 + 440 * p, C.red, 12); });
    s.text('Nobody believes them.', { x: 1500, y: 870, size: 54, font: 'display', at: '#nobody' });
  },

  // 13. Records of real play.
  s13(s) {
    top(s, 'Proof of play', '#records', { y: 120 });
    D(s, 0.2, (c) => {
      maze(c, 100, 250, 420, 280, { t: s.t, colors: [C.player, C.maker, C.blue] });
      fig(c, 220, 860, 1, { color: C.player, hat: 'star', t: s.t, up: s.t > s.time('#does') });
      phone(c, 1430, 230, 380, 600);
    });
    lab(s, 'your game', 310, 575, { at: 0.2 });
    s.icon('trophy', { x: 390, y: 760, size: 120, color: 'yellow', at: '#does', enter: 'pop' });
    D(s, '#records', (c) => {
      const p = s.p('#records', 0.6, 'out');
      c.save(); c.translate(-420 * (1 - p), 0);
      card(c, 970, 440, 660, 400);
      c.restore();
    });
    lab(s, 'RECORD', 720, 290, { at: s.time('#records') + 0.5, align: 'left', size: 32, color: 'muted' });
    s.text('Won a round of\nLantern Tag.', { x: 970, y: 400, size: 58, font: 'display', at: s.time('#offer') + 0.4 });
    lab(s, 'Sign this record?', 1620, 320, { at: '#words', size: 34, color: 'muted' });
    s.text('Won a round of\nLantern Tag.', { x: 1620, y: 455, size: 36, bold: true, at: '#words', enter: 'fade' });
    D(s, '#words', (c) => { rr(c, 1462, 380, 316, 150, 12, null, C.player, 3.5); arrowTo(c, 1310, 440, 1420, 440, s.p('#words', 0.4), INK, 5); });
    D(s, '#sign', (c) => { seal(c, 720, 575, 32, C.player); if (s.t > s.time('#sign') + 0.45) seal(c, 990, 575, 32, C.maker); rr(c, 1500, 640, 240, 80, 40, C.green, INK, 4); tick(c, 1620, 680, 20, PAPER, 8); });
    lab(s, 'the player', 765, 575, { at: '#sign', align: 'left', size: 34 });
    lab(s, 'the game', 1035, 575, { at: s.time('#sign') + 0.45, align: 'left', size: 34 });
    s.box('Won a round', { x: 740, y: 860, w: 380, h: 140, size: 42, icon: 'check', color: 'green', at: '#check', enter: 'pop' });
    lab(s, 'anyone can check it', 740, 740, { at: '#check', size: 36 });
    s.box('Won ten rounds', { id: 'fake', x: 1180, y: 860, w: 420, h: 140, size: 42, icon: 'x', color: 'gray', at: '#fake', enter: 'pop' });
    lab(s, 'a changed word fails', 1180, 740, { at: '#change', size: 36 });
    s.annotate('fake', { type: 'strike', color: 'red', at: '#change' });
    D(s, '#fake', (c) => fig(c, 1500, 995, 0.75, { color: C.thief, hat: 'mask', t: s.t, mood: s.t > s.time('#change') ? -1 : 1, look: -1 }));
  },

  // 14. Reviews that mean something.
  s14(s) {
    top(s, 'A review that sits on proof', '#review');
    D(s, 0.2, (c) => {
      fig(c, 240, 880, 1.2, { color: C.player, hat: 'star', t: s.t });
      card(c, 800, 470, 660, 440);
      seal(c, 550, 395 + 100, 30, C.player); seal(c, 820, 395 + 100, 30, C.maker);
      seg(c, 510, 560, 1090, 560, INK, 3, [10, 10]);
    });
    lab(s, 'RECORD', 550, 300, { at: 0.2, align: 'left', size: 32, color: 'muted' });
    s.text('Won a round of Lantern Tag.', { x: 780, y: 385, size: 44, font: 'display', at: 0.2, enter: 'fade' });
    lab(s, 'the player', 595, 495, { at: 0.2, align: 'left', size: 32 });
    lab(s, 'the game', 865, 495, { at: 0.2, align: 'left', size: 32 });
    s.text('"Harder than it looks."', { x: 800, y: 625, size: 52, font: 'hand', color: 'blue', at: '#add', enter: 'type', cps: 16 });
    D(s, '#go', (c) => {
      [[420, C.blue], [640, C.host], [860, C.green], [1080, C.pink]].forEach(([x, col], i) => {
        if (s.t < s.time('#go') + i * 0.2) return;
        rr(c, x - 85, 800, 170, 120, 12, PAPER, INK, 4); dot(c, x - 40, 860, 24, col, INK, 3); seg(c, x, 845, x + 60, 845, INK, 4); seg(c, x, 875, x + 45, 875, INK, 4);
      });
      seg(c, 300, 930, 1200, 930, INK, 6);
    });
    lab(s, 'their records go where they go', 750, 980, { at: '#go' });
    D(s, 0.2, (c) => { tile(c, 1560, 470, 420, 300); lanternBadge(c, 1560, 410, 50); });
    D(s, '#point', (c) => {
      arrowTo(c, 1150, 470, 1330, 470, s.p('#point', 0.5), C.maker, 8);
    });
    lab(s, 'your game', 1560, 530, { at: 0.2, size: 44, bold: true });
    lab(s, 'every record points back', 1560, 680, { at: '#point', size: 36, maxWidth: 420 });
  },

  // 15. A reputation nobody can buy.
  s15(s) {
    top(s, 'No likes. No votes. *Play.*', '#likes');
    const pl = [[840, 520, C.player, 'star'], [960, 620, C.blue], [1080, 520, C.pink]];
    D(s, '#real', (c) => {
      pl.forEach(([x, y, col, hat], i) => fig(c, x, y, 0.75, { color: col, hat, t: s.t + i }));
      const p = s.p('#real', 0.6);
      arrowTo(c, 1160, 440, 1160 + 170 * p, 440, 1, C.maker, 8);
      tile(c, 1570, 440, 420, 260); lanternBadge(c, 1440, 440, 46);
    }, { at: 0.2 });
    lab(s, 'Lantern Tag', 1610, 440, { at: 0.2, size: 42, bold: true });
    lab(s, 'real play', 1245, 390, { at: '#real', size: 36, color: '#b35d14', bold: true });
    lab(s, 'real players', 960, 680, { at: '#real', size: 36 });
    D(s, '#thousand', (c) => {
      for (let i = 0; i < 16; i++) {
        if (s.t < s.time('#thousand') + i * 0.04) break;
        const x = 560 + (i % 8) * 64 + (Math.floor(i / 8) % 2) * 30, y = 850 + Math.floor(i / 8) * 62;
        dot(c, x, y, 25, '#cfcabd', INK, 3); dot(c, x - 8, y - 4, 3, INK); dot(c, x + 8, y - 4, 3, INK); seg(c, x - 8, y + 9, x + 8, y + 9, INK, 2.5);
      }
      const p = s.p(s.time('#thousand') + 0.9, 0.5);
      if (p > 0) { arrowTo(c, 1110, 850, 1110 + 200 * p, 850 - 140 * p, 1, '#8f887b', 6, [14, 12]); if (p >= 1) cross(c, 1340, 690, 22); }
    });
    lab(s, 'a thousand invented players', 800, 985, { at: '#thousand', size: 36 });
    lab(s, 'add nothing', 1320, 865, { at: s.time('#thousand') + 1.4, size: 40, color: 'accent' });
    s.box('a game that is\nalready trusted', { id: 'trusted', x: 330, y: 440, w: 400, h: 200, size: 40, color: 'green', icon: 'shield-check', at: 0.2 });
    s.annotate('trusted', { type: 'box', color: 'green', padding: 14, at: '#because' });
    D(s, '#record', (c) => arrowTo(c, 545, 440, 545 + 185 * s.p('#record', 0.6), 440, 1, C.green, 8));
    lab(s, 'has their play\non record', 690, 335, { at: '#record', size: 34, color: '#2f7a48', bold: true });
    s.icon('coins', { id: 'coins', x: 330, y: 760, size: 110, color: 'yellow', at: '#bought' });
    lab(s, 'cannot be bought', 330, 860, { at: '#bought', size: 36 });
    s.annotate('coins', { type: 'cross', color: 'red', at: s.time('#bought') + 0.3 });
    D(s, '#believe', (c) => {
      const p = s.p('#believe', 0.9, 'inOut');
      const yl = 750 - 150 * p;
      rr(c, 1570, 600 + 75 * p, 300, 60, 12, '#ece7da', INK, 3); rr(c, 1570, 675 + 75 * p, 300, 60, 12, '#ece7da', INK, 3);
      rr(c, 1570, yl, 300, 60, 12, '#fbe2c6', INK, 4); lanternBadge(c, 1610, yl + 30, 20);
      seg(c, 1650, yl + 30, 1830, yl + 30, C.maker, 8);
      arrowTo(c, 1530, 810, 1530, 810 - 190 * p, 1, C.green, 7);
    });
    lab(s, 'so people believe it', 1640, 885, { at: '#believe', size: 36, bold: true });
  },

  // 16. Problem 4: my game stops when my computer does.
  s16(s) {
    problem(s, 4, 'My game stops when my computer does.');
    const stop = s.time('#stops') + 0.9, off = s.p(stop, 0.7);
    const wins = [[1130, 300], [1500, 300], [1130, 590], [1500, 590]];
    D(s, 0.2, (c) => {
      // the laptop: its screen folds down
      const open = 1 - off;
      c.save(); c.translate(430, 700); c.scale(1, Math.max(0.04, open)); maze(c, -220, -310, 440, 300, { t: Math.min(s.t, stop), colors: [C.maker, ...FRIENDS], bar: false }); c.restore();
      rr(c, 170, 700, 520, 34, 12, '#d9d4c8', INK, 5);
      fig(c, 430, 960, 1.05, { color: C.maker, hat: 'cap', t: s.t, mood: off > 0.5 ? -1 : 1 });
      wins.forEach(([x, y], i) => {
        if (i % 2 === 0) seg(c, 700, 690, x, y + 115, off > 0.5 ? '#b9b3a7' : INK, 4, [12, 12]); else seg(c, x - 50, y + 115, x, y + 115, off > 0.5 ? '#b9b3a7' : INK, 4, [12, 12]);
        maze(c, x, y, 320, 230, { t: Math.min(s.t, stop + 0.3), colors: [C.maker, ...FRIENDS], dark: s.p(stop + 0.4 + i * 0.12, 0.6) });
      });
      if (off >= 1) cross(c, 900, 560, 30);
    });
    lab(s, 'your computer', 150, 900, { at: 0.2, size: 34, align: 'left' });
    lab(s, 'your friends', 1475, 870, { at: 0.2 });
    s.icon('server', { id: 'nosrv', x: 760, y: 880, size: 110, color: 'gray', at: '#server' });
    lab(s, 'and still no server, please', 940, 980, { at: '#server', size: 36 });
    s.annotate('nosrv', { type: 'cross', color: 'red', at: s.time('#server') + 0.3 });
  },

  // 17. Hosts and their boards.
  s17(s) {
    top(s, 'Anyone can run a host', '#host');
    hosts(s, '#others', 0);
    s.icon('server', { x: 1185, y: 500, size: 240, color: 'purple', at: '#host', out: '#board' });
    s.text('the same program,\non a small rented server', { x: 1185, y: 720, size: 46, at: 'same', out: '#board', enter: 'fade' });
    board(s, '#board', 0);
  },

  // 18. Wishes.
  s18(s) {
    top(s, 'Wanted games find a home.', '#home');
    hosts(s, -1, 1);
    board(s, -1, 1);
    D(s, 0.2, (c) => fig(c, 1730, 620, 0.9, { color: C.player, hat: 'star', t: s.t, look: -1, wave: s.between('#wish', '#load') }));
    D(s, '#wish', (c) => arrowTo(c, 1660, 500, 1560, 500, s.p('#wish', 0.4), C.player, 6));
    lab(s, 'No asking. No paying.', 1150, 985, { at: '#asking', size: 44, bold: true });
  },

  // 19. Why a stranger would run your code.
  s19(s) {
    top(s, 'Every game server is sealed', '#sealed');
    D(s, '#why', (c) => { fig(c, 230, 930, 1, { color: C.host, hat: 'glasses', t: s.t, mood: s.t > s.time('#sealed') ? 1 : 0, look: 1 }); server(c, 400, 860, 1); });
    s.text("Run a stranger's\ncode?", { x: 290, y: 640, size: 42, bg: 'surface', border: 'ink', at: '#why', out: '#talk', enter: 'pop' });
    s.icon('file-code', { x: 960, y: 450, size: 220, color: 'orange', label: 'your code, on their server', labelSize: 44, at: 0.3, out: s.time('#sealed') - 0.3 });
    D(s, '#sealed', (c) => {
      rr(c, 660, 270, 600, 430, 30, 'rgba(160,205,225,0.28)', '#3c6fa8', 7);
      rr(c, 676, 286, 568, 398, 22, null, '#3c6fa899', 3);
      seg(c, 700, 330, 760, 300, '#ffffff', 8); seg(c, 700, 370, 800, 310, '#ffffff', 6);
      rr(c, 900, 688, 120, 24, 8, '#f7f3ea', '#3c6fa8', 5);
      lanternBadge(c, 960, 400, 40);
    });
    s.text('game server', { x: 960, y: 500, size: 52, font: 'display', at: '#sealed' });
    s.icon('folder', { x: 400, y: 380, size: 120, color: 'orange', label: 'files', labelSize: 40, at: '#files' });
    D(s, '#files', (c) => { const p = s.p('#files', 0.5); arrowTo(c, 800, 440, 800 - 110 * p, 440, 1, INK, 6, [12, 10]); if (p >= 1) cross(c, 650, 440, 22); });
    s.icon('globe', { x: 1520, y: 380, size: 120, color: 'blue', label: 'network', labelSize: 40, at: '#net' });
    D(s, '#net', (c) => { const p = s.p('#net', 0.5); arrowTo(c, 1120, 440, 1120 + 110 * p, 440, 1, INK, 6, [12, 10]); if (p >= 1) cross(c, 1272, 440, 22); });
    D(s, '#talk', (c) => {
      [[800, C.player, 'star'], [960, C.blue], [1120, C.pink]].forEach(([x, col, hat], i) => {
        seg(c, 960, 712, x, 850, INK, 4);
        flow(c, 960, 712, x, 850, s.t + i * 0.3, C.maker, 1, 0.7, 9);
        fig(c, x, 990, 0.7, { color: col, hat, t: s.t + i });
      });
    });
    lab(s, 'It can only talk\nto its players.', 1500, 880, { at: '#talk', size: 44, bold: true });
  },

  // 20. The game plays on.
  s20(s) {
    top(s, 'The game plays on.', '#on');
    const on = s.p('#on', 0.6);
    const wins = [[1180, 300], [1520, 300], [1180, 590], [1520, 590]];
    D(s, 0, (c) => {
      c.save(); c.translate(300, 700); c.scale(1, 0.04); maze(c, -200, -280, 400, 270, { colors: [], bar: false }); c.restore();
      rr(c, 70, 700, 460, 34, 12, '#d9d4c8', INK, 5);
      fig(c, 300, 960, 1.05, { color: C.maker, hat: 'cap', t: s.t, mood: on > 0.5 ? 1 : 0, up: on >= 1 });
      wins.forEach(([x, y], i) => maze(c, x, y, 300, 220, { t: s.t, colors: [C.maker, ...FRIENDS], dark: 1 - s.p(s.time('#on') + i * 0.1, 0.6) }));
    }, { enter: 'none' });
    lab(s, 'your computer: off', 300, 640, { at: 0.2, size: 36 });
    D(s, '#on', (c) => {
      [[800, 430], [800, 720]].forEach(([x, y], i) => {
        server(c, x, y, 1.1); lanternBadge(c, x - 4, y - 96, 26);
        const [wx, wy] = wins[i * 2]; seg(c, x + 60, y, wx, wy + 110, C.host, 5); flow(c, x + 60, y, wx, wy + 110, s.t, C.maker, 2, 0.7, 8); seg(c, wx + 300, wy + 110, wx + 340, wy + 110, C.host, 5);
      });
    });
    lab(s, 'hosts', 800, 880, { at: '#on', size: 40 });
  },

  // 21. Problem 5: a platform could switch my game off.
  s21(s) {
    problem(s, 5, 'A platform could switch my game off.');
    const closed = s.t >= s.time('#switch');
    D(s, '#platform', (c) => {
      rr(c, 560, 420, 800, 500, 10, PAPER, INK, 5);
      for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(540 + i * 105, 330); c.lineTo(645 + i * 105, 330); c.lineTo(645 + i * 105, 420); c.arc(592.5 + i * 105, 420, 52.5, 0, Math.PI); c.closePath(); c.fillStyle = i % 2 ? PAPER : C.host; c.fill(); c.strokeStyle = INK; c.lineWidth = 4; c.stroke(); }
      rr(c, 620, 640, 420, 200, 8, closed ? '#cfcabd' : '#e6efe9', INK, 4.5);
      lanternBadge(c, 720, 740, 52, closed);
      dot(c, 850, 740, 40, closed ? '#b9b3a7' : C.blue, INK, 3.5); rr(c, 920, 700, 80, 80, 14, closed ? '#b9b3a7' : C.green, INK, 3.5);
      rr(c, 1120, 640, 180, 280, 6, closed ? '#8f887b' : '#c9a37a', INK, 4.5); dot(c, 1150, 790, 9, INK);
      fig(c, 300, 920, 1.15, { color: C.maker, hat: 'cap', t: s.t, mood: closed ? -1 : s.t > s.time('#rules') ? 0 : 1, look: 1 });
    }, { at: 0.2 });
    lab(s, "someone's platform", 960, 965, { at: '#platform', size: 36 });
    const sign = (str, at, out, o = {}) => s.text(str, { x: 960, y: 545, size: 60, font: 'display', bg: 'surface', border: 'ink', padding: 26, at, out, exit: 'none', enter: 'pop', ...o });
    sign('OPEN', 0.2, '#rules', { color: '#2f7a48', enter: 'fade' });
    sign('NEW RULES', '#rules', '#cut');
    sign('A BIGGER CUT', '#cut', '#switch');
    sign('CLOSED', '#switch', undefined, { color: 'accent' });
    lab(s, 'your game', 720, 610, { at: 0.4, size: 32, color: 'muted' });
  },

  // 22. No center.
  s22(s) {
    top(s, 'Endless Mind has no center', '#center', { y: 120 });
    const N = [[560, 360], [960, 290], [1360, 360], [1520, 640], [1170, 850], [750, 850], [400, 640]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [0, 5], [1, 3], [2, 4], [6, 5]];
    const gone = s.t >= s.time('#special') + 0.6;
    // how far the "found" wave has spread from host 6, in hops
    const hop = [2, 3, 4, 3, 2, 1, 0];
    D(s, 0.2, (c) => {
      const wave = (s.t - s.time('#reach') - 0.6) / 0.45;
      E.forEach(([a, b], i) => {
        const dead = gone && (a === 3 || b === 3);
        const found = wave > Math.max(hop[a], hop[b]);
        seg(c, N[a][0], N[a][1], N[b][0], N[b][1], dead ? '#cfcabd' : found ? C.player : INK, found && !dead ? 6 : 4, dead ? [10, 12] : undefined);
        if (s.t > s.time('#cards') && !dead) {
          const u = (((s.t * 0.28 + i * 0.37) % 1) + 1) % 1, x = N[a][0] + (N[b][0] - N[a][0]) * u, y = N[a][1] + (N[b][1] - N[a][1]) * u;
          rr(c, x - 22, y - 15, 44, 30, 5, C.yellow, INK, 2.5); seg(c, x - 12, y - 4, x + 12, y - 4, INK, 2); seg(c, x - 12, y + 5, x + 6, y + 5, INK, 2);
        }
      });
      N.forEach(([x, y], i) => {
        const dead = gone && i === 3;
        server(c, x, y, 0.95, { on: dead ? 0 : 1 });
        if (dead) cross(c, x, y, 34, C.red, 10);
        if (wave > hop[i] && !dead) { c.save(); dot(c, x, y, 82, null, C.player, 5); c.restore(); }
      });
    });
    D(s, '#reach', (c) => { fig(c, 150, 960, 0.9, { color: C.player, hat: 'star', t: s.t, look: 1 }); arrowTo(c, 200, 820, 200 + 140 * s.p('#reach', 0.5), 820 - 110 * s.p('#reach', 0.5), 1, C.player, 6); });
    s.text('cards: where a host is,\nand what it runs', { x: 960, y: 590, size: 40, at: '#cards', out: '#reach', enter: 'fade' });
    s.text('Reach one host,\nfind the rest.', { x: 960, y: 590, size: 50, font: 'display', at: s.time('#reach') + 0.3, out: '#special' });
    s.text('No host is special.\n*Ours included.*', { x: 960, y: 590, size: 50, font: 'display', at: s.time('#special') + 0.5 });
    s.text('ours', { x: 960, y: 185, size: 34, bg: 'surface', border: 'ink', at: 'ours', enter: 'pop' });
  },

  // 23. Your turn.
  s23(s) {
    D(s, 0, (c) => {
      fig(c, 230, 520, 1.05, { color: C.maker, hat: 'cap', t: s.t, wave: s.between('#send', '#solved'), look: 1 });
      fig(c, 1700, 520, 1.05, { color: C.blue, t: s.t, look: -1, up: s.t > s.time('#send') + 0.8 });
    }, { enter: 'none' });
    s.text('Looks great.\nHow do I play it?', { x: 1330, y: 220, size: 44, bg: 'surface', border: 'ink', at: 0, enter: 'none' });
    s.text('Lantern Tag, coming up...', { x: 620, y: 240, size: 40, bg: '#fbe2c6', border: 'ink', at: '#describe', out: '#send', exit: 'none', enter: 'pop' });
    s.text('Here is the link. Come play!', { x: 640, y: 420, size: 44, bg: '#fbe2c6', border: 'ink', at: '#send', enter: 'pop' });
    s.icon('link', { x: 1130, y: 420, size: 80, color: 'accent', at: '#send' });
    const done = ['a link', 'one identity', 'real reputation', 'hosts', 'no center'];
    const w = [230, 310, 370, 220, 280]; let x = 960 - (w.reduce((a, b) => a + b) + 4 * 28) / 2;
    done.forEach((n, i) => { s.box(n, { x: x + w[i] / 2, y: 640, w: w[i], h: 136, size: 38, icon: 'check', color: 'green', at: s.time('#solved') + i * 0.28, enter: 'pop' }); x += w[i] + 28; });
    s.text('endlessmind.com', { x: s.cx, y: 815, size: 124, font: 'display', color: 'accent', at: '#free' });
    s.text('free, open, and yours to build on', { x: s.cx, y: 945, size: 48, at: s.time('#free') + 0.6, enter: 'fade' });
  },
};

// ---------- the hosts and the board, shared by scenes 17 and 18 ----------

const HOSTS = [[230, 400, '#7b5fa6'], [230, 630, '#5f8fa6'], [230, 860, '#a6845f']];
function hosts(s, at, wishing) {
  D(s, at, (c) => {
    HOSTS.forEach(([x, y, col], i) => {
      if (!wishing && s.t < s.time('#others') + i * 0.3) return;
      fig(c, x, y, 0.8, { color: col, hat: 'glasses', t: s.t + i });
      server(c, x + 150, y - 62, 0.95, { color: col });
      if (wishing || s.t >= s.time('#board')) seg(c, x + 205, y - 62, 760, 560, '#8f887b', 3, [10, 10]);
      if (wishing) {
        const p = s.p(s.time('#load') + 0.5 + i * 0.9, 0.5, 'outBack');
        if (i < 2 && p > 0) lanternBadge(c, x + 300 - 60 * (1 - p), y - 62, 34 * p);
      }
    });
  }, at === -1 ? { enter: 'none' } : {});
  if (wishing) {
    lab(s, 'loads it by itself', 600, 250, { at: s.time('#load') + 0.6, size: 34, color: '#b35d14', bold: true });
  }
}
const GAMES = [['Lantern Tag', 3, C.maker], ['Endless Maze', 5, C.blue], ['Monster Maze', 4, C.green]];
function board(s, at, wishing) {
  const a = at === -1 ? { at: -1, enter: 'none' } : { at };
  const tw = wishing ? s.time('#wish') : Infinity;
  D(s, at, (c) => {
    rr(c, 770, 280, 830, 620, 22, PAPER, INK, 5);
    seg(c, 770, 380, 1600, 380, INK, 4);
    GAMES.forEach(([, heads, col], i) => {
      const y = 480 + i * 140;
      if (i) seg(c, 800, y - 70, 1570, y - 70, '#cfcabd', 3);
      dot(c, 830, y, 26, i ? col : C.night, INK, 3); if (!i) lamp(c, 830, y, 9, C.maker, 0.9);
      for (let h = 0; h < heads; h++) dot(c, 1200 + h * 34, y, 14, '#fbe6cc', INK, 2.5);
      const wished = !i && s.t >= tw;
      rr(c, 1420, y - 36, 150, 72, 36, wished ? C.yellow : PAPER, INK, 3.5);
      if (wished) { const n = Math.min(4, 1 + Math.floor((s.t - tw) / 0.7)); for (let k = 0; k < n; k++) star(c, 1440 + k * 38, y - 70, 15, C.yellow, INK, 2.5); }
    });
  }, at === -1 ? { enter: 'none' } : {});
  s.text('board', { x: 860, y: 332, size: 50, font: 'display', align: 'left', ...a });
  s.text('play on record', { x: 1290, y: 334, size: 32, color: 'muted', ...a, enter: at === -1 ? 'none' : 'fade' });
  GAMES.forEach(([name], i) => {
    s.text(name, { x: 875, y: 480 + i * 140, size: 40, align: 'left', bold: !i, ...a, enter: at === -1 ? 'none' : 'fade' });
    s.text('wish', { x: 1495, y: 480 + i * 140, size: 36, ...a, enter: at === -1 ? 'none' : 'fade' });
  });
}
