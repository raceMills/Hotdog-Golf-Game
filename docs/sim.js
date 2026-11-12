// Hotdog Golf: courses, ground physics, and share-code verification.
// Shots are resolved by resolveShot() in shot.js. Every phone must produce identical results,
// so inputs are integers and the only floats are + - * / and sqrt.
const W = 360, H = 600, BR = 5, GREEN_R = 30, CUP_R = 6, SINK_V = 3.5;
const MAX_STROKES = 10, MAX_FRAMES = 900, STOP2 = 0.0016;
const FRIC = { fairway: 0.982, green: 0.968, rough: 0.948, sand: 0.86 };
const INK = '#1d2b1a';

const COURSES = [
  { name: 'Sunny Meadows', blurb: 'Wide fairways, friendly bunkers',
    rough: '#58b04a', fair: '#9be46f', green: '#c4f49a', walls: '#b5764a',
    holes: [
      { par: 3, tee: [180, 520], cup: [180, 90], fair: [[120, 60, 120, 500]],
        haz: [{ t: 'sand', x: 236, y: 250, w: 52, h: 38 }], walls: [], trees: [[130, 330, 13], [232, 170, 13]] },
      { par: 4, tee: [150, 520], cup: [250, 110], fair: [[110, 300, 140, 260], [160, 60, 140, 260]],
        haz: [{ t: 'water', cx: 190, cy: 380, r: 30 }], walls: [], trees: [[275, 200, 13]] },
      { par: 5, tee: [180, 520], cup: [190, 80], fair: [[100, 60, 170, 500]],
        haz: [{ t: 'sand', x: 100, y: 180, w: 40, h: 90 }, { t: 'water', cx: 250, cy: 300, r: 26 }], walls: [], trees: [[240, 420, 13]] }
    ] },
  { name: 'Sandy Dunes', blurb: 'Bunkers everywhere',
    rough: '#e9c46a', fair: '#9ad65f', green: '#c8f08f', walls: '#c0754a',
    holes: [
      { par: 3, tee: [180, 520], cup: [180, 100], fair: [[120, 60, 120, 500]],
        haz: [{ t: 'sand', x: 110, y: 230, w: 30, h: 130 }, { t: 'sand', x: 220, y: 230, w: 30, h: 130 }],
        walls: [[160, 330, 40, 14]], trees: [] },
      { par: 4, tee: [120, 520], cup: [260, 90], fair: [[90, 260, 150, 300], [190, 80, 120, 200]],
        haz: [{ t: 'sand', x: 90, y: 150, w: 70, h: 110 }, { t: 'sand', x: 240, y: 300, w: 50, h: 60 }],
        walls: [], trees: [[200, 210, 12]] },
      { par: 4, tee: [180, 520], cup: [180, 70], fair: [[130, 60, 100, 500]],
        haz: [{ t: 'sand', x: 70, y: 200, w: 60, h: 50 }, { t: 'sand', x: 230, y: 200, w: 60, h: 50 }, { t: 'sand', x: 140, y: 130, w: 80, h: 40 }],
        walls: [[150, 400, 12, 50]], trees: [] }
    ] },
  { name: 'Pirate Cove', blurb: 'Water hazards and rocks',
    rough: '#3a9d5d', fair: '#7fcf6a', green: '#b6f08a', walls: '#8b5a2b',
    holes: [
      { par: 3, tee: [180, 520], cup: [180, 100], fair: [[130, 60, 100, 500]],
        haz: [{ t: 'water', x: 130, y: 250, w: 60, h: 50 }], walls: [[230, 300, 12, 120]], trees: [] },
      { par: 4, tee: [150, 520], cup: [240, 90], fair: [[100, 280, 160, 280], [170, 70, 120, 230]],
        haz: [{ t: 'water', cx: 250, cy: 380, r: 34 }, { t: 'water', x: 100, y: 150, w: 50, h: 80 }],
        walls: [[200, 200, 12, 80]], trees: [[140, 400, 12]] },
      { par: 5, tee: [180, 520], cup: [180, 80], fair: [[110, 60, 140, 500]],
        haz: [{ t: 'water', cx: 120, cy: 300, r: 30 }, { t: 'water', cx: 240, cy: 230, r: 28 }],
        walls: [[150, 160, 60, 12], [150, 400, 12, 80]], trees: [[200, 340, 12]] }
    ] }
];

function inRect(r, x, y) { return x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]; }
function inHaz(z, x, y) {
  if (z.r !== undefined) { const dx = x - z.cx, dy = y - z.cy; return dx * dx + dy * dy < z.r * z.r; }
  return x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;
}
function zoneAt(h, x, y) {
  if (x < 0 || x > W || y < 0 || y > H) return 'out';
  const gx = x - h.cup[0], gy = y - h.cup[1];
  if (gx * gx + gy * gy < GREEN_R * GREEN_R) return 'green';
  for (const z of h.haz) if (inHaz(z, x, y)) return z.t;
  for (const r of h.fair) if (inRect(r, x, y)) return 'fairway';
  return 'rough';
}
function collideRect(b, r) {
  const cx = Math.min(Math.max(b.x, r[0]), r[0] + r[2]);
  const cy = Math.min(Math.max(b.y, r[1]), r[1] + r[3]);
  const dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
  if (d2 >= BR * BR) return;
  if (d2 === 0) { b.x -= b.vx; b.y -= b.vy; b.vx *= -0.5; b.vy *= -0.5; return; }
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
  b.x = cx + nx * BR; b.y = cy + ny * BR;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { const k = 1.55 * vn; b.vx -= k * nx; b.vy -= k * ny; }
}
function collideCircle(b, c) {
  const dx = b.x - c[0], dy = b.y - c[1], R = BR + c[2], d2 = dx * dx + dy * dy;
  if (d2 >= R * R) return;
  let d = Math.sqrt(d2); if (d === 0) d = 1e-6;
  const nx = dx / d, ny = dy / d;
  b.x = c[0] + nx * R; b.y = c[1] + ny * R;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { const k = 1.7 * vn; b.vx -= k * nx; b.vy -= k * ny; }
}

// Ground roll from (sx,sy) with velocity (vx,vy). Used after a shot lands.
function simulate(h, sx, sy, vx, vy) {
  const b = { x: sx, y: sy, vx: vx, vy: vy }, path = [[sx, sy]];
  for (let f = 0; f < MAX_FRAMES; f++) {
    b.x += b.vx; b.y += b.vy;
    const z = zoneAt(h, b.x, b.y);
    if (z === 'out' || z === 'water') { path.push([b.x, b.y]); return { path, x: sx, y: sy, sunk: false, pen: true }; }
    const fr = FRIC[z]; b.vx *= fr; b.vy *= fr;
    for (const r of h.walls) collideRect(b, r);
    for (const t of h.trees) collideCircle(b, t);
    path.push([b.x, b.y]);
    const gx = b.x - h.cup[0], gy = b.y - h.cup[1];
    const sp2 = b.vx * b.vx + b.vy * b.vy;
    if (gx * gx + gy * gy < CUP_R * CUP_R && sp2 < SINK_V * SINK_V) return { path, x: h.cup[0], y: h.cup[1], sunk: true, pen: false };
    if (sp2 < STOP2) break;
  }
  return { path, x: b.x, y: b.y, sunk: false, pen: false };
}

// MARK: share codes ("HDG1:" + base64url of JSON)
// Each shot is 7 integers: club, power, path, timing, ax, ay, seed.
function toB64(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromB64(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}
// shotLists: per hole, an array of shot objects {club,power,path,timing,ax,ay,seed}
function encodeRound(name, ci, eventId, score, shotLists) {
  const h = shotLists.map(list => list.flatMap(s => [s.club, s.power, s.path, s.timing, s.ax, s.ay, s.seed]));
  return 'HDG1:' + toB64(JSON.stringify({ v: 2, n: name, c: ci, e: eventId || '', s: score, h: h }));
}
function isInt(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }

// Re-plays every shot in a code and checks the claimed score.
function verifyCode(text) {
  try {
    const m = String(text).trim().match(/HDG1:([A-Za-z0-9_-]+)/);
    if (!m) throw 'Not a Hotdog Golf code';
    const d = JSON.parse(fromB64(m[1]));
    if (d.v !== 2) throw 'Old code format, ask for a new one';
    const C = COURSES[d.c];
    if (!C) throw 'Unknown course';
    if (!Array.isArray(d.h) || d.h.length !== C.holes.length) throw 'Wrong number of holes';
    const holes = []; let total = 0;
    C.holes.forEach((h, hi) => {
      const flat = d.h[hi];
      if (!Array.isArray(flat) || flat.length % 7 || flat.length / 7 > MAX_STROKES) throw 'Bad shot data';
      let x = h.tee[0], y = h.tee[1], strokes = 0, k = 0, done = false;
      while (!done) {
        if (k * 7 >= flat.length) throw 'Hole ' + (hi + 1) + ' is unfinished';
        const s = flat.slice(7 * k, 7 * k + 7); k++;
        if (!isInt(s[0], 0, 4) || !isInt(s[1], 0, 1000) || !isInt(s[2], -2000, 2000) || !isInt(s[3], -2000, 2000) ||
            !isInt(s[4], -1000, 1000) || !isInt(s[5], -1000, 1000) || !isInt(s[6], 0, 2147483647)) throw 'Bad shot';
        const r = resolveShot(h, x, y, { club: s[0], power: s[1], path: s[2], timing: s[3], ax: s[4], ay: s[5], seed: s[6] });
        strokes += r.pen ? 2 : 1; x = r.x; y = r.y;
        done = r.sunk || strokes >= MAX_STROKES;
      }
      if (k * 7 !== flat.length) throw 'Extra shots on hole ' + (hi + 1);
      holes.push(flat); total += strokes;
    });
    if (total !== d.s) throw 'Score does not match the shots';
    return { name: String(d.n).slice(0, 16), course: d.c, eventId: String(d.e || ''), score: total, holes: holes, code: m[0] };
  } catch (err) {
    return { error: typeof err === 'string' ? err : 'Could not read this code' };
  }
}
