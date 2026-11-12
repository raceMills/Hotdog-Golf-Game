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
function sceneTransform() {
  const s = view.w / 380;
  const cam = G ? G.cam : { x: W / 2, y: H * TILT / 2 };
  return { s: s, tx: view.w / 2 - cam.x * s, ty: view.h / 2 - cam.y * s };
}
// Screen point -> ground point (world units).
function screenToWorld(e) {
  const r = cv.getBoundingClientRect(), st = sceneTransform();
  const px = (e.clientX - r.left - st.tx) / st.s;
  const py = (e.clientY - r.top - st.ty) / st.s;
  return { x: px, y: py / TILT };
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
  $('clubs').innerHTML = CLUBS.map((c, i) =>
    `<button class="club ${i === G.club ? 'on' : ''}" onclick="selectClub(${i})">${c.name}</button>`).join('');
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
  $('hint').textContent = G.mode === 'replay' ? '' : 'Drag the arc through the ball like a backswing. Drag elsewhere to aim.';
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
  const c = cx, dpr = view.dpr, st = sceneTransform();
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#9be7ff'; c.fillRect(0, 0, view.w, view.h);
  c.setTransform(dpr * st.s, 0, 0, dpr * st.s, dpr * st.tx, dpr * st.ty);
  const h = G.C.holes[G.hole];
  drawCourse(c, G.C, h);

  // Swing arc and aim line, only while the player is set up to swing.
  if (!G.anim && G.mode === 'play' && !G.balls[G.turn].done) {
    const g = arcGeometry();
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3; c.setLineDash([8, 6]);
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const phi = (-140 + i * (200 / 40)) * Math.PI / 180;
      const p = project(arcPoint(g, phi).x, arcPoint(g, phi).y);
      i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
    }
    c.stroke(); c.setLineDash([]);
    const b = G.balls[G.turn];
    const ball = project(b.pos.x, b.pos.y);
    const tip = project(b.pos.x + G.aim.x * 110, b.pos.y + G.aim.y * 110);
    c.strokeStyle = 'rgba(29,43,26,.6)'; c.lineWidth = 3; c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(ball.x, ball.y); c.lineTo(tip.x, tip.y); c.stroke(); c.setLineDash([]);
  }

  // Golfers and balls.
  G.balls.forEach((b, i) => {
    if (b.sunk) return;
    let x = b.pos.x, y = b.pos.y, z = 0;
    if (G.anim && G.anim.ball === i) {
      const k = Math.min(Math.floor(G.anim.i), G.anim.pts.length - 1);
      x = G.anim.pts[k][0]; y = G.anim.pts[k][1]; z = G.anim.pts[k][2] || 0;
    }
    const p = project(x, y, z);
    const gp = project(x, y, 0);
    drawHotdog(c, G.players[i].p, gp.x - 18, gp.y - 10, 0.7);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(gp.x, gp.y + 2, BR, BR * TILT, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 1.5;
    c.beginPath(); c.arc(p.x, p.y, BR, 0, Math.PI * 2); c.fill(); c.stroke();
    if (i === G.turn && G.mode === 'play' && !G.anim && !b.done) {
      c.strokeStyle = '#ffd23f'; c.lineWidth = 2.5; c.setLineDash([3, 3]);
      c.beginPath(); c.arc(p.x, p.y, BR + 5, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
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
  if (G.balls.length && G.cam) {
    const b = G.balls[G.turn] || G.balls[0];
    const t = project(b.pos.x, b.pos.y);
    G.cam.x += (t.x - G.cam.x) * 0.08; G.cam.y += (t.y - G.cam.y) * 0.08;
  }
  draw();
}
window.addEventListener('resize', () => { if ($('game').classList.contains('on')) resizeCanvas(); });
show('menu');
requestAnimationFrame(loop);
