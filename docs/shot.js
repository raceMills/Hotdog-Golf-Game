// Shot model v2: clubs, swing quality, and a seeded tiny jitter for imperfect shots only.
// Inputs are integers so the result is identical on every phone:
//   club: index into CLUBS
//   power: 0..1000 (swing strength)
//   path: deg*10 error of the downswing line vs the aim line (+ = right)
//   timing: deg*10 error of the impact moment (+ = late)
//   ax, ay: aim vector (integers from the aim drag)
//   seed: integer chosen when the swing is made, stored in the share code
// Uses only integer ops (Math.imul), + - * /, and sqrt.

const CLUBS = [
  { name: 'Putter',  max: 120, carry: 0.0,  pt: 20, tt: 20 },
  { name: 'Wedge',   max: 170, carry: 0.9,  pt: 40, tt: 40 },
  { name: 'Iron',    max: 260, carry: 0.88, pt: 35, tt: 35 },
  { name: 'Hybrid',  max: 320, carry: 0.85, pt: 30, tt: 30 },
  { name: 'Driver',  max: 400, carry: 0.8,  pt: 25, tt: 25 },
];

// Small seeded generator. Two draws per shot, always consumed, so the sequence never shifts.
function makeRng(seed) {
  let s = seed | 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return ((s >>> 0) / 4294967296) * 2 - 1; // -1..1
  };
}

// Resolves one swing. Returns the same shape as simulate(), plus landing.
function resolveShot(hole, sx, sy, sw) {
  const club = CLUBS[sw.club];
  const al = Math.sqrt(sw.ax * sw.ax + sw.ay * sw.ay);
  if (al === 0) return { path: [[sx, sy, 0]], x: sx, y: sy, sunk: false, pen: false, landing: null };
  const ux = sw.ax / al, uy = sw.ay / al;     // aim direction
  const px = -uy, py = ux;                     // perpendicular (right of aim)

  const pa = Math.abs(sw.path), ta = Math.abs(sw.timing);
  const sideSign = sw.path < 0 ? -1 : 1;
  // Only errors outside the perfect window count. Inside it, the shot is exact.
  const outPath = Math.max(0, pa - club.pt), outTime = Math.max(0, ta - club.tt);
  const errN = Math.min(1, (outPath + outTime) / 200);   // 0 = perfect, 1 = very bad

  const D = club.max * sw.power / 1000;
  const rng = makeRng(sw.seed);
  const r1 = rng(), r2 = rng();

  const lateral = sideSign * outPath / 450 * D + r1 * errN * 0.12 * D;
  const distDelta = -outTime / 450 * D * 0.5 + r2 * errN * 0.08 * D;
  const Dt = Math.max(0, D + distDelta);

  const carry = Dt * club.carry;
  const roll = Dt - carry;
  const lx = sx + ux * carry + px * lateral;
  const ly = sy + uy * carry + py * lateral;

  // Flight arc for animation (height in z). Putter has no arc.
  const flight = [];
  const steps = carry > 0 ? 24 : 1;
  const peak = carry * 0.22;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const fx = sx + (lx - sx) * t, fy = sy + (ly - sy) * t;
    flight.push([fx, fy, 4 * peak * t * (1 - t)]);
  }

  const zone = zoneAt(hole, lx, ly);
  if (zone === 'out' || zone === 'water') {
    return { path: flight, x: sx, y: sy, sunk: false, pen: true, landing: [lx, ly] };
  }
  // Landing on a wall or tree: the ball drops at the start (stroke still counts).
  for (const r of hole.walls) {
    if (lx >= r[0] && lx <= r[0] + r[2] && ly >= r[1] && ly <= r[1] + r[3]) {
      return { path: flight, x: sx, y: sy, sunk: false, pen: false, landing: [lx, ly] };
    }
  }
  for (const t of hole.trees) {
    const dx = lx - t[0], dy = ly - t[1];
    if (dx * dx + dy * dy < t[2] * t[2]) {
      return { path: flight, x: sx, y: sy, sunk: false, pen: false, landing: [lx, ly] };
    }
  }

  // Roll: start speed chosen so the ball rolls `roll` on this surface's friction.
  const v0 = roll * (1 - FRIC[zone]);
  const vx = ux * v0, vy = uy * v0;
  const r = simulate(hole, lx, ly, vx, vy);
  const rollPath = r.path.map(p => [p[0], p[1], 0]);
  if (r.pen) return { path: flight.concat(rollPath.slice(1)), x: sx, y: sy, sunk: false, pen: true, landing: [lx, ly] };
  return { path: flight.concat(rollPath.slice(1)), x: r.x, y: r.y, sunk: r.sunk, pen: false, landing: [lx, ly] };
}

if (typeof module !== 'undefined') module.exports = { CLUBS, resolveShot, makeRng };
