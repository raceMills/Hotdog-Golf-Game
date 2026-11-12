// Hotdog Golf drawing. Ground is drawn in course coordinates; the game sets the view transform.
// Visual-only randomness uses a fixed hash so textures stay put between frames.
const TILT = 0.7;                    // ground foreshortening used in the 3rd-person view
const BUNS = ['#f3c27a', '#e8a85c', '#d98c45', '#c97a3a', '#f7d9a8'];
const TOPPINGS = ['#e53935', '#ffd23f', '#8bc34a', '#ff9f43'];
const TOPPING_NAMES = ['Ketchup', 'Mustard', 'Relish', 'Onion'];
const HATS = ['cap', 'visor', 'bucket', 'chef'];
const HAT_NAMES = { cap: 'Cap', visor: 'Visor', bucket: 'Bucket', chef: 'Chef' };
const HAZ = { sand: '#f7e3a1', water: '#4cc9f0' };
const SAUSAGE = '#d64541';

// Fixed pseudo-random 0..1 for a grid cell (visual texture only; never used by the sim).
function hash01(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function gfxTime() { return performance.now() / 1000; }

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
// Linear gradient helper in local units.
function lin(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(s => g.addColorStop(s[0], s[1]));
  return g;
}
function shade(hex, amt) {
  // Mix a #rrggbb colour toward black (amt<0) or white (amt>0). amt in -1..1.
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, k = Math.abs(amt);
  r = Math.round(r + (t - r) * k); g = Math.round(g + (t - g) * k); b = Math.round(b + (t - b) * k);
  return `rgb(${r},${g},${b})`;
}

// Hotdog golfer, upright, centred on (x,y) in the current transform's units. ~40 tall at s=1.
function drawHotdog(c, p, x, y, s) {
  const bun = BUNS[p.skin], top = TOPPINGS[p.shirt];
  c.save(); c.translate(x, y); c.scale(s, s);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 1.4;

  // Sausage: rounded body with a highlight stripe and a shaded lower edge.
  c.fillStyle = lin(c, 0, -2, 0, 14, [[0, shade(SAUSAGE, 0.35)], [0.45, SAUSAGE], [1, shade(SAUSAGE, -0.3)]]);
  rr(c, -12, -2, 24, 16, 8); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.35)'; rr(c, -8, 0, 8, 2.5, 1.2); c.fill();

  // Bun: warm gradient with a toasted top edge.
  c.fillStyle = lin(c, 0, 6, 0, 16, [[0, shade(bun, 0.25)], [1, shade(bun, -0.2)]]);
  rr(c, -13, 6, 26, 10, 5); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.25)'; rr(c, -9, 7, 12, 2, 1); c.fill();

  // Topping stripe with a glossy highlight.
  c.fillStyle = top; rr(c, -9, 3, 18, 4, 2); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(-7, 3.6, 8, 1);

  // Face: eyes with highlights, smile, cheeks.
  c.fillStyle = INK;
  c.beginPath(); c.arc(-4, 0.5, 1.7, 0, Math.PI * 2); c.arc(4, 0.5, 1.7, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(-3.4, -0.1, 0.55, 0, Math.PI * 2); c.arc(4.6, -0.1, 0.55, 0, Math.PI * 2); c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.2;
  c.beginPath(); c.arc(0, 2, 2.6, 0.2, Math.PI - 0.2); c.stroke();
  c.fillStyle = 'rgba(255,90,110,.45)';
  c.beginPath(); c.arc(-7.5, 3.5, 2.1, 0, Math.PI * 2); c.arc(7.5, 3.5, 2.1, 0, Math.PI * 2); c.fill();

  // Hat, with a light sheen.
  c.lineWidth = 1.4; c.strokeStyle = INK;
  const hc = p.hat === 'bucket' ? '#f2e8cf' : (p.hat === 'chef' ? '#ffffff' : '#2b2d42');
  c.fillStyle = lin(c, 0, -20, 0, 0, [[0, shade(hc, 0.3)], [1, shade(hc, -0.25)]]);
  if (p.hat === 'cap') {
    c.beginPath(); c.arc(0, -4, 10, Math.PI, 0); c.fill(); c.stroke();
    rr(c, -3, -5, 15, 3, 1.5); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(-3, -9, 3, 0, Math.PI * 2); c.fill();
  } else if (p.hat === 'visor') {
    rr(c, -11, -6, 22, 3.5, 1.5); c.fill(); c.stroke();
  } else if (p.hat === 'bucket') {
    c.beginPath(); c.arc(0, -6, 10.5, Math.PI, 0); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(0, -5.5, 13, 3.2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  } else {
    rr(c, -8, -20, 16, 12, 5); c.fill(); c.stroke();
    rr(c, -8, -10, 16, 4, 1); c.fill(); c.stroke();
  }
  c.restore();
}

// Shape helpers in ground coordinates.
function groundPath(c, shape) {
  if (shape.r !== undefined) { c.moveTo(shape.cx + shape.r, shape.cy); c.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2); }
  else if (Array.isArray(shape)) c.rect(shape[0], shape[1], shape[2], shape[3]);
  else c.rect(shape.x, shape.y, shape.w, shape.h);
}
function fillShapes(c, list, color, grow) {
  c.fillStyle = color; c.beginPath();
  for (const s of list) {
    if (s.r !== undefined) { c.moveTo(s.cx + s.r + grow, s.cy); c.arc(s.cx, s.cy, s.r + grow, 0, Math.PI * 2); }
    else {
      const r = Array.isArray(s) ? { x: s[0], y: s[1], w: s[2], h: s[3] } : s;
      c.rect(r.x - grow, r.y - grow, r.w + 2 * grow, r.h + 2 * grow);
    }
  }
  c.fill();
}
function boxOf(s) {
  if (Array.isArray(s)) return { x: s[0], y: s[1], w: s[2], h: s[3] };
  if (s.r !== undefined) return { x: s.cx - s.r, y: s.cy - s.r, w: 2 * s.r, h: 2 * s.r };
  return s;
}
// Soft ground shadow: several faded ellipses, slightly offset.
function softShadow(c, x, y, rx, ry, alpha) {
  for (let k = 3; k >= 1; k--) {
    c.fillStyle = `rgba(20,40,20,${alpha / k})`;
    c.beginPath(); c.ellipse(x + 3, y + 4, rx + k * 3, ry + k * 3, 0, 0, Math.PI * 2); c.fill();
  }
}

// Ground, hazards, walls, trees, cup and flag. Ground coordinates; the caller sets the transform.
function drawCourse(c, course, h) {
  const t = gfxTime();
  // Base: rough with mottled grass patches (visual only).
  c.fillStyle = course.rough; c.fillRect(-900, -900, W + 1800, H + 1800);
  for (let i = -6; i < 40; i++) for (let j = -6; j < 46; j++) {
    const v = hash01(i, j);
    if (v < 0.5) continue;
    c.fillStyle = v > 0.8 ? 'rgba(255,255,255,.06)' : 'rgba(0,40,0,.07)';
    c.fillRect(i * 16 + (hash01(j, i) * 8), j * 16, 9 + v * 6, 6 + v * 4);
  }

  // Fairway: outline, base colour, then mowing stripes clipped to the fairway shape.
  fillShapes(c, h.fair, shade(course.fair, -0.45), 6);
  fillShapes(c, h.fair, course.fair);
  c.save(); c.beginPath(); h.fair.forEach(r => c.rect(r[0], r[1], r[2], r[3])); c.clip();
  for (let x = -20; x < W + 40; x += 30) {
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x, -40, 15, H + 80);
  }
  c.restore();
  // Inner shade along the fairway edge.
  for (const r of h.fair) {
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 3;
    c.strokeRect(r[0] + 3, r[1] + 3, r[2] - 6, r[3] - 6);
  }

  // Green: outline, base, concentric mowing rings, lighter centre.
  c.fillStyle = shade(course.green, -0.5); c.beginPath(); c.arc(h.cup[0], h.cup[1], GREEN_R + 5, 0, Math.PI * 2); c.fill();
  c.fillStyle = course.green; c.beginPath(); c.arc(h.cup[0], h.cup[1], GREEN_R, 0, Math.PI * 2); c.fill();
  for (let k = 1; k <= 3; k++) {
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 4;
    c.beginPath(); c.arc(h.cup[0], h.cup[1], GREEN_R * k / 4 + 4, 0, Math.PI * 2); c.stroke();
  }

  // Tee box: a wooden-edged pad.
  c.fillStyle = '#8b5a2b'; c.fillRect(h.tee[0] - 15, h.tee[1] - 7, 30, 14);
  c.fillStyle = '#c4f49a'; c.fillRect(h.tee[0] - 13, h.tee[1] - 5, 26, 10);

  // Hazards: sand gets rim, grain and a shaded lip; water gets a gradient, shimmer and ripples.
  for (const z of h.haz) {
    const b = boxOf(z);
    fillShapes(c, [z], INK, 4);
    if (z.t === 'water') {
      c.save(); c.beginPath(); groundPath(c, z); c.clip();
      const cxw = b.x + b.w / 2, cyw = b.y + b.h / 2;
      c.fillStyle = lin(c, b.x, b.y, b.x + b.w, b.y + b.h, [[0, '#7fe0ff'], [1, '#1f8fc8']]);
      c.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const phase = t * 1.4 + i * 1.7;
        const px = cxw + Math.sin(phase) * b.w * 0.25, py = b.y + (i + 0.5) * b.h / 4;
        c.beginPath(); c.arc(px, py, 4 + i, 0.25, Math.PI - 0.25); c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,.6)';
      for (let i = 0; i < 5; i++) {
        const sx = b.x + hash01(i, 3) * b.w, sy = b.y + ((hash01(i, 7) + t * 0.05) % 1) * b.h;
        c.fillRect(sx, sy, 2, 2);
      }
      c.restore();
    } else {
      fillShapes(c, [z], HAZ[z.t] || '#999', 0);
      c.save(); c.beginPath(); groundPath(c, z); c.clip();
      c.fillStyle = lin(c, b.x, b.y, b.x, b.y + b.h, [[0, 'rgba(255,255,255,.35)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(120,80,20,.25)']]);
      c.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      c.fillStyle = 'rgba(160,120,60,.45)';
      for (let i = 0; i < 26; i++) c.fillRect(b.x + hash01(i, 11) * b.w, b.y + hash01(i, 13) * b.h, 1.6, 1.6);
      c.restore();
    }
  }

  // Walls: a shaded side face, then a lit top with wood grain. Raised by 14 units.
  for (const r of h.walls) {
    softShadow(c, r[0] + r[2] / 2, r[1] + r[3] / 2, r[2] / 2 + 2, r[3] / 2 + 2, 0.25);
    c.fillStyle = shade(course.walls, -0.45); c.fillRect(r[0] - 1, r[1] - 1 + 14, r[2] + 2, r[3] + 2);
    c.fillStyle = shade(course.walls, -0.25); c.fillRect(r[0], r[1] + r[3] - 14, r[2], 14);
    c.fillStyle = lin(c, r[0], r[1] - 14, r[0], r[1] - 14 + r[3], [[0, shade(course.walls, 0.25)], [1, course.walls]]);
    c.fillRect(r[0], r[1] - 14, r[2], r[3]);
    c.strokeStyle = 'rgba(60,30,10,.35)'; c.lineWidth = 1;
    for (let y = 4; y < r[3]; y += 6) { c.beginPath(); c.moveTo(r[0], r[1] - 14 + y); c.lineTo(r[0] + r[2], r[1] - 14 + y); c.stroke(); }
    c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(r[0], r[1] - 14, r[2], r[3]);
  }

  // Trees: soft shadow, trunk with shading, a layered canopy with a light side.
  for (const tr of h.trees) {
    softShadow(c, tr[0], tr[1], tr[2] + 2, tr[2] + 2, 0.3);
    c.fillStyle = '#6b4226'; c.fillRect(tr[0] - 2.5, tr[1] - 22, 5, 20);
    c.fillStyle = '#9a6a3f'; c.fillRect(tr[0] - 2.5, tr[1] - 22, 2, 20);
    const cy = tr[1] - 26, r = tr[2] + 4;
    c.fillStyle = INK; c.beginPath(); c.arc(tr[0], cy + 3, r + 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a7d33'; c.beginPath(); c.arc(tr[0], cy, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3f9e45'; c.beginPath(); c.arc(tr[0] - r * 0.25, cy - r * 0.2, r * 0.72, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7fd98a'; c.beginPath(); c.arc(tr[0] - r * 0.4, cy - r * 0.45, r * 0.3, 0, Math.PI * 2); c.fill();
  }

  // Cup with a rim, and a waving flag on a pole.
  const cx = h.cup[0], cy = h.cup[1];
  c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(cx, cy, CUP_R + 3, 0, Math.PI * 2); c.fill();
  c.fillStyle = INK; c.beginPath(); c.arc(cx, cy, CUP_R + 1.5, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#0c0c0c'; c.beginPath(); c.arc(cx, cy, CUP_R, 0, Math.PI * 2); c.fill();
  const poleTop = cy - 46;
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(cx + 2, cy - 44, 2.5, 46);   // pole shadow
  c.strokeStyle = '#f2f2f2'; c.lineWidth = 2.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, poleTop); c.stroke();
  const wave = Math.sin(t * 3) * 2.5;
  c.fillStyle = '#ff5964'; c.strokeStyle = INK; c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(cx, poleTop);
  c.quadraticCurveTo(cx + 10, poleTop + 2 + wave, cx + 20, poleTop + 6 + wave);
  c.quadraticCurveTo(cx + 12, poleTop + 9 + wave, cx, poleTop + 13);
  c.closePath(); c.fill(); c.stroke();
}

// Screen position of a ground point and height, for the 3rd-person view.
function project(x, y, z) { return { x: x, y: y * TILT - (z || 0) }; }
