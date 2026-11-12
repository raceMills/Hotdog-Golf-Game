// Hotdog Golf tags. Tag 1 is the best. New players join at the bottom (last tag).
// After a round, the tag numbers held by the players who played are handed out
// by finishing place: the winner takes the best of those numbers, and so on.

function addPlayerTag(players) {
  let max = 0;
  players.forEach(p => { if (p.tag > max) max = p.tag; });
  return max + 1; // joins last
}

// Random starting order for an existing group (e.g. the first time friends meet).
function shuffledTags(players) {
  const nums = players.map((p, i) => i + 1);
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = nums[i]; nums[i] = nums[j]; nums[j] = t;
  }
  return nums;
}

// results: [{id, score}] for everyone who played this round.
// Returns {id: newTag} for those players only.
function reassignTags(players, results) {
  const byId = {};
  players.forEach(p => { byId[p.id] = p; });
  const playing = results.map(r => byId[r.id]).filter(Boolean);
  const pool = playing.map(p => p.tag).sort((a, b) => a - b);
  const order = results.slice().sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return byId[a.id].tag - byId[b.id].tag; // ties keep the better current tag
  });
  const out = {};
  order.forEach((r, i) => { out[r.id] = pool[i]; });
  return out;
}

// Players sorted by tag, best first, for display.
function tagOrder(players) {
  return players.slice().sort((a, b) => a.tag - b.tag);
}
