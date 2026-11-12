// Hotdog Golf round engine: swing arc input, club picking, shot animation, hole flow, tags.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const KEY = 'hotdogGolf.v1';
let DB;
try { DB = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { DB = {}; }
DB.players = DB.players || []; DB.rounds = DB.rounds || [];
if (!DB.players.length) DB.players.push({ id: uid(), name: 'Hotdog 1', skin: 0, shirt: 0, hat: 'cap', tag: 1 });
function saveDB() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {} }
function addRound(r) { if (DB.rounds.some(x => x.code === r.code)) return false; DB.rounds.push(r); saveDB(); return true; }

const view = { s: 1, w: 360, h: 600, dpr: 1 };
const cv = $('c'), cx = cv.getContext('2d');
let G = null;

function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); }
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('on'), 2200);
}
function parOf(ci) { return COURSES[ci].holes.reduce((s, h) => s + h.par, 0); }
function toPar(score, par) { const d = score - par; return d === 0 ? 'E' : (d > 0 ? '+' : '') + d; }
function scoreName(s, p) {
  const d = s - p;
  return s === 1 ? 'Hole in one!' : d <= -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : '+' + d;
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copied! Send it to a friend.'); }
  catch (e) { toast('Tap the code, then long-press to copy.'); }
}

// Camera: fit the board to the screen width and ease toward the ball.
function resizeCanvas() {
  const r = cv.getBoundingClientRect();
  view.dpr = Math.min(window.devicePixelRatio || 1, 3);
  view.w = r.width; view.h = r.height;
  cv.width = Math.round(r.width * view.dpr); cv.height = Math.round(r.height * view.dpr);
}
// ---- Camera ----
// Putting (putter selected): the camera sits behind the ball and looks up the aim line, with the hole ahead.
// Full shots: a 3rd-person view that follows the ball from above at an angle.
const TILT_P = 0.45;                 // putting view: how far the green is foreshortened
let curM = null;                     // this frame's world -> screen matrix
function puttView() { return !!(G && G.mode === 'play' && G.club === 0); }
function sceneMatrix() {
  const w = view.w, h = view.h;
  if (puttView()) {
    const b = G.balls[G.turn];
    const cup = G.C.holes[G.hole].cup;
    const L = Math.max(40, Math.sqrt((cup[0] - b.pos.x) ** 2 + (cup[1] - b.pos.y) ** 2));
    const ax = G.aim.x, ay = G.aim.y, rx = -ay, ry = ax;
    const by = h * 0.72;
    const s = Math.min((by - h * 0.17) / (TILT_P * L), w / 160);   // zoomed in, hole kept on screen
    const A00 = s * rx, A01 = s * ry, A10 = -s * TILT_P * ax, A11 = -s * TILT_P * ay;
    const e = w / 2 - (A00 * b.pos.x + A01 * b.pos.y);
    const f = by - (A10 * b.pos.x + A11 * b.pos.y);
    return { a: A00, b: A10, c: A01 / TILT, d: A11 / TILT, e: e, f: f, S: s };
  }
  const s = w / 380;
  const cam = G && G.cam ? G.cam : { x: W / 2, y: H * TILT / 2 };
  return { a: s, b: 0, c: 0, d: s, e: w / 2 - cam.x * s, f: h / 2 - cam.y * s, S: s };
}
// Ground point (world units) and height -> screen pixels, for the current frame.
function toScreen(x, y, z) {
  const M = curM, iy = TILT * y;
  return { x: M.a * x + M.c * iy + M.e, y: M.b * x + M.d * iy + M.f - (z || 0) * M.S };
}
// Screen pixels -> ground point (world units).
function screenToWorld(e) {
  const r = cv.getBoundingClientRect(), M = sceneMatrix();
  const sx = e.clientX - r.left - M.e, sy = e.clientY - r.top - M.f;
  const det = M.a * M.d - M.b * M.c;
  const ix = (sx * M.d - M.c * sy) / det, iy = (M.a * sy - M.b * sx) / det;
  return { x: ix, y: iy / TILT };
}

// ---- Clubs and the swing arc ----
// The arc is the club-head path: it passes the ball, and at the ball it runs along the aim line.
// Centre sits beside the ball on the golfer's side. phi is the angle around that centre.
function arcGeometry() {
  const b = G.balls[G.turn];
  const a = G.aim;
  const R = G.club === 0 ? 40 : 70;             // putter uses a short arc
  const n = { x: -a.y, y: a.x };                 // golfer's side of the ball
  const e1 = { x: -n.x, y: -n.y };               // centre -> ball
  const C = { x: b.pos.x + n.x * R, y: b.pos.y + n.y * R };
  return { C: C, R: R, e1: e1, e2: a };
}
function arcPoint(g, phi) {
  const c = Math.cos(phi), s = Math.sin(phi);
  return { x: g.C.x + g.R * (c * g.e1.x + s * g.e2.x), y: g.C.y + g.R * (c * g.e1.y + s * g.e2.y) };
}
function phiOf(g, p) {
  const dx = p.x - g.C.x, dy = p.y - g.C.y;
  return Math.atan2(dx * g.e2.x + dy * g.e2.y, dx * g.e1.x + dy * g.e1.y);
}
function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }

function suggestClub(dist) {
  for (let c = 0; c < CLUBS.length - 1; c++) if (CLUBS[c].max * 1.0 >= dist) return c;
  return CLUBS.length - 1;
}
function selectClub(i) {
  if (!G) return;
  G.club = i; renderClubs();
}
function renderClubs() {
  if (!G || G.mode !== 'play') { $('clubs').innerHTML = ''; return; }
  let html = CLUBS.map((c, i) =>
    `<button class="club ${i === G.club ? 'on' : ''}" onclick="selectClub(${i})">${c.name}</button>`).join('');
  if (G.club === 0 && !motionOn && typeof DeviceMotionEvent !== 'undefined') {
    html += `<button class="club on" onclick="enableMotion()">📱 Phone putting</button>`;
  }
  $('clubs').innerHTML = html;
}

// ---- Round flow ----
function startRound(ci, profiles, eventId) {
  G = { mode: 'play', C: COURSES[ci], course: ci, eventId: eventId || '', hole: 0,
        players: profiles.map(p => ({ p: p, holes: [] })), balls: [], turn: 0,
        anim: null, busy: false, swing: null, aim: { x: 0, y: -1 }, club: 0, cam: null, script: null };
  show('game'); resizeCanvas(); beginHole();
}
function startReplay(code) {
  const v = verifyCode(code);
  if (v.error) { toast(v.error); return; }
  const prof = DB.players.find(p => p.name === v.name) || { name: v.name, skin: 2, shirt: 2, hat: 'cap' };
  G = { mode: 'replay', C: COURSES[v.course], course: v.course, eventId: '', hole: 0, script: v.holes,
        players: [{ p: prof, holes: [] }], balls: [], turn: 0, anim: null, busy: false, swing: null,
        aim: { x: 0, y: -1 }, club: 0, cam: null };
  show('game'); resizeCanvas(); beginHole();
}
function beginHole() {
  const h = G.C.holes[G.hole];
  G.balls = G.players.map(() => ({ pos: { x: h.tee[0], y: h.tee[1] }, z: 0, done: false, sunk: false, strokes: 0, shots: [] }));
  G.turn = 0; G.busy = false; G.anim = null; G.swing = null;
  G.cam = { x: h.tee[0], y: h.tee[1] * TILT };
  setAimTowardCup();
  $('overlay').classList.remove('on');
  nextTurn();
}
function setAimTowardCup() {
  const b = G.balls[G.turn], h = G.C.holes[G.hole];
  const dx = h.cup[0] - b.pos.x, dy = h.cup[1] - b.pos.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
  G.aim = { x: dx / d, y: dy / d };
  G.club = suggestClub(d);
}
function nextTurn() {
  const n = G.players.length;
  for (let k = 0; k < n; k++) {
    const i = (G.turn + k) % n;
    if (!G.balls[i].done) {
      if (i !== G.turn) G.turn = i;
      setAimTowardCup();
      updateHUD(); renderClubs();
      if (G.mode === 'replay') setTimeout(autoShot, 500);
      return;
    }
  }
  holeFinished();
}
// Fires a resolved shot: the ball flies the arc, then rolls.
function takeShot(shot) {
  mot = null;
  const i = G.turn, b = G.balls[i], h = G.C.holes[G.hole];
  const r = resolveShot(h, b.pos.x, b.pos.y, shot);
  b.shots.push(shot);
  b.strokes += r.pen ? 2 : 1;
  G.busy = true; G.swing = null; updateHUD();
  G.anim = { ball: i, pts: r.path, i: 0, onDone: () => {
    G.busy = false;
    b.pos = { x: r.x, y: r.y }; b.z = 0;
    if (r.sunk) { b.sunk = true; b.done = true; }
    else if (b.strokes >= MAX_STROKES) b.done = true;
    G.turn = (G.turn + 1) % G.players.length;
    nextTurn();
  } };
}
function autoShot() {
  if (!G || G.mode !== 'replay' || G.busy || G.anim) return;
  const b = G.balls[G.turn], flat = G.script[G.hole], k = b.shots.length;
  if (!b.done && k * 7 < flat.length) {
    const s = flat.slice(7 * k, 7 * k + 7);
    takeShot({ club: s[0], power: s[1], path: s[2], timing: s[3], ax: s[4], ay: s[5], seed: s[6] });
  }
}
function holeFinished() {
  const idx = G.hole;
  G.players.forEach((pl, i) => { pl.holes[idx] = { shots: G.balls[i].shots, strokes: G.balls[i].strokes }; });
  G.hole++;
  if (G.hole >= G.C.holes.length) { finishRound(); return; }
  if (G.mode === 'replay') { setTimeout(() => { if (G && G.mode === 'replay') beginHole(); }, 1200); return; }
  showHoleSummary(idx);
}
function showHoleSummary(idx) {
  const h = G.C.holes[idx];
  const rows = G.players.map(pl => {
    const s = pl.holes[idx].strokes;
    return `<tr><td style="text-align:left">${esc(pl.p.name)}</td><td>${s}</td><td>${scoreName(s, h.par)}</td></tr>`;
  }).join('');
  $('overlayBody').innerHTML = `<h2>Hole ${idx + 1} done!</h2><p>Par ${h.par}</p><table>${rows}</table>` +
    `<button class="btn" onclick="nextHole()">Next Hole ▶</button>`;
  $('overlay').classList.add('on');
}
function nextHole() { if (G) beginHole(); }
function updateHUD() {
  if (!G) return;
  const h = G.C.holes[G.hole];
  $('holeLbl').textContent = `Hole ${G.hole + 1}/${G.C.holes.length} · Par ${h.par}`;
  const pl = G.players[G.turn], b = G.balls[G.turn];
  if (G.mode === 'replay') $('turnLbl').textContent = `Replaying ${pl.p.name}`;
  else $('turnLbl').textContent = `${pl.p.name}'s turn · ${b.strokes} stroke${b.strokes === 1 ? '' : 's'}`;
  let hint = 'Drag the arc through the ball like a backswing. Drag elsewhere to aim.';
  if (motionMode()) hint = 'Sway the phone back, then forward through the ball. Drag to aim.';
  $('hint').textContent = G.mode === 'replay' ? '' : hint;
}
function quitGame() {
  const back = G && G.mode === 'replay' ? 'history' : 'menu';
  G = null; $('overlay').classList.remove('on'); show(back);
}

function finishRound() {
  if (G.mode === 'replay') { G = null; show('history'); toast('Replay finished'); return; }
  const par = parOf(G.course);
  const res = G.players.map(pl => {
    const score = pl.holes.reduce((s, x) => s + x.strokes, 0);
    const name = pl.p.name.trim().slice(0, 16) || 'Hotdog';
    const code = encodeRound(name, G.course, G.eventId, score, pl.holes.map(x => x.shots));
    addRound({ code: code, name: name, course: G.course, eventId: G.eventId, score: score, date: Date.now() });
    return { id: pl.p.id, name: name, score: score, code: code };
  }).sort((a, b) => a.score - b.score);
  applyTags(res);
  $('scoreBody').innerHTML = `<h2>${esc(COURSES[G.course].name)} · Par ${par}</h2>` +
    res.map((r, i) => {
      const p = DB.players.find(x => x.id === r.id);
      return `<div class="card"><b>${i + 1}. ${esc(r.name)}</b> <span class="tag">#${p ? p.tag : '-'}</span><br>` +
        `${r.score} strokes (${toPar(r.score, par)})` +
        `<textarea readonly rows="3" onclick="this.select()">${r.code}</textarea>` +
        `<button class="btn small" onclick="copyText('${r.code}')">Copy code</button></div>`;
    }).join('') +
    `<p class="small">Send a code to a friend. They paste it on their Weekly Event screen to add your score.</p>`;
  G = null; show('score');
}
// Tags: the players who played hand out their tag numbers by finishing place.
function applyTags(res) {
  const newTags = reassignTags(DB.players, res.map(r => ({ id: r.id, score: r.score })));
  DB.players.forEach(p => { if (newTags[p.id] !== undefined) p.tag = newTags[p.id]; });
  saveDB();
}

// ---- Swing input ----
// Touch near the arc (in its backswing half) starts a swing. The swing fires when the finger
// passes the ball moving forward. Touches elsewhere set the aim.
const SWING_START_MIN = -150 * Math.PI / 180, SWING_START_MAX = -40 * Math.PI / 180;
cv.addEventListener('pointerdown', e => {
  if (!G || G.mode !== 'play' || G.busy || G.anim || $('overlay').classList.contains('on')) return;
  const w = screenToWorld(e), b = G.balls[G.turn];
  if (!b || b.done) return;
  cv.setPointerCapture(e.pointerId);
  if (motionMode()) { G.swing = { id: e.pointerId, aiming: true }; setAimFrom(w); return; }
  const g = arcGeometry();
  const dC = Math.sqrt((w.x - g.C.x) ** 2 + (w.y - g.C.y) ** 2);
  const phi = phiOf(g, w);
  if (Math.abs(dC - g.R) < 20 && phi >= SWING_START_MIN && phi <= SWING_START_MAX) {
    G.swing = { id: e.pointerId, phiU: phi, lastPhi: phi, lastPhiU: phi, lastR: dC, lastT: performance.now(),
                backDone: false, peakW: 0, tPeak: 0, cross: null, invalid: false, meter: 0 };
    return;
  }
  G.swing = { id: e.pointerId, aiming: true };
  setAimFrom(w);
});
cv.addEventListener('pointermove', e => {
  if (!G || !G.swing || e.pointerId !== G.swing.id) return;
  const w = screenToWorld(e);
  if (G.swing.aiming) { setAimFrom(w); return; }
  stepSwing(w);
});
function endSwing(e) {
  if (!G || !G.swing || e.pointerId !== G.swing.id) return;
  if (G.swing.aiming) { G.swing = null; return; }
  if (!G.swing.cross) { if (G.swing.backDone) toast('Swing through the ball!'); G.swing = null; $('powerFill').style.width = '0'; }
}
cv.addEventListener('pointerup', endSwing);
cv.addEventListener('pointercancel', endSwing);

function setAimFrom(w) {
  const b = G.balls[G.turn];
  const dx = w.x - b.pos.x, dy = w.y - b.pos.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d < 12) return;
  G.aim = { x: dx / d, y: dy / d };
  renderClubs();
}

// Advances the swing with the finger's new position. Fires the shot at the ball.
function stepSwing(w) {
  const sw = G.swing, g = arcGeometry(), now = performance.now();
  const phi = phiOf(g, w), r = Math.sqrt((w.x - g.C.x) ** 2 + (w.y - g.C.y) ** 2);
  const dt = Math.max(1, now - sw.lastT) / 1000;
  const dphi = wrapAngle(phi - sw.lastPhi);
  sw.phiU += dphi;
  const omega = dphi / dt;                           // rad/s, + = forward through the ball
  if (sw.phiU <= -40 * Math.PI / 180) sw.backDone = true;
  if (sw.backDone && !sw.cross) {
    if (omega > sw.peakW) { sw.peakW = omega; sw.tPeak = now; }
    // Crossing: the finger passes the ball's position moving forward.
    if (sw.lastPhiU < 0 && sw.phiU >= 0 && omega > 0) {
      const vT = omega * g.R;                       // ground speed at the ball
      const vR = (r - sw.lastR) / dt;               // radial speed (+ = away from centre)
      const pathDeg = Math.atan2(vR, vT) * 180 / Math.PI;
      const timingDeg = (now - sw.tPeak) / 1000 * omega * 180 / Math.PI;
      sw.cross = { power: clampI(Math.round(vT / 900 * 1000), 0, 1000),
                   path: clampI(Math.round(pathDeg * 10), -2000, 2000),
                   timing: clampI(Math.round(timingDeg * 10), -2000, 2000) };
      fireSwing(sw.cross);
      return;
    }
  }
  sw.lastPhiU = sw.phiU;
  sw.lastPhi = phi; sw.lastR = r; sw.lastT = now;
  sw.meter = Math.min(1, Math.abs(omega) / 12);
  $('powerFill').style.width = (sw.meter * 100) + '%';
}
function clampI(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function fireSwing(c) {
  const seed = Math.floor(Math.random() * 2147483647);
  const shot = { club: G.club, power: c.power, path: c.path, timing: c.timing,
                 ax: Math.round(G.aim.x * 1000), ay: Math.round(G.aim.y * 1000), seed: seed };
  $('powerFill').style.width = '0';
  takeShot(shot);
}

// ---- Drawing and loop ----
function draw() {
  const c = cx, dpr = view.dpr;
  curM = sceneMatrix();
  const M = curM;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#9be7ff'; c.fillRect(0, 0, view.w, view.h);

  // Course: ground coordinates, squashed by TILT, then through the scene matrix.
  c.setTransform(dpr * M.a, dpr * M.b, dpr * M.c, dpr * M.d, dpr * M.e, dpr * M.f);
  c.transform(1, 0, 0, TILT, 0, 0);
  drawCourse(c, G.C, G.C.holes[G.hole]);

  // Overlays and golfers: placed in screen pixels.
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!G.anim && G.mode === 'play' && !G.balls[G.turn].done) {
    const b0 = G.balls[G.turn];
    if (!motionMode()) {
      const g = arcGeometry();
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3; c.setLineDash([8, 6]);
      c.beginPath();
      for (let i = 0; i <= 40; i++) {
        const q = arcPoint(g, (-140 + i * 5) * Math.PI / 180);
        const p = toScreen(q.x, q.y, 0);
        i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
      }
      c.stroke(); c.setLineDash([]);
    }
    const from = toScreen(b0.pos.x, b0.pos.y, 0);
    const tip = toScreen(b0.pos.x + G.aim.x * 110, b0.pos.y + G.aim.y * 110, 0);
    c.strokeStyle = 'rgba(29,43,26,.6)'; c.lineWidth = 3; c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(tip.x, tip.y); c.stroke(); c.setLineDash([]);
    if (puttView()) drawPutter(c);
  }

  // Golfers and balls.
  G.balls.forEach((b, i) => {
    if (b.sunk) return;
    let x = b.pos.x, y = b.pos.y, z = 0;
    if (G.anim && G.anim.ball === i) {
      const k = Math.min(Math.floor(G.anim.i), G.anim.pts.length - 1);
      x = G.anim.pts[k][0]; y = G.anim.pts[k][1]; z = G.anim.pts[k][2] || 0;
    }
    const p = toScreen(x, y, z);
    const gp = toScreen(x, y, 0);
    const sc = curM.S;
    c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(gp.x + 2, gp.y + 2, BR * sc, BR * sc * TILT, 0, 0, Math.PI * 2); c.fill();
    drawHotdog(c, G.players[i].p, gp.x - 18 * sc, gp.y - 10 * sc, 0.7 * sc);
    c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 1.5;
    c.beginPath(); c.arc(p.x, p.y, BR * sc, 0, Math.PI * 2); c.fill(); c.stroke();
    if (i === G.turn && G.mode === 'play' && !G.anim && !b.done) {
      c.strokeStyle = '#ffd23f'; c.lineWidth = 2.5; c.setLineDash([3, 3]);
      c.beginPath(); c.arc(p.x, p.y, (BR + 5) * sc, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
  });
}
function loop() {
  requestAnimationFrame(loop);
  if (!G || !$('game').classList.contains('on')) return;
  if (G.anim) {
    const a = G.anim; a.i += 2;
    if (a.i >= a.pts.length - 1) { G.anim = null; a.onDone(); }
  }
  if (G.balls.length && G.cam && !puttView()) {
    const b = G.balls[G.turn] || G.balls[0];
    const t = { x: b.pos.x, y: b.pos.y * TILT };
    G.cam.x += (t.x - G.cam.x) * 0.08; G.cam.y += (t.y - G.cam.y) * 0.08;
  }
  draw();
}

// ---- Phone putting ----
// With the putter selected, the player sways the phone: back, then forward through the ball.
// The gyroscope gives the rotation speed. The stroke axis is the one that moves most at the start.
// Impact is when the rotation swings back through zero, moving forward. Power is the forward
// speed there, path is the sideways turn at impact, and timing is how far past peak speed it was.
let motionOn = false, mot = null;
const BACK_DEG = 20, START_DEG_S = 40, FULL_BACK_DEG = 30, FULL_SPEED = 400;

function enableMotion() {
  const go = () => {
    motionOn = true;
    window.addEventListener('devicemotion', onMotion);
    mot = null; renderClubs();
    toast('Phone putting on. Sway the phone back, then forward.');
  };
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then(r => r === 'granted' ? go() : toast('Motion access was denied in Settings'))
      .catch(() => toast('Motion is not available here'));
  } else if (typeof DeviceMotionEvent !== 'undefined') {
    go();
  } else {
    toast('This device has no motion sensors');
  }
}
function motionMode() { return motionOn && puttView(); }

function resetMotion() {
  mot = { axis: -1, axis2: -1, theta: 0, yaw: 0, sign: 0, back: 0, peakBack: 0, backDone: false,
          peakW: 0, tPeak: 0, tStart: 0, lastT: 0 };
}
// Phone sway -> putter. The first direction the phone moves is "back" (toward the golfer).
// Phone back moves the putter head back; forward brings it through the ball.
// Power = forward speed x sway length. Path = sideways turn. Timing = impact vs peak speed.
function onMotion(e) {
  if (!motionMode() || !G || G.busy || G.anim) return;
  const r = e.rotationRate; if (!r) return;
  const t = performance.now();
  const rates = [r.alpha || 0, r.beta || 0, r.gamma || 0];
  if (!mot) resetMotion();
  const dt = mot.lastT ? Math.min(0.05, (t - mot.lastT) / 1000) : 0;
  mot.lastT = t;
  if (mot.axis < 0) {
    let best = 0, second = -1;
    for (let i = 1; i < 3; i++) if (Math.abs(rates[i]) > Math.abs(rates[best])) best = i;
    if (Math.abs(rates[best]) < START_DEG_S) return;
    for (let i = 0; i < 3; i++) if (i !== best && (second < 0 || Math.abs(rates[i]) > Math.abs(rates[second]))) second = i;
    mot.axis = best; mot.axis2 = second; mot.tStart = t;
  }
  if (t - mot.tStart > 3000) { resetMotion(); return; }
  const w = rates[mot.axis];
  mot.theta += w * dt;
  mot.yaw += rates[mot.axis2] * dt;
  if (mot.sign === 0) {
    if (Math.abs(mot.theta) < 3) return;
    mot.sign = mot.theta > 0 ? 1 : -1;
  }
  mot.back = mot.theta * mot.sign;
  if (mot.back > mot.peakBack) mot.peakBack = mot.back;
  if (!mot.backDone && mot.back >= BACK_DEG) mot.backDone = true;
  if (!mot.backDone) return;
  if (w * mot.sign < 0 && Math.abs(w) > mot.peakW) { mot.peakW = Math.abs(w); mot.tPeak = t; }
  if (mot.peakW > 0 && mot.back <= 0) {
    const speed = mot.peakW;
    const speedFrac = Math.min(1, speed / FULL_SPEED);
    const lengthFrac = Math.min(1, mot.peakBack / FULL_BACK_DEG);
    const timingDeg = (t - mot.tPeak) / 1000 * speed;
    const shotC = {
      power: clampI(Math.round(speedFrac * lengthFrac * 1000), 0, 1000),
      path: clampI(Math.round(mot.yaw * 10), -2000, 2000),
      timing: clampI(Math.round(timingDeg * 10), -2000, 2000)
    };
    resetMotion();
    fireSwing(shotC);
  }
}

// The putter: a shaft from the golfer's hands to a head at address, pulled back by the sway.
function drawPutter(c) {
  const b = G.balls[G.turn];
  if (!b || b.done) return;
  const back = mot && mot.back > 0 ? mot.back : 0;
  const headOff = 6 + back * 0.8;
  const head = toScreen(b.pos.x - G.aim.x * headOff, b.pos.y - G.aim.y * headOff, 0);
  const hands = toScreen(b.pos.x - G.aim.x * 70, b.pos.y - G.aim.y * 70, 10);
  c.lineCap = 'round';
  c.strokeStyle = INK; c.lineWidth = 7;
  c.beginPath(); c.moveTo(hands.x, hands.y); c.lineTo(head.x, head.y); c.stroke();
  c.strokeStyle = '#eceff1'; c.lineWidth = 3.5;
  c.beginPath(); c.moveTo(hands.x, hands.y); c.lineTo(head.x, head.y); c.stroke();
  c.fillStyle = '#cfd8dc'; c.strokeStyle = INK; c.lineWidth = 2;
  c.beginPath(); c.roundRect(head.x - 11, head.y - 5, 22, 10, 4); c.fill(); c.stroke();
}

window.addEventListener('resize', () => { if ($('game').classList.contains('on')) resizeCanvas(); });
show('menu');
requestAnimationFrame(loop);
