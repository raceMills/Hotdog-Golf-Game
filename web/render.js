// Hotdog Golf drawing: a high 3rd-person view. The ground is squashed (TILT) so it reads
// as a tilted board, and trees and walls are raised so they stand up off it.
const TILT = 0.7;                    // ground foreshortening: 1 = top-down, smaller = more angled
const BUNS = ['#f3c27a', '#e8a85c', '#d98c45', '#c97a3a', '#f7d9a8'];
const TOPPINGS = ['#e53935', '#ffd23f', '#8bc34a', '#ff9f43'];
const TOPPING_NAMES = ['Ketchup', 'Mustard', 'Relish', 'Onion'];
const HATS = ['cap', 'visor', 'bucket', 'chef'];
const HAT_NAMES = { cap: 'Cap', visor: 'Visor', bucket: 'Bucket', chef: 'Chef' };
const HAZ = { sand: '#f7e3a1', water: '#4cc9f0' };

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// Draws a hotdog golfer upright, centred on (x,y) in screen pixels. ~40 tall at s=1.
function drawHotdog(c, p, x, y, s) {
  const bun = BUNS[p.skin], top = TOPPINGS[p.shirt];
  c.save(); c.translate(x, y); c.scale(s, s);
  c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 1.4;
  c.fillStyle = '#d64541'; rr(c, -12, -2, 24, 16, 8); c.fill(); c.stroke();
  c.fillStyle = bun; rr(c, -13, 6, 26, 10, 5); c.fill(); c.stroke();
  c.fillStyle = top; rr(c, -9, 3, 18, 4, 2); c.fill(); c.stroke();
  c.fillStyle = INK;
  c.beginPath(); c.arc(-4, 0.5, 1.6, 0, Math.PI * 2); c.arc(4, 0.5, 1.6, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(0, 2, 2.6, 0.2, Math.PI - 0.2); c.stroke();
  c.fillStyle = 'rgba(255,90,110,.4)';
  c.beginPath(); c.arc(-7.5, 3.5, 2, 0, Math.PI * 2); c.arc(7.5, 3.5, 2, 0, Math.PI * 2); c.fill();
  const hc = p.hat === 'bucket' ? '#f2e8cf' : (p.hat === 'chef' ? '#ffffff' : '#2b2d42');
  c.fillStyle = hc;
  if (p.hat === 'cap') {
    c.beginPath(); c.arc(0, -4, 10, Math.PI, 0); c.fill(); c.stroke();
    rr(c, -3, -5, 15, 3, 1.5); c.fill(); c.stroke();
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

// Project a ground point (x,y) to screen-space ground coordinates.
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

// Draws the ground, hazards and objects. Coordinates are world units; the ground is squashed by TILT.
function drawCourse(c, course, h) {
  c.fillStyle = course.rough; c.fillRect(0, 0, W, H * TILT + 40);
  c.save();
  c.scale(1, TILT);

  fillShapes(c, h.fair, INK, 4); fillShapes(c, h.fair, course.fair);
  c.fillStyle = INK; c.beginPath(); c.arc(h.cup[0], h.cup[1], GREEN_R + 4, 0, Math.PI * 2); c.fill();
  c.fillStyle = course.green; c.beginPath(); c.arc(h.cup[0], h.cup[1], GREEN_R, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c4f49a'; c.strokeStyle = INK; c.lineWidth = 2;
  c.fillRect(h.tee[0] - 14, h.tee[1] - 6, 28, 12); c.strokeRect(h.tee[0] - 14, h.tee[1] - 6, 28, 12);

  for (const z of h.haz) {
    fillShapes(c, [z], INK, 4);
    fillShapes(c, [z], HAZ[z.t] || '#999');
    const b = boxOf(z);
    c.save(); c.beginPath(); groundPath(c, z); c.clip();
    if (z.t === 'water') {
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        c.beginPath(); c.arc(b.x + (i + 0.5) * b.w / 3, b.y + (j + 0.5) * b.h / 3, 3, 0.2, Math.PI - 0.2); c.stroke();
      }
    } else {
      c.fillStyle = '#d9b96a';
      for (let i = 0; i < 16; i++) c.fillRect(b.x + ((i * 37) % 100) / 100 * b.w, b.y + ((i * 53) % 100) / 100 * b.h, 2, 2);
    }
    c.restore();
  }
  c.restore();

  // Walls are raised: a dark base, then the top face lifted up.
  c.save(); c.scale(1, TILT);
  for (const r of h.walls) {
    c.fillStyle = INK; c.fillRect(r[0] - 3, r[1] - 3 + 14, r[2] + 6, r[3] + 6);
  }
  for (const r of h.walls) {
    c.fillStyle = course.walls; c.strokeStyle = INK; c.lineWidth = 2;
    c.fillRect(r[0], r[1] - 14, r[2], r[3]); c.strokeRect(r[0], r[1] - 14, r[2], r[3]);
  }
  c.restore();

  // Trees: a ground shadow, a trunk line, and a canopy lifted up.
  c.save(); c.scale(1, TILT);
  for (const t of h.trees) {
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(t[0] + 4, t[1] + 5, t[2] + 1, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#7a4b2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(t[0], t[1]); c.lineTo(t[0], t[1] - 18); c.stroke();
    c.fillStyle = '#2f8f3a'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.arc(t[0], t[1] - 24, t[2] + 4, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#6fd17a'; c.beginPath(); c.arc(t[0] - t[2] * 0.3, t[1] - 24 - t[2] * 0.3, t[2] * 0.35, 0, Math.PI * 2); c.fill();
  }
  c.restore();

  // Cup and flag, drawn upright.
  const cx = h.cup[0], cy = h.cup[1] * TILT;
  c.fillStyle = INK; c.beginPath(); c.ellipse(cx, cy, CUP_R + 2, (CUP_R + 2) * TILT, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#111'; c.beginPath(); c.ellipse(cx, cy, CUP_R, CUP_R * TILT, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - 44); c.stroke();
  c.fillStyle = '#ff5964'; c.strokeStyle = INK; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(cx, cy - 44); c.lineTo(cx + 18, cy - 38); c.lineTo(cx, cy - 32); c.closePath(); c.fill(); c.stroke();
}

// Screen position of a ground point, for placing golfers and the swing guide.
function project(x, y, z) { return { x: x, y: y * TILT - (z || 0) }; }
