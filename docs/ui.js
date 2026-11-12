// Hotdog Golf menus: setup, golfers and tags, events, history, code import.
let setupEvent = null, draft = null;

// ---- Setup ----
function goSetup(ev) { setupEvent = ev || null; renderSetup(); show('setup'); }
function renderSetup() {
  $('courseList').innerHTML = setupEvent
    ? `<div class="card"><b>🏆 ${esc(setupEvent.name)}</b><br>Course: ${COURSES[setupEvent.ci].name} (event course)</div>`
    : COURSES.map((c, i) => `<label class="card"><input type="radio" name="course" value="${i}" ${i === 0 ? 'checked' : ''}> <b>${c.name}</b><br><small>${c.blurb} · ${c.holes.length} holes</small></label>`).join('');
  $('playerPick').innerHTML = tagOrder(DB.players).map((p, i) =>
    `<label class="card"><input type="checkbox" value="${p.id}" ${i === 0 ? 'checked' : ''} onchange="limitPick(this)"> <span class="tag">#${p.tag}</span> ${esc(p.name)}</label>`).join('');
}
function limitPick(el) {
  if (document.querySelectorAll('#playerPick input:checked').length > 4) { el.checked = false; toast('Up to 4 hotdogs per round'); }
}
function startFromSetup() {
  const ids = [...document.querySelectorAll('#playerPick input:checked')].map(i => i.value);
  if (!ids.length) { toast('Pick at least one golfer'); return; }
  const r = document.querySelector('input[name=course]:checked');
  const ci = setupEvent ? setupEvent.ci : (r ? +r.value : 0);
  const profiles = ids.map(id => DB.players.find(p => p.id === id)).filter(Boolean).map(p => ({ ...p }));
  startRound(ci, profiles, setupEvent ? setupEvent.id : '');
}

// ---- Golfers and tags ----
function goPlayers() { renderPlayers(); show('players'); }
function renderPlayers() {
  $('plList').innerHTML = tagOrder(DB.players).map(p =>
    `<div class="card" style="display:flex;align-items:center;gap:8px">` +
    `<canvas class="thumb" data-id="${p.id}" width="60" height="60" style="width:60px;height:60px"></canvas>` +
    `<div style="flex:1"><span class="tag">#${p.tag}</span> <b>${esc(p.name)}</b></div>` +
    `<button class="btn small" onclick="editPlayer('${p.id}')">Edit</button>` +
    `<button class="btn small red" onclick="delPlayer('${p.id}')">✕</button></div>`).join('');
  document.querySelectorAll('.thumb').forEach(el => {
    const p = DB.players.find(x => x.id === el.dataset.id);
    if (p) drawHotdog(el.getContext('2d'), p, 30, 30, 1.2);
  });
}
function shuffleTagsNow() {
  const nums = shuffledTags(DB.players);
  DB.players.forEach((p, i) => { p.tag = nums[i]; });
  saveDB(); renderPlayers(); toast('Tags shuffled');
}
function delPlayer(id) {
  if (DB.players.length === 1) { toast('Keep at least one golfer'); return; }
  DB.players = DB.players.filter(p => p.id !== id);
  // Close the gap so tags stay 1..N.
  tagOrder(DB.players).forEach((p, i) => { p.tag = i + 1; });
  saveDB(); renderPlayers();
}

// ---- Golfer editor ----
const HAT_LABELS = HAT_NAMES;
function editPlayer(id) {
  const p = id ? DB.players.find(x => x.id === id) : null;
  draft = p ? { ...p } : { id: uid(), name: '', skin: 1, shirt: 0, hat: 'cap', tag: addPlayerTag(DB.players) };
  $('edTitle').textContent = p ? 'Edit hotdog' : 'Create your hotdog';
  $('ed_name').value = draft.name;
  renderEditor(); show('editor');
}
function renderEditor() {
  const d = draft;
  $('ed_skin').innerHTML = BUNS.map((c, i) => `<button class="sw ${d.skin === i ? 'sel' : ''}" style="background:${c}" onclick="setDraft('skin',${i})"></button>`).join('');
  $('ed_shirt').innerHTML = TOPPINGS.map((c, i) => `<button class="sw ${d.shirt === i ? 'sel' : ''}" style="background:${c}" title="${TOPPING_NAMES[i]}" onclick="setDraft('shirt',${i})"></button>`).join('');
  $('ed_hat').innerHTML = HATS.map(h => `<button class="btn small ${d.hat === h ? '' : 'blue'}" onclick="setDraft('hat','${h}')">${HAT_LABELS[h]}</button>`).join('');
  const c = $('ed_prev').getContext('2d');
  c.clearRect(0, 0, 200, 200);
  drawHotdog(c, d, 100, 100, 3.4);
}
function setDraft(k, v) { draft[k] = v; renderEditor(); }
function savePlayer() {
  draft.name = draft.name.trim().slice(0, 16);
  if (!draft.name) { toast('Give your hotdog a name'); return; }
  const i = DB.players.findIndex(p => p.id === draft.id);
  if (i >= 0) DB.players[i] = draft; else DB.players.push(draft);
  saveDB(); goPlayers(); toast('Saved!');
}

// ---- Events ----
function thisEvent() {
  const d = new Date(), y = d.getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1);
  const day = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - jan1) / 864e5);
  const week = Math.floor(day / 7);
  const start = jan1 + week * 7 * 864e5;
  return { id: y + '-W' + week, ci: week % COURSES.length, start: start, end: start + 7 * 864e5, name: 'Week ' + (week + 1) + ' Challenge' };
}
function boardFor(ev) {
  const best = {};
  DB.rounds.filter(r => r.eventId === ev.id && r.course === ev.ci).forEach(r => {
    if (!best[r.name] || r.score < best[r.name].score) best[r.name] = r;
  });
  return Object.values(best).sort((a, b) => a.score - b.score);
}
function goEvents() { renderEvents(); show('events'); }
function renderEvents() {
  const ev = thisEvent(), c = COURSES[ev.ci];
  $('evTitle').textContent = ev.name;
  $('evInfo').innerHTML = `Course: <b>${c.name}</b><br>Ends ${new Date(ev.end).toLocaleDateString()}<br>` +
    `<small>Lowest total strokes wins. Every round is replayed, so scores can't be faked.</small>`;
  const b = boardFor(ev);
  $('evBoard').innerHTML = b.length
    ? '<table><tr><th>#</th><th>Golfer</th><th>Score</th></tr>' +
      b.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.score} (${toPar(r.score, parOf(ev.ci))})</td></tr>`).join('') + '</table>'
    : '<p>No scores yet. Be the first hotdog on the board!</p>';
}
function playEvent() { goSetup(thisEvent()); }
function importCodes() {
  const tokens = $('importBox').value.match(/HDG1:[A-Za-z0-9_-]+/g) || [];
  if (!tokens.length) { $('importMsg').textContent = 'No codes found. Codes start with HDG1:'; return; }
  $('importMsg').innerHTML = tokens.map(t => {
    const v = verifyCode(t);
    if (v.error) return '✗ ' + esc(v.error);
    const added = addRound({ code: v.code, name: v.name, course: v.course, eventId: v.eventId, score: v.score, date: Date.now() });
    const kind = v.eventId ? '' : ' (practice round)';
    return (added ? '✓ Added ' : '• Already had ') + esc(v.name) + ': ' + v.score + ' strokes, ' + esc(COURSES[v.course].name) + kind;
  }).join('<br>');
  $('importBox').value = ''; renderEvents();
}

// ---- History ----
function goHistory() { renderHistory(); show('history'); }
function renderHistory() {
  if (!DB.rounds.length) { $('histList').innerHTML = '<p>No rounds yet. Tee off!</p>'; return; }
  $('histList').innerHTML = DB.rounds.slice().sort((a, b) => b.date - a.date).map(r =>
    `<div class="card"><b>${esc(r.name)}</b> · ${COURSES[r.course].name}${r.eventId ? ' · 🏆 event' : ''}<br>` +
    `Score ${r.score} (${toPar(r.score, parOf(r.course))}) · ${new Date(r.date).toLocaleDateString()}<br>` +
    `<button class="btn small" onclick="watchRound('${r.code}')">▶ Watch</button>` +
    `<button class="btn small blue" onclick="copyText('${r.code}')">Copy code</button>` +
    `<button class="btn small red" onclick="delRound('${r.code}')">Delete</button></div>`).join('');
}
function watchRound(code) { startReplay(code); }
function delRound(code) {
  DB.rounds = DB.rounds.filter(r => r.code !== code); saveDB(); renderHistory();
}
