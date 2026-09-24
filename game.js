/* ============================================================
   NEON DRIFT — pseudo-3D arcade racer (ported engine).
   Reference: Pocket gameplay capture 2026-09-16 (night neon city).
   Pixel-art renderer: 5x7 pixel font HUD, canvas-drawn, smoothing off.
   Pseudo-3D road core with painter's-algorithm sprite jobs.
   AI-generated WebP scenery and vehicles; Canvas road geometry and HUD.
   ============================================================ */
'use strict';

/* ---------- deterministic RNG (seeded in harness mode) ---------- */
const Q = new URLSearchParams(location.search);
const HARNESS = Q.get('harness') === '1';
let godMode = Q.get('god') === '1'; // harness: obstacles render but can't hurt you
let _seed = (parseInt(Q.get('seed') || '7', 10) >>> 0) || 7;
function rnd() {
  if (!HARNESS) return Math.random();
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ---------- 5x7 pixel font ---------- */
const GLYPHS = {
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['01110','10001','00001','00110','00001','10001','01110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10001','10000','10111','10001','10001','01111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'J': ['00111','00010','00010','00010','00010','10010','01100'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','11011','10001'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  '%': ['11001','11010','00010','00100','01000','01011','10011'],
  '/': ['00001','00001','00010','00100','01000','10000','10000'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};
const HEART_PX = ['0110110','1111111','1111111','0111110','0011100','0001000'];
function pxText(c, str, x, y, px, color, align) {
  str = String(str).toUpperCase();
  const w = str.length * 6 * px - px;
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  c.fillStyle = color;
  for (const ch of str) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++)
      if (g[r][q] === '1') c.fillRect(cx + q * px, y + r * px, px, px);
    cx += 6 * px;
  }
  return w;
}
function pxTextW(str, px) { return String(str).length * 6 * px - px; }
function drawHeart(c, x, y, px, color) {
  c.fillStyle = color;
  for (let r = 0; r < 6; r++) for (let q = 0; q < 7; q++)
    if (HEART_PX[r][q] === '1') c.fillRect(x + q * px, y + r * px, px, px);
}
function strokeHeart(c, x, y, px, color) {
  // outline of the heart glyph: only pixels touching the background
  c.fillStyle = color;
  for (let r = 0; r < 6; r++) for (let q = 0; q < 7; q++) {
    if (HEART_PX[r][q] !== '1') continue;
    const edge = r === 0 || r === 5 || q === 0 || q === 6 ||
      HEART_PX[r - 1][q] !== '1' || HEART_PX[r + 1][q] !== '1' ||
      HEART_PX[r][q - 1] !== '1' || HEART_PX[r][q + 1] !== '1';
    if (edge) c.fillRect(x + q * px, y + r * px, px, px);
  }
}

/* ---------- utils ---------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function hash01(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

/* ---------- canvas ---------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, HORIZON = 0, PROJ_H = 0;
function resize() {
  DPR = Math.min(1.5, window.devicePixelRatio || 1, 1600 / window.innerWidth);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  HORIZON = Math.floor(H * 0.30);
  // World perspective uses a bounded camera film height. A tall portrait
  // viewport must reveal more road, not multiply vertical perspective until
  // the road, props and portal become giant wedges. Landscape is unchanged.
  PROJ_H = Math.min(H, W * 1.15);
}
window.addEventListener('resize', resize);

/* ---------- audio (engine hum + beeps; silent without gesture) ---------- */
const AudioSys = {
  ctx: null, osc: null, gain: null,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.osc = this.ctx.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = 70;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      this.gain = this.ctx.createGain(); this.gain.gain.value = 0.05;
      this.osc.connect(f); f.connect(this.gain); this.gain.connect(this.ctx.destination);
      this.osc.start();
    } catch (e) {}
  },
  engine(ratio, nitro) {
    if (!this.osc) return;
    this.osc.frequency.value = 60 + ratio * 80 + (nitro ? 50 : 0);
  },
  beep(freq, dur) {
    if (!this.ctx) return;
    try {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.12, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch (e) {}
  },
};

/* ---------- track ---------- */
const SEG_LEN = 20, DRAW = 150, CAM_DEPTH = 0.84;
let ROAD_FACTOR = 20; // p3d-020 (BUG-050): tunable via Settings (road width)
const CURVE_FACTOR = 0.55, CAM_H = 1.0, Y_FACTOR = 16;
// Portrait uses a lower physical camera rather than stretching the projection
// film. Every projected system consumes this same height.
function cameraHeight() {
  const portrait = clamp((H / Math.max(1, W) - 1.25) / .95, 0, 1);
  return lerp(CAM_H, .70, portrait);
}
let LAP_LEN = 4550, NSEG = 0, TRACK = null, CROSS_D = 260;
let BRIDGE_A = 0, BRIDGE_B = 0, TOTAL = 0, LAPS = 2;
// per-track mission config: the 'circuit' entry is the p3d-002 neon-Tokyo
// night circuit mission (3 laps, its own layout, hills, sectors).
const TRACK_DEFS = {
  night:   { laps: 2, lapLen: 4550 },
  mixed:   { laps: 2, lapLen: 4550 },
  circuit: { laps: 3, lapLen: 4600 },
};
function buildTrackData(track) {
  const def = TRACK_DEFS[track] || TRACK_DEFS.night;
  LAP_LEN = def.lapLen; LAPS = def.laps;
  NSEG = Math.ceil(LAP_LEN / SEG_LEN);
  TRACK = buildTrack(track);
  BRIDGE_A = Math.round(LAP_LEN * 0.42); BRIDGE_B = Math.round(LAP_LEN * 0.57);
  TOTAL = LAP_LEN * LAPS;
}
// Layout per lap, in METERS: [enter, hold, leave, curve]. Converted to 20m
// segments below; each plan sums to its track's LAP_LEN exactly.
// (2026-09-17 fix: these were treated as segment counts, so the whole lap
// was straight. They are meters now, scaled to fill the lap.)
const PLAN_NIGHT = [
  [40, 200, 40, 0],      // 0-280: start straight (gantry @30m, crossing @260m)
  [60, 180, 60, 0.85],   // 280-580: gentle right sweeper
  [60, 240, 60, -1.05],  // 580-940: left sweeper
  [50, 170, 50, 0.55],   // 940-1210: ease right
  [60, 220, 60, -1.25],  // 1210-1550: hard left (tunnel entrance ~1480)
  [40, 160, 40, -0.9],   // 1550-1790: left continues (tunnel exit ~1720)
  [50, 71, 50, 0],       // 1790-1961: straighten for the bridge
  [0, 632, 0, 0],        // 1961-2593: straight (bridge 1911-2593)
  [60, 180, 60, 1.0],    // 2593-2893: right out of the bridge
  [60, 200, 60, -1.15],  // 2893-3213: S-curves left
  [50, 150, 50, 0.7],    // 3213-3463: right
  [60, 160, 60, -0.8],   // 3463-3743: left
  [40, 120, 40, 0.9],    // 3743-3943: right kink
  [0, 607, 0, 0],        // 3943-4550: final straight
];
// NEON CIRCUIT (p3d-002): 4 named sectors, 230 x 20m segments = 4600m.
// (Distances are segment-boundary approximations; each row's meters are
// converted to 20m segments, so sections land on 20m multiples.)
// S1 SHIBUYA (0-1220): flowing sweepers; S2 AKIHABARA (1220-2280): tight
// hairpin + back straight; S3 RAINBOW (2280-3580): fast right into the
// RAINBOW BRIDGE (p3d-015: straight 540m suspension span over the bay,
// 2760-3300) then S-curves; S4 DOCKLANDS (3520-4600): final hairpin, run to the line.
const PLAN_CIRCUIT = [
  [60, 240, 60, 0],      // 0-360: start straight (gantry @30m, crossing @260m)
  [60, 200, 60, -1.0],   // 360-680: left sweeper
  [50, 180, 50, 0.9],    // 680-980: right sweeper
  [40, 150, 40, -0.5],   // 980-1220: left kink
  [60, 220, 60, -1.35],  // 1220-1560: HARD LEFT hairpin
  [40, 140, 40, 0.75],   // 1560-1780: right flick
  [0, 500, 0, 0],        // 1780-2280: back straight
  [60, 180, 60, 1.2],    // 2280-2580: fast right (bridge approach)
  [40, 100, 40, 0],      // 2580-2760: settle straight for the bridge
  [0, 540, 0, 0],        // 2760-3300: RAINBOW BRIDGE — suspension span over the bay
  [40, 160, 40, -1.0],   // 3300-3580: long left off the bridge
  [40, 140, 40, 0.8],    // 3580-3800: right
  [50, 200, 50, -1.45],  // 3800-4120: FINAL hairpin left
  [0, 530, 0, 0],        // 4120-4650: run to the line (sliced to 4600)
];
const CIRCUIT_SECTORS = [ // [startFrac, name] — shown on the sector banner
  [0.00, 'SHIBUYA'], [0.265, 'AKIHABARA'], [0.496, 'RAINBOW'], [0.765, 'DOCKLANDS'],
];
// p3d-012: which circuit sector a lap-distance sits in (0..3), or -1 off-circuit.
// Used to give each sector its signature visuals (BUG-035 district variability).
function sectorOf(d) {
  if (G.track !== 'circuit') return -1;
  const lf = ((((d % LAP_LEN) + LAP_LEN) % LAP_LEN) / LAP_LEN);
  let si = 0;
  for (let i = 0; i < CIRCUIT_SECTORS.length; i++) if (lf >= CIRCUIT_SECTORS[i][0]) si = i;
  return si;
}
// hills: smooth elevation bumps (peak heights in world units; CAM_H = 1).
const HILLS_NIGHT = [
  [500, 900, 0.9],    // rise through the first S-curves
  [1300, 1750, -0.7], // dip carrying the night tunnel
  [2700, 3100, 1.0],  // climb out of the bridge
  [3400, 3900, -0.8], // valley through the late S-curves
  [4000, 4400, 0.6],  // gentle final rise
];
const HILLS_CIRCUIT = [
  [600, 1050, 0.8],    // rise through the sector-1 sweepers
  [1150, 1600, -0.9],  // dive into the hairpin
  [1750, 2350, 0.7],   // crest onto the back straight
  [2500, 3000, -0.8],  // dip through the fast right
  [3100, 3600, 1.0],   // climb out of the S-curves
  [3800, 4200, -0.6],  // dip at the final hairpin
];
function buildTrack(which) {
  const segs = [];
  const plan = which === 'circuit' ? PLAN_CIRCUIT : PLAN_NIGHT;
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  for (const [enM, hoM, lvM, cu] of plan) {
    const en = Math.max(0, Math.round(enM / SEG_LEN)),
          ho = Math.max(0, Math.round(hoM / SEG_LEN)),
          lv = Math.max(0, Math.round(lvM / SEG_LEN));
    for (let i = 0; i < en; i++) segs.push({ curve: cu * ease(i / en), y: 0 });
    for (let i = 0; i < ho; i++) segs.push({ curve: cu, y: 0 });
    for (let i = 0; i < lv; i++) segs.push({ curve: cu * (1 - ease(i / lv)), y: 0 });
  }
  while (segs.length < NSEG) segs.push({ curve: 0, y: 0 });
  const track = segs.slice(0, NSEG);
  const hills = which === 'circuit' ? HILLS_CIRCUIT : HILLS_NIGHT;
  for (let i = 0; i < track.length; i++) {
    const d = (i + 0.5) * SEG_LEN;
    let y = 0;
    for (const [hs, he, hp] of hills) {
      if (d >= hs && d <= he) y += hp * Math.sin(Math.PI * (d - hs) / (he - hs));
    }
    track[i].y = y;
  }
  return track;
}
buildTrackData('circuit');
/* ---------- circuit tunnel (p3d-016, BUG-040): a drivable tunnel through
 * the ridge on the AKIHABARA back straight, lap-relative [1880,2180].
 * Blend zones (tunnelBlend, ~250m each side): walls grow 1630-1880,
 * full enclosure 1880-2180, fade out 2180-2430 — no hard snap (BUG-011).
 * Portal furniture follows the South Ridge 3D reference: concrete headwall
 * pylons with procedural texture, a bolted-on トンネル TUNNEL board,
 * recessed emissive edge strips, retaining walls 40m out from each portal,
 * amber approach lamps, chevron markers at -220/-110m. Interior (shared
 * with the night/mixed tunnels): tall solid walls (2.6, opaque), ceiling
 * slab, emissive light strips on the SIDE walls, string lights, ceiling
 * ribs — always lit, never black (BUG-021). p3d-026 rebuilt it: the old
 * 1.15-high walls read as see-through and the ceiling center slab read as
 * a giant flashing blue strip (Craig 2026-09-20). */
const CIRCUIT_TUNNEL_A = 1880, CIRCUIT_TUNNEL_B = 2180;
function inTunnel(d) {
  // p3d-002 set-piece discipline: the NEON CIRCUIT keeps the red torii
  // start/finish gantry as its signature set-piece (p3d-015 added the
  // Rainbow Bridge, p3d-016 this tunnel — both skip the gantry zone).
  if (G.track === 'circuit') {
    const m = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN);
    return m >= CIRCUIT_TUNNEL_A && m < CIRCUIT_TUNNEL_B;
  }
  // v70 capture: the "fireworks" sections are NIGHT TUNNELS with hanging string
  // lights and big firework arcs — tunnel 1 at DIST 0.8-4.2% (t=4-9s),
  // tunnel 2 at DIST 36.3-39.3% (t=57-61s). Lap 2 is unobserved (video ends 45%).
  // v89 capture: NEON NIGHT has a curved canopy tunnel around DIST 33-38% of
  // each lap. It is lap-relative (present on both laps).
  if (G.track === 'mixed') {
    const f = d / TOTAL;
    return (f >= 0.008 && f < 0.055) || (f >= 0.363 && f < 0.393);
  }
  const lr = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN) / LAP_LEN;
  return lr >= 0.325 && lr < 0.378;
}
/* ---------- bridge bounds (p3d-015): per-track suspension-bridge zone.
 * night/mixed keep their legacy spans; the circuit mission (NEON NIGHT)
 * crosses the RAINBOW-sector bay on a suspension bridge at lap 2760-3300m
 * (Rainbow Bridge identity: towers, main cables, suspenders, lit deck).
 * All bridge code (towers, water, railings, building skip) keys off these. */
const CIRCUIT_BRIDGE_A = 2760, CIRCUIT_BRIDGE_B = 3300;
function bridgeBounds() {
  if (G.track === 'circuit') return [CIRCUIT_BRIDGE_A, CIRCUIT_BRIDGE_B];
  if (G.track === 'mixed') return [TOTAL * 0.228, TOTAL * 0.278];
  return [BRIDGE_A, BRIDGE_B];
}
function inBridge(d) {
  const [A, B] = bridgeBounds();
  if (G.track === 'mixed') {
    // v70 capture: snow bridge over blue water in daylight, DIST 22.8-27.8% (t=36-43s)
    return d >= A && d < B;
  }
  const m = ((d % LAP_LEN) + LAP_LEN) % LAP_LEN; return m >= A && m <= B;
}
function inWater(d) {
  // mixed: water under the snow bridge
  if (G.track !== 'mixed') return false;
  return inBridge(d);
}
/* ---------- harbor district water (p3d-014, BUG-036/037): the DOCKLANDS
 * sector of the circuit gets a real bay on the right side of the road —
 * animated water + night shoreline reflections. Water exists ONLY in this
 * bay (BUG-045 land-vs-water discipline); the quay strip between the road
 * and the water stays land. ---------- */
const HARBOR_A = 0.775, HARBOR_B = 0.99; // lap fractions (inside DOCKLANDS 0.765-1.0)
const HARBOR_QUAY = 3.4;   // lateral (road units): quay land ends, bay water begins
const HARBOR_SIDE = 1;     // bay is on the right side of the road
function inHarbor(d) {
  if (G.track !== 'circuit') return false;
  const lr = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN) / LAP_LEN;
  return lr >= HARBOR_A && lr < HARBOR_B;
}
function harborBlend(d) {
  // 0 outside, ramps to 1 across ~200m at each edge — the bay fades in/out
  // of the DOCKLANDS sector instead of hard-cutting (same pattern as seaBlend)
  if (G.track !== 'circuit') return 0;
  const lr = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN) / LAP_LEN;
  const R = 200 / LAP_LEN;
  if (lr >= HARBOR_A && lr < HARBOR_B) return 1;
  if (lr < HARBOR_A && lr > HARBOR_A - R) return 1 - (HARBOR_A - lr) / R;
  if (lr >= HARBOR_B && lr < HARBOR_B + R) return 1 - (lr - HARBOR_B) / R;
  return 0;
}
function inPark(d) {
  // snow-city park strip: same lap-relative band every lap (buildings suppressed,
  // trees + paths instead) — breaks up the building runs without touching tunnels
  const lr = ((d % LAP_LEN) + LAP_LEN) % LAP_LEN / LAP_LEN;
  return lr >= 0.62 && lr < 0.70;
}

/* ---------- the-climb district (p3d-022, BUG-052): uphill night street with
 * houses. Lap-relative band [1340,1620] on the circuit (AKIHABARA sector):
 * the exit of the hairpin climbs the dive-hill's rising half (+0.9 over
 * ~225m) into the right flick — a winding uphill street, clear of the
 * tunnel blend (walls grow from 1630) and of every other set-piece.
 * Matches the 3D the-climb references: terraced hillside massing, Japanese
 * houses with amber windows, sento with noren + lanterns, pine trees,
 * stone walls, power poles with sagging wires. No water in this district
 * (BUG-045). ---------- */
const CLIMB_A = 1340, CLIMB_B = 1620;
function inClimb(d) {
  if (G.track !== 'circuit') return false;
  const lr = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN);
  return lr >= CLIMB_A && lr < CLIMB_B;
}
function climbBlend(d) {
  // 0 outside, ramps to 1 across ~90m at each edge — the additive dressing
  // (hill masses, terraced back row, pines, poles) fades in/out instead of
  // hard-cutting at the district boundary.
  if (G.track !== 'circuit') return 0;
  const lr = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN);
  const R = 90;
  if (lr >= CLIMB_A && lr < CLIMB_B) return 1;
  if (lr < CLIMB_A && lr > CLIMB_A - R) return 1 - (CLIMB_A - lr) / R;
  if (lr >= CLIMB_B && lr < CLIMB_B + R) return 1 - (lr - CLIMB_B) / R;
  return 0;
}
/* ---------- waterfront-east district (p3d-023, BUG-052): night waterfront
 * expressway with signage closeups and the bridge backdrop. Lap-relative
 * band [2440,2700] on the circuit (RAINBOW sector, fast-right bridge
 * approach): starts 10m clear of the tunnel fade-out (ends 2430) and ends
 * 60m clear of the p3d-015 suspension-bridge band (2760) — no collision
 * with the tunnel blend (1880-2180), the climb (1340-1620), harbor
 * (3526-4505), or the park strip. Matches the 3D waterfront-east reference
 * signatures: blue Japanese directional gantry boards (東京方面 ↑ / お台場
 * 300m 出口), a 首都高速 C1 shield, lit waterfront towers on the right,
 * quay promenade with string lights + lamp posts + torii on the left, water
 * on the left continuous with the bridge bay, a distant second-bridge
 * silhouette over the bay (backdrop only — never the p3d-015 structure),
 * and a far neon ferris-wheel ring. BUG-045: water only on the left; the
 * right side is explicit land so towers stand on land, never on the
 * seaBlend ramp. Every sign is structure-mounted (BUG-043/047); the single
 * global near-cull governs (no per-item cull distances); buildings sit ON
 * the pavement (BUG-055). All art is code-generated on canvas (labeled
 * in-game per standing rules). ---------- */
const WATERFRONT_A = 2440, WATERFRONT_B = 2700;
const WF_SIDE = -1;  // water/promenade side (left)
const WF_QUAY = 3.4; // lateral (road units): quay land ends, bay water begins
const WF_GANTRY_D = 2560; // lap-relative: directional gantry position
const WF_SHIELD_D = 2500; // lap-relative: C1 shield pole position
const WF_LAMP_STEP = 90;  // quay lamp posts every 90m
function inWaterfront(d) {
  if (G.track !== 'circuit') return false;
  const lr = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN);
  return lr >= WATERFRONT_A && lr < WATERFRONT_B;
}
function waterfrontBlend(d) {
  // 0 outside, ramps to 1 across ~60m at each edge (climb pattern, tighter:
  // the band is a 260m approach slice).
  if (G.track !== 'circuit') return 0;
  const lr = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN);
  const R = 60;
  if (lr >= WATERFRONT_A && lr < WATERFRONT_B) return 1;
  if (lr < WATERFRONT_A && lr > WATERFRONT_A - R) return 1 - (WATERFRONT_A - lr) / R;
  if (lr >= WATERFRONT_B && lr < WATERFRONT_B + R) return 1 - (lr - WATERFRONT_B) / R;
  return 0;
}
/* ---------- start-plaza district (p3d-024, BUG-052): the circuit's start/finish plaza.
 * Lap-relative band [0,360] on the circuit's start straight (S1 SHIBUYA's
 * opening straight; the torii gantry already marks the line @30m). Matches
 * the 3D startplaza references: a big red neon start/finish arch spanning
 * the road (with a 歓海夜町一番街 plaque), 8-20m mid-rise commercial blocks,
 * mounted kanban signboards (お好み焼き HONJIN, 居酒屋, 宴会場), warm-white
 * shopfronts. Band checked against every other exclusive band: climb
 * 1340-1620, tunnel 1880-2180, waterfront-east 2440-2700, bridge 2760-3300,
 * harbor frac 0.775-0.99 (=3526-4504m) — no overlap on any side. Integrates
 * with the p3d-020 torii gate instead of duplicating it: the neon arch sits
 * 50m PAST the torii (@30m): one coherent plaza sequence (line -> torii ->
 * arch), never a duplicate gate. Every sign is facade/structure-mounted
 * (BUG-043/047); the single global near-cull governs (no per-item cull
 * distances); blocks sit ON the pavement (BUG-055). All art is
 * code-generated on canvas (labeled in-game per standing rules). ---------- */
const SP_A = 0, SP_B = 360;
const SP_ARCH_D = 80; // lap-relative: neon arch gate position
function inStartPlaza(d) {
  if (G.track !== 'circuit') return false;
  const lr = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN);
  return lr >= SP_A && lr < SP_B;
}
function plazaBlend(d) {
  // 0 outside, ramps to 1 across ~60m at each edge (the waterfront pattern).
  // Note: SP_A=0, so the entry ramp is unreachable by design (lr>=0 always);
  // the lap line itself is the boundary, matching the in-band check below.
  if (G.track !== 'circuit') return 0;
  const lr = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN);
  const R = 60;
  if (lr >= SP_A && lr < SP_B) return 1;
  if (lr >= SP_B && lr < SP_B + R) return 1 - (lr - SP_B) / R;
  return 0;
}
/* ---------- game state ---------- */
// track: 'night' (v89 neon night), 'mixed' (v70 snow + firework tunnels),
// or 'circuit' (p3d-002 neon-Tokyo night circuit mission: 3 laps)
function setTrack(t) {
  G.track = t;
  buildTrackData(t);

  G.flakes = null; G.fworks = null; G.fworkT = 0; G.arcs = null;
}
function getEnv(dist) {
  if (G.track !== 'mixed') return 'night'; // 'night' track and the 'circuit' mission are both night-city
  // mixed (SNOW & SUN): snowy daylight everywhere except the two night tunnels.
  // Zones read from the v70 capture's DIST HUD. Video ends at DIST 45%;
  // lap-2 pattern unverified, snow assumed.
  // NOTE: this never returns 'tunnel' — the tunnel is a smooth overlay
  // (tunnelBlend()) over the true outside environment, so buildings/trees
  // dissolve individually at the portals instead of popping (Craig 2026-09-17).
  return 'snow';
}
const TOP_KMH = 238, NITRO_KMH = 315;
let TOP_MS = 66, NITRO_MS = 87.5;   // base / nitro top speed (m/s); Craig: "a bit too slow" (was 61/80.5)
// p3d-020 (BUG-050): live tuning — every value below is exposed in the pause
// menu's Settings screen. Handling applies immediately; race shape applies on
// restart. Car size flows through
// playerWpx(), which both the renderer and the collision code call, so the
// model and the hitbox stay in sync by construction.
const TUNE = {
  topSpeed: 66,      // vehicle speed (m/s)
  acceleration: 26,  // acceleration (m/s squared)
  turnPower: 1.6,    // turn power (steering coefficient)
  nitroSpeed: 87.5,  // nitro speed (m/s)
  nitroCap: 100,     // nitro meter capacity
  nitroFill: 25,     // nitro fill per pickup
  startHearts: 5,    // starting car health (hearts)
  roadWidth: 20,     // road width (ROAD_FACTOR)
  carSize: 1.0,      // car size multiplier (render + collision)
  traffic: 1.0,      // traffic density multiplier
  trafficSpeed: 30,  // civilian vehicle speed (m/s)
  rivalPace: 1.0,    // progress multiplier for rival pass points
  rivalCount: 4,     // opponents in the race (applies next race)
  propDensity: 1.0,  // roadside sprite density
  lapCount: 0,       // 0 uses the selected track's authored lap count
};
function applyTune() {
  TOP_MS = TUNE.topSpeed;
  NITRO_MS = TUNE.nitroSpeed;
  ROAD_FACTOR = TUNE.roadWidth;
}
/* --- collision geometry: derived from the same numbers as the rendering, so
   hits and curb kisses happen exactly where the sprites touch, with no padded
   "collide with air" zone (Craig 2026-09-17) --- */
function playerWpx() {
  // drawn player car width, px: ~26% of the road width at the car's depth —
  // the same world size as the rival/traffic cars (0.50 road half-widths;
  // p3d-019 BUG-042: 0.84 made the player ~68% wider than a rival at equal
  // distance). Capped so the car always fits between the horizon and the
  // screen bottom (Craig 2026-09-20: the 132px cap made the car tiny — 8% of
  // road width on desktop).
  const rh = roadHalfPxAtCar();
  if (!(rh > 0)) return Math.min(W * 0.30, 132) * TUNE.carSize; // pre-first-frame fallback
  // Keep the body narrower than one lane on narrow/portrait viewports too.
  // This cap belongs to the projection contract, rather than a device query,
  // so visual and collision geometry continue to share exactly one width.
  return Math.min(0.50 * rh, 0.32 * W, 0.58 * PROJ_H) * TUNE.carSize;
}
function roadHalfPxAtCar() {
  // road half-width in px at the player car's screen height, following the
  // projection — the same math drawRoad uses, so the edge matches the picture
  const carY = H * 0.815;
  if (carY >= projY[1]) {
    // below the n=1 slice: the linear extrapolation the near fill uses
    const yT = projY[1], wT = projW[1], yB = H + 4;
    const ratio = clamp((yB - HORIZON) / Math.max(1, yT - HORIZON), 1.0, 1.5);
    const t = clamp((carY - yT) / Math.max(1, yB - yT), 0, 1);
    return wT + (wT * ratio - wT) * t;
  }
  for (let n = 2; n <= DRAW; n++) {
    if (projY[n] <= carY) {
      const y0 = projY[n - 1], y1 = projY[n];
      return lerp(projW[n - 1], projW[n], clamp((y0 - carY) / Math.max(1, y0 - y1), 0, 1));
    }
  }
  return projW[DRAW];
}
function playerHalfRoad() {
  // player body half-width in road units: the wheels (+-0.54*wpx) are the
  // widest point at road level — the silhouette the player actually sees
  return playerWpx() * 0.54 / roadHalfPxAtCar();
}
function playerLeanRoad() { return 0; } // yaw pivots around the nose; it does not translate the hitbox
function edgeLimit() {
  // |playerX| where the visible car body touches the visible road edge:
  // playerX=1 centers the car on the edge line; subtract the body's half
  // width (plus any outward steering lean) in road units
  const sw = roadHalfPxAtCar();
  return Math.max(0.5, 1 - playerWpx() * 0.54 / sw);
}
function obstacleHalfRoad(o) {
  // drawn half-widths in road units (p3d-067: barrier board 0.46, traffic
  // body 0.50, 3-cone spread) — hitboxes stay slightly inside the sprites
  // so hits are forgiving, never wider than what the player sees.
  if (o.type === 'barrier') return 0.28;
  if (o.type === 'cones') return 0.13 * H / W;
  return 0.144;
}
const G = {
  state: 'title', playerDist: 0, playerX: 0, speedMs: 0,
  track: 'circuit', // 'night', 'mixed', or 'circuit' (p3d-002 neon-Tokyo mission)
  nitro: 0, nitroOn: false, nitroT: 0, nitroTaken: null, nitroDenyT: 0,
  hearts: TUNE.startHearts, raceTime: 0, time: 0, cdT: 0, cdStep: -1,
  invulnT: 0, hitFlash: 0, // collision: post-hit invulnerability + red flash
  rivalBumpT: 0, // cooldown so one rival can't chain-rattle the player
  scrapeT: 0, // edge-grind timer: sparks + speed loss while kissing the road edge
  inputSteer: 0, steerVis: 0, steerHold: 0, yawVis: 0, impactYaw: 0, recoverT: 0, skyX: 0,
  rivals: [], shakeT: 0, sparks: [], sparkSeq: 0, skids: [], impact: null,
  // p3d-002 mission state: lap timing + drift model + collision telemetry
  lapTimes: [], lapStartT: 0, lastLap: 0, bestLap: 0, sector: -1,
  collisions: 0, scrapeAccum: 0,
  drift: 0, driftKey: false, driftEvents: 0, driftT: 0, driftBoostT: 0, smokeT: 0,
};
const PASS_FRAC = [0.28, 0.45, 0.70, 0.88]; // fraction of TOTAL where rival i is passed
const RCOL = ['#5a6cff', '#b46aff', '#ff6ad5', '#ffd23f'];
function resetRace() {
  // Race-shape options apply at restart so changing them cannot move the
  // finish line or remove opponents in the middle of a race.
  buildTrackData(G.track);
  if (TUNE.lapCount > 0) { LAPS = TUNE.lapCount; TOTAL = LAP_LEN * LAPS; }
  G.playerDist = 0; G.playerX = 0; G.speedMs = 0;
  G.nitro = 0; G.nitroOn = false; G.nitroT = 0; G.nitroTaken = new Set();
  G.nitroDenyT = 0;
  G.hearts = TUNE.startHearts; G.raceTime = 0; G.cdT = 0; G.cdStep = -1;
  G.rivalBumpT = 0;
  G.invulnT = 0; G.hitFlash = 0; G.scrapeT = 0;
  G.inputSteer = 0; G.steerVis = 0; G.steerHold = 0; G.yawVis = 0; G.impactYaw = 0; G.recoverT = 0;
  G.shakeT = 0; G.sparks = []; G.skids = []; G.impact = null; G.sparkSeq = 0;
  G.lapTimes = []; G.lapStartT = 0; G.lastLap = 0; G.bestLap = 0; G.sector = -1;
  G.collisions = 0; G.scrapeAccum = 0;
  G.drift = 0; G.driftKey = false; G.driftEvents = 0; G.driftT = 0; G.driftBoostT = 0; G.smokeT = 0;
  G.rivals = [];
  for (let i = 0; i < TUNE.rivalCount; i++) G.rivals.push({ x: (rnd() * 1.2 - 0.6), color: RCOL[i % RCOL.length], wob: rnd() * 6.28, passT: null, passD: null, passSpeed: null });
}

/* ---------- projection ---------- */
const projX = new Float32Array(DRAW + 2), projY = new Float32Array(DRAW + 2), projW = new Float32Array(DRAW + 2);
const runMin = new Float32Array(DRAW + 2);
const curveX = new Float32Array(DRAW + 2);
let baseSeg = 0, basePct = 0, playerY = 0, scaleAt1 = 1;
function projectFrame() {
  const inLap = ((G.playerDist % LAP_LEN) + LAP_LEN) % LAP_LEN;
  baseSeg = Math.floor(inLap / SEG_LEN) % NSEG;
  basePct = (inLap % SEG_LEN) / SEG_LEN;
  playerY = lerp(TRACK[baseSeg].y, TRACK[(baseSeg + 1) % NSEG].y, basePct);
  let x = 0, dx = -TRACK[baseSeg].curve * basePct;
  runMin[0] = H;
  curveX[0] = 0;
  for (let n = 1; n <= DRAW; n++) {
    curveX[n] = x;
    const z = Math.max(1, (n - basePct) * SEG_LEN);
    const scale = CAM_DEPTH / z;
    const w = scale * W * ROAD_FACTOR;
    projX[n] = W / 2 + scale * x * W * CURVE_FACTOR - G.playerX * w;
    projW[n] = w;
    projY[n] = HORIZON + scale * (playerY + cameraHeight() - TRACK[(baseSeg + n) % NSEG].y) * PROJ_H * Y_FACTOR;
    runMin[n] = Math.min(runMin[n - 1], projY[n]);
    if (n === 1) scaleAt1 = scale;
    x += dx; dx += TRACK[(baseSeg + n) % NSEG].curve * 0.9;
  }
  const near = projectSprite(1, 0, 0);
  projX[0] = near.x; projY[0] = near.y; projW[0] = near.w;
}
function projFor(rel) { return clamp(Math.round(rel / SEG_LEN + basePct), 1, DRAW); }
function centerAt(rel) {
  const p = projectSprite(rel, 0, 0);
  return { x: p.x, y: p.y };
}
function projectSprite(rel, lateral, yWorld) {
  // Interpolate WORLD coordinates, then project once. Interpolating screen
  // positions but using true-depth scale detached sprites from the road.
  const z = Math.max(1, rel);
  const nf = clamp(z / SEG_LEN + basePct, 0, DRAW - 1);
  const n = Math.floor(nf), t = nf - n;
  const x = lerp(curveX[n], curveX[n + 1], t);
  const elevation = lerp(TRACK[(baseSeg + n) % NSEG].y, TRACK[(baseSeg + n + 1) % NSEG].y, t);
  const scale = CAM_DEPTH / z, w = scale * W * ROAD_FACTOR;
  return { x: W / 2 + scale * x * W * CURVE_FACTOR + (lateral - G.playerX) * w,
    y: HORIZON + scale * (playerY + cameraHeight() - elevation + yWorld) * PROJ_H * Y_FACTOR, w, scale };
}

// Sampled coverage gives every biome/layer the same continuous lifecycle.
// It avoids per-feature hard switches and remains stable if authored zone
// boundaries move or new zones are added later.
function zoneCoverage(predicate,d,radius=180,samples=12){
  let sum=0,weights=0;
  for(let i=-samples;i<=samples;i++){
    const u=i/samples,w=1-Math.abs(u);weights+=w;
    if(predicate(d+u*radius))sum+=w;
  }
  return clamp(sum/weights,0,1);
}
const sceneWeightCache=new Map();
function sceneWeights(d){
  // Several render passes query the same segment. Half-segment quantization
  // and a bounded cache keep the systemic blend at a fixed rendering cost.
  // Align to the authored segment lattice. Half-segment bins alternated
  // parity as the camera advanced, defeating reuse for an entire draw pass.
  const q=Math.round(d/SEG_LEN)*SEG_LEN;
  const key=`${G.track}|${LAPS}|${LAP_LEN}|${q}`;
  const cached=sceneWeightCache.get(key);if(cached)return cached;
  const water=zoneCoverage(x=>inBridge(x)||inHarbor(x)||inWaterfront(x),q,180,12);
  const green=zoneCoverage(x=>inClimb(x)||inPark(x),q,180,12);
  let tunnel=zoneCoverage(inTunnel,q,120,12);
  for(const [a,b] of tunnelZones()){
    if(q<a&&q>a-520)tunnel=Math.max(tunnel,clamp((q-(a-520))/420,0,1));
    if(q>=a&&q<=b)tunnel=1;
    if(q>b&&q<b+380)tunnel=Math.max(tunnel,1-clamp((q-b)/380,0,1));
  }
  const result={water,green,tunnel,city:clamp(1-Math.max(water,green,tunnel),0,1)};
  if(sceneWeightCache.size>2048)sceneWeightCache.clear();sceneWeightCache.set(key,result);
  return result;
}
function tunnelContext(d){
  let approach=0,exit=0;
  for(const [a,b] of tunnelZones()){
    if(d<a&&d>a-650)approach=Math.max(approach,clamp((d-(a-650))/500,0,1));
    if(d>b&&d<b+300)exit=Math.max(exit,1-clamp((d-b)/300,0,1));
  }
  return {approach,exit};
}
function farFade(rel) {
  // p3d-033 (ART-003): physical objects are 100% opaque — the old 1500-2600m
  // alpha haze fade is a hard cull at 2050m (objects are ~5px there; the pop
  // is invisible). Returns 1 or 0 only.
  return rel < 2050 ? 1 : 0;
}
function bridgeFade(rel) {
  // p3d-033 (ART-003): the bridge is 100% opaque — the old 1500-2950m
  // materialize-from-haze alpha fade is a hard cull at 2200m (towers are
  // ~8px there; the pop is invisible). Returns 1 or 0 only.
  return rel < 2200 ? 1 : 0;
}
/* ---------- p3d-025 (BUG-054): the ONE global near-cull policy ----------
 * Every rendered world object — scenery AND gameplay sprites — passes
 * through nearCulled(rel): nothing renders at rel < NEAR_CULL_REL (12m
 * behind the camera). Nothing pops while approached; nothing vanishes
 * while being passed. No per-item near-cull distance may ever be
 * introduced again — this is the single rendering policy, consulted at
 * every draw site including the gameplay loops below.
 *
 * Gameplay sprites additionally have a WORLD LIFETIME that ends at the
 * contact plane: a nitro bottle is taken, an obstacle is hit or passed, a
 * rival is overtaken, the gantry is passed under. Past that plane the
 * object no longer exists in the world, so there is nothing to render —
 * that is simulation lifetime, not a cull distance. (Persisting gameplay
 * sprites to -12 would pin passed traffic behind the camera through
 * projectSprite's near-plane pin — the old BUG-048-era glitch — so the
 * contact plane, not the render cull, ends their world lifetime.) */
const NEAR_CULL_REL = -12;
function nearCulled(rel) { return rel < NEAR_CULL_REL; }
/* Gameplay world-lifetimes (NOT cull distances) — see policy above. */
const NITRO_TAKE_REL = 8;   // bottle taken/collected at the camera plane
const OBSTACLE_HIT_REL = 3; // obstacle hit or passed at the camera plane
const RIVAL_PASS_REL = 3;   // rival overtaken at the camera plane
const GANTRY_PASS_REL = 2;  // gantry passed under at the camera plane
function shadeHex(hex, f) {
  // darken a #rrggbb color by factor f (for pseudo-3D side faces)
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
/* ---------- tunnel blend: portals fade in/out over ~250m, never pop ---------- */
let tunZonesCache = null, tunZonesKey = '';
function tunnelZones() {
  // absolute-distance [entrance, exit] pairs for every tunnel on the track
  const key = G.track + ':' + LAPS + ':' + TOTAL + ':' + LAP_LEN;
  if (tunZonesKey !== key) {
    tunZonesKey = key;
    if (G.track === 'mixed') {
      tunZonesCache = [[TOTAL * 0.008, TOTAL * 0.055], [TOTAL * 0.363, TOTAL * 0.393]];
    } else if (G.track === 'circuit') {
      // p3d-016: the circuit tunnel, lap-relative (present on all 3 laps)
      tunZonesCache = [];
      for (let lap = 0; lap < LAPS; lap++)
        tunZonesCache.push([lap * LAP_LEN + CIRCUIT_TUNNEL_A, lap * LAP_LEN + CIRCUIT_TUNNEL_B]);
    } else {
      tunZonesCache = [];
      for (let lap = 0; lap < LAPS; lap++)
        tunZonesCache.push([lap * LAP_LEN + LAP_LEN * 0.325, lap * LAP_LEN + LAP_LEN * 0.378]);
    }
  }
  return tunZonesCache;
}
function tunnelBlend(d) {
  // 0 outside, ramps to 1 across ~250m before each portal and back to 0
  // across ~250m after each exit — walls, ceiling, darkness and the roadside
  // scenery hand off smoothly instead of hard-cutting at the portal.
  // (Craig 2026-09-17: "tunnel is starting and ending abruptly".)
  const R = 250;
  let b = 0;
  for (const [a, z] of tunnelZones()) {
    if (d >= a && d <= z) return 1;
    if (d < a && d > a - R) b = Math.max(b, 1 - (a - d) / R);
    if (d > z && d < z + R) b = Math.max(b, 1 - (d - z) / R);
  }
  return b;
}
function roadFade(rel, d) {
  // p3d-033 (ART-003): 100% opaque — the tunnel handoff is a hard switch at
  // the blend midpoint (the portal frame owns the transition), never an
  // alpha dissolve. Returns 1 or 0 only.
  return farFade(rel) * (tunnelBlend(d) < 0.5 ? 1 : 0);
}

/* ---------- depth-sorted jobs ---------- */
/* p3d-031 (SYS-001): the ONE depth-disciplined pipeline.
 * INVARIANT: every world-anchored drawable executes through pushJob/runJobs
 * and carries ONE depth key: `rel`, the track-relative distance in meters
 * (the true camera-space depth for road-anchored drawables). runJobs()
 * sorts far->near and executes; NO world-anchored draw may run before,
 * after, or around the sorter. The layers are:
 *   0 (base): sky — background, can never occlude anything.
 *   1 (base): the road/ground ribbon (drawRoad) — drawn per segment far->near
 *      BEFORE the sorter; it can only ever be painted UNDER world objects.
 *      Flat road paint (zebra stripes, lane dashes) lives here: paint never
 *      occludes, so cars always draw over it (BUG-073).
 *   2 (the sorter): ALL world-anchored objects — buildings, tunnel shell,
 *      tunnel furniture, portal headwall, tunnel hill, bridge, signs, lamps,
 *      trees, cars, obstacles, crowds, planters — via pushJob(rel, draw).
 *      Exactly one jobs.sort() call; exactly one runJobs() execution.
 *   3 (screen space): HUD, vignette, bloom, speed lines, sparks, weather FX
 *      and the player car (fixed screen position, intentionally unshaken) —
 *      not world-anchored, fixed order after the sorter.
 * A job whose rel is missing or non-finite would sort silently into the
 * wrong place; in harness builds pushJob counts pushed/invalid keys and
 * refuses the job so the harness can assert the invariant every frame.
 */
let jobs = [];
let jobStats = { frames: 0, pushed: 0, badKey: 0 };
function pushJob(rel, draw) {
  if (HARNESS) {
    if (typeof rel !== 'number' || !isFinite(rel)) { jobStats.badKey++; return; }
    jobStats.pushed++;
  }
  jobs.push({ rel, draw });
}
function runJobs() {
  jobStats.lastCount = jobs.length;
  jobs.sort((a, b) => b.rel - a.rel);
  jobStats.clipped = 0;
  for (const j of jobs) {
    if (j.rel <= 0 || j.rel > DRAW * SEG_LEN) continue;
    // Hills are opaque. Clip world sprites at the nearest terrain crest in
    // front of their anchor, never at their own base or by screen-Y sorting.
    const near = clamp(Math.floor(j.rel / SEG_LEN + basePct), 0, DRAW);
    const clipY = Math.min(H, runMin[near]);
    ctx.save();
    if (clipY < H) {
      ctx.beginPath(); ctx.rect(0, 0, W, Math.max(0, clipY)); ctx.clip();
      jobStats.clipped++;
    }
    j.draw(ctx);
    ctx.restore();
  }
  jobs.length = 0;
  if (HARNESS) jobStats.frames++;
}



// p3d-070: Slipstream-style 12-view player rotation set (AI-generated original
// art, 1980s anime cel style — never present as designer-drawn). Views run
// around the car: v00..v04 left hemisphere, v05 front, v06..v10 right, v11 rear.
const PLAYER_VIEW_KEYS = ['player-v00', 'player-v01', 'player-v02', 'player-v03',
  'player-v04', 'player-v05', 'player-v06', 'player-v07',
  'player-v08', 'player-v09', 'player-v10', 'player-v11'];
// view angle in degrees: 0 = front facing the camera, +/-180 = rear
const PLAYER_VIEW_ANGLES = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];
function playerViewKey(s) {
  // Craig 2026-09-24: the player car always shows its rear view. The steer/
  // drift yaw frames read as plain turning rather than drifting, so the
  // 12-view selector is parked at the rear (player-v11). The 12-view asset
  // set stays registered; civilians keep their own side-when-close logic.
  return 'player-v11';
}

function drawPlayerCar() {
  const c = ctx;
  const wpx = playerWpx(), hpx = wpx * 0.62;
  const s = G.yawVis; // progressive yaw, independent from lateral road position
  const x = W / 2;
  const y = H * 0.815;
  c.save();
  if(G.skids.length>2){
    c.save();c.strokeStyle='rgba(4,5,8,.72)';c.lineWidth=Math.max(3,wpx*.022);c.lineCap='round';
    for(const sx of [-1,1]){c.beginPath();c.moveTo(x+sx*wpx*.3,y+hpx*.34);c.quadraticCurveTo(x+sx*wpx*.34-G.yawVis*wpx*.7,y+hpx*.66,x+sx*wpx*.38-G.yawVis*wpx*1.3,H+12);c.stroke();}
    c.restore();
  }
  // invulnerability blink after a hit
  if (G.invulnT > 0 && Math.floor(G.time * 9) % 2 === 0) c.globalAlpha = 0.55;
  // p3d-032: neon underglow removed — contact shadow only
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.ellipse(x, y + hpx * 0.36, wpx * 0.5, hpx * 0.11, 0, 0, 6.29); c.fill();
  // p3d-070 (PLAYER 12-VIEW SET): the old 3-sprite set (player-rear +
  // player-steer-left/right) is replaced by the AI-generated 12-view rotation
  // set (assets32/player-v00..v11, 1980s anime cel style, original art — never
  // present as designer-drawn). playerViewKey() picks the nearest view to the
  // visual yaw; the art carries the turn, the canvas yaw is only a whisper.
  // The neon underglow and the trailing light streak are gone (Craig
  // 2026-09-20: no rainbow/light-trail styling) — only a contact shadow.
  const ddir = Math.sign(G.inputSteer) || Math.sign(G.yawVis) || 1;
  const dy = G.drift * ddir;
  // p3d-070: the 12-view set replaces the old 3-sprite (rear + steer L/R) set.
  // The art carries the yaw; the canvas rotation is only a whisper now.
  const sprKey = playerViewKey(s);
  const spr = ART[sprKey];
  c.save();
  const angle = s * 0.03 + dy * 0.02 + G.impactYaw;
  // Pivot at the comparatively stable nose/top of the image. Rotation moves
  // the rear outward, rather than sliding the entire car sideways.
  c.translate(x, y - hpx * 0.58);
  c.rotate(angle);
  if (imgReady(spr)) {
    const sw = wpx * 1.04, sh = sw * (spr.naturalHeight / spr.naturalWidth);
    c.drawImage(spr, -sw / 2, 0, sw, sh);
    c.restore();
  } else {
    c.restore();
    // Art loading is gated before entering the renderer.
  }
  // drift / boost / nitro callouts above the car
  if (G.nitroOn) pxText(c, 'NITRO!', x, y - hpx * 1.55, 3, '#53b5f9', 'center');
  else if (G.drift > 0.55) pxText(c, 'DRIFT!', x, y - hpx * 1.55, 3, '#4ae2ff', 'center');
  else if (G.driftBoostT > 0) pxText(c, 'BOOST!', x, y - hpx * 1.55, 3, '#ffd23f', 'center');
  // nitro flames
  if (G.nitroOn) {
    const fl = (0.28 + rnd() * 0.18) * hpx;
    c.fillStyle = '#53b5f9';
    for (const fxp of [-wpx * 0.20, wpx * 0.20]) {
      c.beginPath();
      c.moveTo(x + fxp - wpx * 0.035, y + hpx * 0.38); c.lineTo(x + fxp, y + hpx * 0.38 + fl); c.lineTo(x + fxp + wpx * 0.035, y + hpx * 0.38);
      c.closePath(); c.fill();
    }
    c.fillStyle = '#fff';
    for (const fxp of [-wpx * 0.20, wpx * 0.20]) {
      c.beginPath();
      c.moveTo(x + fxp - wpx * 0.025, y + hpx * 0.38); c.lineTo(x + fxp, y + hpx * 0.38 + fl * 0.5); c.lineTo(x + fxp + wpx * 0.025, y + hpx * 0.38);
      c.closePath(); c.fill();
    }
  }
  // Exhaust remains dark when nitro is inactive; no always-on pink stilts.
  c.restore();
}

function rivalDist(i) {
  // p3d-063: rivals hold a slowly-closing gap ahead of the player until
  // their pass point; past it the rival keeps driving at its own authored
  // speed — the approach pace (0.88 of the player's speed at the pass
  // instant, minimum 25 m/s), snapshotted once with its position, then
  // constant, so it never reacts to being overtaken. The player pulls away
  // at the genuine speed differential. The old scripted drive-by froze the
  // rival dead at passAt+25 and swept rel from +25 to -60 over 85m of player
  // travel, which read as the car slamming backward past the camera
  // ("retreats back so quickly it's unnatural" — Craig 2026-09-23).
  const spread = (i + 1) / (G.rivals.length + 1);
  const authored = PASS_FRAC[i] || (0.12 + spread * 0.78);
  const passAt = clamp(authored * TUNE.rivalPace, 0.08, 0.98) * TOTAL;
  const r = G.rivals[i];
  if (r.passT != null) return r.passD + r.passSpeed * (G.raceTime - r.passT);
  const gap = Math.max(25, (passAt - G.playerDist) * 0.12);
  if (G.playerDist >= passAt) {
    // first evaluation past the pass point: snapshot the CURRENT position
    // (exactly the pre-pass value — no backward jump on coarse steps) and
    // the own-speed; both frozen from here on.
    r.passT = G.raceTime;
    r.passD = G.playerDist + gap;
    r.passSpeed = Math.max(0.88 * G.speedMs, 25);
    return r.passD;
  }
  return G.playerDist + gap;
}
const TRAFFIC_PARTIAL_MAX_REL = 120;
const TRAFFIC_PARTIAL_MIN_OFFSET = .28;
function trafficFrame(base,rel,lateral,playerLateral=G.playerX) {
  // The camera/player's view of another car depends on their relative pose,
  // not the road tangent or that car's ordinary steering. Distant traffic is
  // always a clean tail. Only a close car viewed from across a meaningful
  // lateral offset exposes one of the authored, slight three-quarter sides.
  const relativeLateral=lateral-playerLateral;
  let direction='straight';
  if(rel<=TRAFFIC_PARTIAL_MAX_REL&&Math.abs(relativeLateral)>=TRAFFIC_PARTIAL_MIN_OFFSET)
    direction=relativeLateral>0?'left':'right';
  return {key:`${base}-${direction}`,direction,relativeLateral};
}
function trafficFrameOptions(direction,maxScreenWidth) {
  // Every generated frame uses the same transparent canvas and ground pivot.
  return {trafficDirection:direction,anchorX:.5,anchorY:1,maxScreenWidth};
}
function rivalJobs() {
  G.rivals.forEach((r, i) => {
    const rel = rivalDist(i) - G.playerDist;
    if (rel < RIVAL_PASS_REL || rel > 1800) return;
    const cars = ['car-sport','car-sedan','car-taxi','car-van'];
    const frame=trafficFrame(cars[i % cars.length],rel,r.x);
    pushJob(rel, c => sceneSprite(c, frame.key, rel, r.x, 0.5, null, null,
      trafficFrameOptions(frame.direction,playerWpx()*.92)));
  });
}
function playerPos() {
  let pos = 1;
  for (let i = 0; i < G.rivals.length; i++) if (rivalDist(i) > G.playerDist) pos++;
  return pos;
}

/* ---------- obstacles: traffic cars + static barriers/cones (collision) ---------- */
// Deterministic per absolute distance (hash-based, never Math.random): the same
// obstacle sits at the same DIST every run, so laps are learnable. Density is
// moderate and a full 3-lane wall is never placed — there is always a gap.
const LANES = [-0.55, 0, 0.55];
const OB_STEP = 230;      // nominal block spacing (m)
function obstacleBlocks(bd) {
  const out = [];
  const b = Math.round(bd / OB_STEP);
  if (bd < 350) return out; // clean start straight
  if (inTunnel(bd) || inTunnel(bd + 170) || inTunnel(bd - 170)) return out; // never in/near tunnels
  const h = hash01(b * 7.31 + (G.track === 'night' ? 3 : 11));
  if (h > 0.62 * TUNE.traffic) return out; // ~38% of blocks carry obstacles at 1.0x
  const lane = LANES[Math.floor(hash01(b * 3.7 + 5) * 3) % 3];
  const th = hash01(b * 9.17 + 1);
  const type = th < 0.45 ? 'car' : (hash01(b * 5.3 + 2) < 0.5 ? 'barrier' : 'cones');
  out.push({ d: bd, lane, type, seed: b });
  if (h < 0.22) { // second obstacle: different lane, offset distance — never a wall
    const lane2 = LANES[(LANES.indexOf(lane) + 1 + Math.floor(hash01(b * 4.9) * 2)) % 3];
    out.push({ d: bd + 95, lane: lane2, type: 'cones', seed: b + 1000 });
  }
  return out;
}
function obstacleDist(o) { return o.type === 'car' ? o.d + TUNE.trafficSpeed * G.raceTime : o.d; }
function hitObstacle() {
  G.hearts -= 1; G.collisions++; // telemetry: honest collision count for the non-god run
  G.invulnT = 2.0; // ~2s invulnerability: one obstacle can't chain-kill
  G.hitFlash = 1;
  G.shakeT = 0.45; // short decaying camera shake
  G.speedMs *= 0.85; // knockback: brief speed dip, accel recovers it
  const severity=clamp(G.speedMs/TOP_MS,0,1.35);
  setImpact('obstacle',G.playerX>=0?-1:1,severity);
  G.recoverT = 1.4;
  spawnSparks();
  AudioSys.beep(150, 0.3);
  if (G.hearts <= 0) {
    G.state = 'gameover';
    document.getElementById('gostats').textContent =
      'DIST ' + Math.round(G.playerDist) + 'M / ' + TOTAL + 'M';
    document.getElementById('gameover').classList.remove('hidden');
    AudioSys.beep(90, 0.6);
  }
}
function setImpact(kind,angle,severity){
  severity=clamp(severity,0,1.35);G.impact={kind,severity:+severity.toFixed(2),angle:Math.sign(angle||1),time:1};
  G.impactYaw=G.impact.angle*(.08+.12*severity);G.recoverT=Math.max(G.recoverT,.7+severity*.7);
}
function spawnSparks() {
  // clean debris burst at the car's nose; seeded directions so it reads the
  // same every hit — no stretched sprites, no lingering artifacts
  G.sparkSeq = (G.sparkSeq || 0) + 1;
  const nx = W / 2, ny = H - Math.round(H * 0.26);
  const cols = ['#ffd94a', '#ff9a3a', '#ffffff', '#ff5a4a'];
  for (let i = 0; i < 14; i++) {
    const a = hash01(G.sparkSeq * 7 + i * 3) * Math.PI - Math.PI / 2; // upward fan
    const sp = 160 + hash01(G.sparkSeq * 13 + i * 5) * 260;
    G.sparks.push({
      x: nx + (hash01(i * 11) - 0.5) * 30, y: ny,
      vx: Math.sin(a) * sp, vy: -Math.abs(Math.cos(a)) * sp * 0.8,
      life: 1, sz: 2 + hash01(i * 17) * 3,
      col: cols[i % cols.length],
    });
  }
}
function updateSparks(dt) {
  for (let i = G.sparks.length - 1; i >= 0; i--) {
    const p = G.sparks[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 700 * dt; p.vx *= 0.98;
    p.life -= dt * 2.2;
    if (p.life <= 0) G.sparks.splice(i, 1);
  }
}

function updateSkids(dt){for(const s of G.skids)s.life-=dt;while(G.skids.length&&G.skids[0].life<=0)G.skids.shift();}

function crossTrafficState(){
  const lap=Math.floor(G.playerDist/LAP_LEN), d=lap*LAP_LEN+CROSS_D+18;
  const phase=((G.raceTime*.22+lap*.31)%1+1)%1;
  // No side-on painted vehicle exists yet. Keep the signal cycle honest and
  // do not rotate rear-facing car art into a fake cross-traffic sprite.
  return {d,x:-1.75+phase*3.5,red:phase>.18&&phase<.82,integrated:false};
}
function drawSparks() {
  const c = ctx;
  for (const p of G.sparks) {
    c.globalAlpha = Math.max(0, p.life);
    c.fillStyle = p.col;
    if (p.smoke) {
      c.beginPath(); c.ellipse(p.x,p.y,p.sz*1.35,p.sz,0,0,Math.PI*2); c.fill();
    } else c.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
  }
  c.globalAlpha = 1;
}
function checkObstacles() {
  if (godMode || G.invulnT > 0 || G.state !== 'racing') return;
  const pHalf = playerHalfRoad(), pC = G.playerX + playerLeanRoad();
  const b0 = Math.floor((G.playerDist - 40) / OB_STEP), b1 = Math.floor((G.playerDist + 40) / OB_STEP);
  for (let b = b0; b <= b1; b++) {
    for (const o of obstacleBlocks(b * OB_STEP)) {
      const od = obstacleDist(o);
      // lateral hitbox = the two drawn silhouettes: the player's wheels plus
      // the obstacle's own body, measured at the obstacle's live (wobbling)
      // screen position — no padded "collide with air" zone (Craig 2026-09-17)
      const wob = 0;
      // contact = the sprites visually touching: the player car is drawn at
      // the screen height the projection assigns to ~27m ahead, so an
      // obstacle only REACHES the car visually at rel≈27 — the old <5m
      // window let hits land on sprites already pinned behind/under the car
      // (Craig 2026-09-20: invisible hits).
      const rel = od - G.playerDist;
      if (Math.abs(rel - 27) < 5 && Math.abs(o.lane + wob - pC) < pHalf + obstacleHalfRoad(o)) {
        hitObstacle();
        return;
      }
    }
  }
}
const TRAFFIC_COLS = ['#8a8f9e', '#5a7a9e', '#9e7a5a', '#6a9e7a', '#7a6a9e'];
function checkRivalBump(dt) {
  // racing contact with the 4 rival cars: a bump, not a crash — speed dip,
  // sparks and a shove, but no heart lost (Craig 2026-09-20: driving straight
  // through a solid-looking rival broke the contact illusion). The hitbox is
  // the two drawn silhouettes: player wheels (playerHalfRoad) + rival body
  // (0.50 road-widths, what rivalJobs draws), at the rival's live
  // wobbling/easing screen position. Bumps at rel≈27 — where the rival
  // sprite visually reaches the player car (p3d-011: the old rel<6 window
  // fired on a sprite pinned behind the car).
  if (G.rivalBumpT > 0) G.rivalBumpT -= dt;
  if (godMode || G.state !== 'racing' || G.rivalBumpT > 0) return;
  const pHalf = playerHalfRoad(), pC = G.playerX + playerLeanRoad();
  for (let i = 0; i < G.rivals.length; i++) {
    const r = G.rivals[i];
    const rel = rivalDist(i) - G.playerDist;
    if (Math.abs(rel - 27) > 6) continue;
    const pass = clamp(1 - Math.abs(rel - 12) / 45, 0, 1);
    const side = r.x >= 0 ? 1 : -1;
    const rx = r.x + side * pass * 0.28;
    if (Math.abs(rx - pC) < pHalf + 0.22) {
      G.rivalBumpT = 0.9; // one bump can't chain-rattle
      G.speedMs *= 0.82;
      G.shakeT = Math.max(G.shakeT, 0.3);
      setImpact('car',-Math.sign(r.x-G.playerX||1),clamp(G.speedMs/TOP_MS,0,1.2));
      r.x += Math.sign(r.x - G.playerX || 1) * 0.18; // shove the rival aside
      spawnSparks();
      AudioSys.beep(220, 0.2);
      return;
    }
  }
}
function drawTrafficCar(o, rel, fade) {
  const maxWidth=playerWpx()*.92;
  const projected=projectSprite(rel,o.lane,0).w*.5;
  sceneEffectsStats.maxTrafficPlayerRatio=Math.max(sceneEffectsStats.maxTrafficPlayerRatio,projected>0?Math.min(projected,maxWidth)/playerWpx():0);
  const frame=trafficFrame(['car-sedan','car-taxi','car-van','car-sport'][Math.abs(o.seed) % 4],rel,o.lane);
  return c => sceneSprite(c,frame.key,rel,o.lane,0.5,null,null,trafficFrameOptions(frame.direction,maxWidth));
}
function drawBarrier(o, rel, fade) {
  // p3d-067: the roadblock reads as a real A-frame construction barricade —
  // drawn at a plausible physical size (narrower than the player car) with
  // centered contact shadows under the A-frame feet, so the legs visibly
  // meet the road instead of floating on a detached cast shadow.
  return c => sceneSprite(c, 'barricade', rel, o.lane, 0.46, null, null,
    { footShadows: [0.05, 0.95], centeredShadow: true, footRx: 0.10 });
}
function drawCones(o, rel, fade) {
  return c => {
    const p = projectSprite(rel, o.lane, 0);
    const height = p.scale * PROJ_H * Y_FACTOR * 0.14;
    const width = height * ART.cone.naturalWidth / ART.cone.naturalHeight;
    for (let i = -1; i <= 1; i++) sceneSprite(c, 'cone', rel, o.lane + i * height * .9 / p.w, width / p.w);
  };
}
function obstacleJobs() {
  const b0 = Math.floor(G.playerDist / OB_STEP), b1 = Math.floor((G.playerDist + 2700) / OB_STEP);
  for (let b = b0; b <= b1; b++) {
    for (const o of obstacleBlocks(b * OB_STEP)) {
      const rel = obstacleDist(o) - G.playerDist;
      // drawn until the obstacle passes under the camera: projectSprite pins
      // near sprites at the 12m slice (no giant-loom), so the car/barrier/
      // cones stay VISIBLE right up to the contact frame — hits never land
      // on an already-faded sprite (Craig 2026-09-20: invisible hits).
      if (rel < OBSTACLE_HIT_REL) continue; // world lifetime: hit/passed at the plane
      if (nearCulled(rel) || rel > 2600) continue; // rendering: the one global policy
      const fade = farFade(rel);
      if (fade <= 0) continue;
      if (o.type === 'car') pushJob(rel, drawTrafficCar(o, rel, fade));
      else if (o.type === 'barrier') pushJob(rel, drawBarrier(o, rel, fade));
      else pushJob(rel, drawCones(o, rel, fade));
    }
  }
}

/* ---------- nitro bottles: pickups that fill the nitro bar ---------- */
// Deterministic per absolute distance (hash-based, like obstacles): the same
// bottle sits at the same DIST every run. +25 nitro per bottle, 4 bottles =
// a full bar. The bar NEVER fills any other way (no self-increment).
const NITRO_STEP = 360;
function nitroBlocks(bd) {
  const out = [];
  const b = Math.round(bd / NITRO_STEP);
  if (bd < 500) return out; // clean start straight
  if (inTunnel(bd) || inTunnel(bd + 170) || inTunnel(bd - 170)) return out; // never in/near tunnels
  if (inBridge(bd)) return out; // never on the bridge
  const lane = LANES[Math.floor(hash01(b * 11.3 + 4) * 3) % 3];
  out.push({ d: bd, lane, b });
  return out;
}
function spawnEdgeSparks(side) {
  // hot scrape sparks flung outward from the wheel kissing the road edge —
  // spawned exactly at the visual contact point, no gap (Craig 2026-09-17)
  const wpx = playerWpx();
  const nx = W / 2 + side * wpx * 0.54, ny = H - Math.round(H * 0.24);
  G.sparkSeq = (G.sparkSeq || 0) + 1;
  const cols = ['#ffd94a', '#ffffff', '#ff9a3a'];
  for (let i = 0; i < 5; i++) {
    const a = hash01(G.sparkSeq * 3 + i * 7) * 1.2 + 0.2;
    const sp = 120 + hash01(G.sparkSeq * 5 + i * 11) * 220;
    G.sparks.push({
      x: nx, y: ny + hash01(i * 13) * 30,
      vx: side * Math.cos(a) * sp * 0.9, vy: -Math.abs(Math.sin(a)) * sp * 0.7,
      life: 0.8, sz: 2 + hash01(i * 17) * 2.5, col: cols[i % cols.length],
    });
  }
}
function spawnPickupSparks() {
  // small cyan flash at the car's nose when a nitro bottle is collected
  G.sparkSeq = (G.sparkSeq || 0) + 1;
  const nx = W / 2, ny = H - Math.round(H * 0.26);
  for (let i = 0; i < 8; i++) {
    const a = hash01(G.sparkSeq * 7 + i * 3) * Math.PI * 2;
    const sp = 80 + hash01(G.sparkSeq * 13 + i * 5) * 140;
    G.sparks.push({
      x: nx, y: ny,
      vx: Math.sin(a) * sp, vy: -Math.abs(Math.cos(a)) * sp * 0.9,
      life: 0.9, sz: 2 + hash01(i * 17) * 2, col: '#4ae2ff',
    });
  }
}
function checkNitro() {
  if (G.state !== 'racing' || !G.nitroTaken) return;
  const b0 = Math.floor((G.playerDist - 30) / NITRO_STEP), b1 = Math.floor((G.playerDist + 30) / NITRO_STEP);
  for (let b = b0; b <= b1; b++) {
    for (const o of nitroBlocks(b * NITRO_STEP)) {
      if (G.nitroTaken.has(o.b)) continue;
      if (Math.abs(o.d - G.playerDist) < 14 && Math.abs(o.lane - G.playerX) < 0.34) {
        G.nitroTaken.add(o.b);
        G.nitro = Math.min(TUNE.nitroCap, G.nitro + TUNE.nitroFill);
        AudioSys.beep(1200, 0.12);
        spawnPickupSparks();
      }
    }
  }
}
function fireNitro() {
  // manual fire from the NITRO button: only when the bar is full, never automatic
  if (G.state !== 'racing' || G.nitroOn) return;
  if (G.nitro < 100) {
    // pressed too early: say why instead of silently ignoring it
    // (Craig 2026-09-20: "nitro does nothing")
    G.nitroDenyT = 0.9;
    AudioSys.beep(180, 0.15);
    return;
  }
  G.nitroOn = true; G.nitroT = 3.2;
  AudioSys.beep(990, 0.2);
}
function drawNitroBottle(o, rel, fade) {
  return c => sceneSprite(c, 'nitro-bottle', rel, o.lane, .13);
}
function nitroJobs() {
  const b0 = Math.floor(G.playerDist / NITRO_STEP), b1 = Math.floor((G.playerDist + 2700) / NITRO_STEP);
  for (let b = b0; b <= b1; b++) {
    for (const o of nitroBlocks(b * NITRO_STEP)) {
      if (G.nitroTaken && G.nitroTaken.has(o.b)) continue;
      const rel = o.d - G.playerDist;
      if (rel < NITRO_TAKE_REL) continue; // world lifetime: taken at the plane
      if (nearCulled(rel) || rel > 2600) continue; // rendering: the one global policy
      const fade = farFade(rel); // p3d-025: nearFade REMOVED — bottles stay full-alpha until taken, never fade out while approached
      if (fade <= 0) continue;
      pushJob(rel, drawNitroBottle(o, rel, fade));
    }
  }
}

/* ---------- screen-space weather/fx: snowfall + fireworks ---------- */
function drawSpeedLines() {
  // nitro speed sensation (Craig 2026-09-20: nitro must FEEL faster): white/
  // cyan streaks radiating past the screen edges while the burn is on. ~26
  // strokes, only during nitro — negligible per-frame cost.
  const c = ctx, n = 26;
  const cx = W / 2, cy = H * 0.55, r0 = Math.max(W, H) * 0.40;
  c.save();
  c.globalAlpha = 0.45;
  c.strokeStyle = '#bfe9ff';
  c.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const a = hash01(i * 17.31 + Math.floor(G.time * 24) * 0.731) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const len = 40 + hash01(i * 7.77 + Math.floor(G.time * 24) * 1.37) * 130;
    const x0 = cx + ca * r0, y0 = cy + sa * r0 * 0.7;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x0 + ca * len, y0 + sa * len * 0.7);
    c.stroke();
  }
  c.restore();
}


/* ---------- HUD (canvas pixel font, matches Pocket layout) ---------- */
function drawHUD() {
  if (H < 500) { drawCompactHUD(); return; }
  const c = ctx;
  const kmh = Math.round(G.speedMs * 3.6);
  const distPct = clamp(Math.floor(G.playerDist / TOTAL * 100), 0, 100);
  const lap = clamp(Math.floor(G.playerDist / LAP_LEN) + 1, 1, LAPS);
  const pos = playerPos();
  const top = 14;
  const big = Math.max(3, Math.round(W / 105)); // speed digits ~4px font at 412w
  // p3d-012 (BUG-041): scrim plates behind every top HUD cluster. On narrow
  // portrait viewports the top-right LAP/POS text could graze a building edge;
  // the plates guarantee no HUD element overlaps building-sprite pixels.
  const scr = 'rgba(4,6,14,0.42)';
  c.fillStyle = scr;
  const spdW = pxTextW(String(kmh), big);
  c.fillRect(4, 4, spdW + 24, big * 7 + 8 + 2 * 7 + 8 + 12);
  const lapStr = 'LAP ' + lap + '/' + LAPS, posStr = 'POS ' + pos + '/' + (G.rivals.length + 1);
  const bestStr = G.bestLap ? 'BEST ' + fmtTimeShort(Math.round(G.bestLap * 1000)) : '';
  const rW = Math.max(pxTextW(lapStr, 2), pxTextW(posStr, 2), pxTextW(bestStr, 2)) + 24;
  c.fillRect(W - 4 - rW, 4, rW, (G.bestLap ? 3 : 2) * (2 * 7 + 8) + 14);
  // left: speed
  pxText(c, String(kmh), 14, top, big, '#ffffff', 'left');
  pxText(c, 'KM/H', 16, top + big * 7 + 8, 2, '#9aa0b4', 'left');
  // center: dist %, DIST, hearts — over a dark plate so the cluster stays
  // readable against bright skies/the sun (Craig 2026-09-20: HUD legibility)
  const midBig = 3;
  const plateW = Math.min(280, W * 0.7);
  c.fillStyle = 'rgba(4,6,14,0.42)';
  c.fillRect(Math.round(W / 2 - plateW / 2), 4, Math.round(plateW), 118);
  pxText(c, distPct + '%', W / 2, top, midBig, '#ffffff', 'center');
  pxText(c, 'DIST', W / 2, top + midBig * 7 + 6, 2, '#9aa0b4', 'center');
  const hp = 2;
  const hw = 7 * hp, gapH = hp * 1.2;
  let hx = W / 2 - (TUNE.startHearts * hw + (TUNE.startHearts - 1) * gapH) / 2;
  const hy = top + midBig * 7 + 6 + 2 * 7 + 10;
  for (let i = 0; i < TUNE.startHearts; i++) {
    // lost hearts stay visible as dark outlined slots — never vanish
    // (Craig 2026-09-20: hearts must read at every count)
    if (i < G.hearts) drawHeart(c, hx, hy, hp, '#ff2a4a');
    else { drawHeart(c, hx, hy, hp, '#2a0d12'); strokeHeart(c, hx, hy, hp, '#a03545'); }
    hx += hw + gapH;
  }
  // race timer + current lap time under the hearts (p3d-002 mission HUD)
  const timeY = hy + 6 * hp + 8;
  pxText(c, 'TIME ' + fmtTimeShort(Math.floor(G.raceTime * 1000)), W / 2, timeY, 2, '#ffffff', 'center');
  pxText(c, 'CUR ' + fmtTimeShort(Math.floor((G.raceTime - G.lapStartT) * 1000)), W / 2, timeY + 2 * 7 + 4, 2, '#9aa0b4', 'center');
  // right: LAP + POS (yellow), BEST (cyan), small pixel text — over the
  // top-right scrim plate drawn above (p3d-012, BUG-041)
  pxText(c, lapStr, W - 14, top, 2, '#ffdd46', 'right');
  pxText(c, posStr, W - 14, top + 2 * 7 + 8, 2, '#ffdd46', 'right');
  if (G.bestLap) pxText(c, bestStr, W - 14, top + 2 * (2 * 7 + 8), 2, '#4ae2ff', 'right');
  // bottom: NITRO label + bar + steer hint
  const by = H - Math.round(H * 0.075);
  pxText(c, 'NITRO', 16, by - 26, 2, '#53e1ff', 'left');
  const barW = Math.round(W * 0.30), barH = 12;
  const barX = 16, barY = by - 8;
  c.fillStyle = 'rgba(10,14,24,0.85)';
  c.fillRect(barX, barY, barW, barH);
  c.strokeStyle = '#53e1ff'; c.lineWidth = 2;
  c.strokeRect(barX, barY, barW, barH);
  c.fillStyle = '#53e1ff';
  c.fillRect(barX + 2, barY + 2, (barW - 4) * clamp(G.nitro / TUNE.nitroCap, 0, 1), barH - 4);
  pxText(c, 'HOLD LEFT / RIGHT TO STEER', 16, by + 14, 2, '#e8ecf5', 'left');
  pxText(c, 'SPACE = DRIFT', 16, by + 14 + 2 * 7 + 5, 2, '#4ae2ff', 'left');
  // nitro denied: the button was pressed with a partial bar — say why
  if (G.nitroDenyT > 0 && Math.floor(G.time * 6) % 2 === 0)
    pxText(c, 'NEED FULL BAR', barX + barW + 12, by - 26, 2, '#ffd23f', 'left');
  // countdown (p3d-005): digits were present in the pixel font but rendered as
  // an unreadable flat-green blob; now white on a dark plate with magenta glow
  if (G.state === 'countdown') {
    const n = Math.floor(G.cdT / 1.0);
    const cp = Math.max(10, Math.round(W / 22));
    const label = n < 3 ? String(3 - n) : 'GO!';
    const tw = pxTextW(label, cp), cy = H * 0.36, pad = cp * 1.6;
    c.fillStyle = 'rgba(8,4,20,0.60)';
    c.fillRect(W / 2 - tw / 2 - pad, cy - pad * 0.8, tw + pad * 2, cp * 7 + pad * 1.5);
    c.strokeStyle = 'rgba(255,46,230,0.85)'; c.lineWidth = 3;
    c.strokeRect(W / 2 - tw / 2 - pad, cy - pad * 0.8, tw + pad * 2, cp * 7 + pad * 1.5);
    c.save();
    c.shadowColor = '#ff2ee6'; c.shadowBlur = cp * 2.2;
    pxText(c, label, W / 2, cy, cp, '#ffffff', 'center');
    c.shadowBlur = cp * 1.0;
    pxText(c, label, W / 2, cy, cp, '#ffffff', 'center');
    c.restore();
  }
}

/* ---------- update ---------- */
const STEP = 1 / 60;
function update(dt) {
  G.time += dt;
  if (G.state === 'title') {
    G.playerDist += 30 * dt; G.speedMs = 30;
    G.skyX = Math.sin(G.time * 0.1) * 0.3;
    return;
  }
  if (G.state === 'countdown') {
    G.cdT += dt;
    const n = Math.floor(G.cdT / 1.0);
    if (n !== G.cdStep) {
      G.cdStep = n;
      if (n < 3) AudioSys.beep(440, 0.12);
      else if (n === 3) AudioSys.beep(880, 0.3);
      else { G.state = 'racing'; }
    }
    return;
  }
  if (G.state !== 'racing') return;
  G.raceTime += dt;
  // lap timing: crossing the line records the lap (the last lap records at
  // the flag — recordLap is idempotent, guarded by lastLap >= LAPS)
  const lapNow = Math.floor(G.playerDist / LAP_LEN);
  if (lapNow > G.lastLap) {
    recordLap();
    if (lapNow < LAPS) showBanner('LAP ' + (lapNow + 1) + '/' + LAPS);
  }
  // sector banners on the circuit mission: SHIBUYA / AKIHABARA / RAINBOW / DOCKLANDS
  if (G.track === 'circuit') {
    const lf = (((G.playerDist % LAP_LEN) + LAP_LEN) % LAP_LEN) / LAP_LEN;
    let si = 0;
    for (let i = 0; i < CIRCUIT_SECTORS.length; i++) if (lf >= CIRCUIT_SECTORS[i][0]) si = i;
    if (G.sector !== si) { G.sector = si; showBanner(CIRCUIT_SECTORS[si][1]); }
  }
  // Steering presentation accumulates progressively. A tap yields a small
  // angle, a hold reveals more flank, drift adds still more, and release
  // eases back without translating the screen-space car.
  if (G.inputSteer) G.steerHold = Math.min(1, G.steerHold + dt * 1.55);
  else G.steerHold = Math.max(0, G.steerHold - dt * 2.8);
  G.steerVis += (G.inputSteer - G.steerVis) * Math.min(1, (G.inputSteer ? 7 : 4.5) * dt);
  const inLap = G.playerDist % LAP_LEN;
  const segNow = TRACK[Math.floor(inLap / SEG_LEN) % NSEG];
  // --- drift (p3d-002): hold the drift key (Space/Shift) + steer at speed.
  // Progressive 0..1 state: initiation builds while held, hold slides the
  // tail (counter-steer tucks it back in), release of a long/strong drift
  // converts to a short boost, Slipstream-style.
  const wantDrift = G.driftKey && Math.abs(G.inputSteer) > 0.2 && G.speedMs > TOP_MS * 0.45;
  if (wantDrift) {
    const was = G.drift;
    G.drift = Math.min(1, G.drift + 2.4 * dt);
    if (was < 0.55 && G.drift >= 0.55) { G.driftEvents++; G.driftT = 0; }
    if (G.drift > 0.3) { G.driftT += dt; spawnDriftSmoke(dt); }
  } else {
    if (G.drift > 0.6 && G.driftT > 0.6) G.driftBoostT = 1.1; // release boost
    G.drift = Math.max(0, G.drift - 3.2 * dt);
    G.driftT = 0;
  }
  if (G.driftBoostT > 0) G.driftBoostT -= dt;
  // p3d-071: clamp visual yaw so a drift never reaches the +/-90deg side
  // frames (player-v02/v08) — a car facing sideways reads as a bug.
  const turnYaw = G.steerVis * (0.18 + G.steerHold * 0.58);
  const driftYaw = G.steerVis * G.drift * 0.24;
  let yawTarget = turnYaw + driftYaw;
  if (yawTarget > 0.8) yawTarget = 0.8;
  else if (yawTarget < -0.8) yawTarget = -0.8;
  G.yawVis += (yawTarget - G.yawVis) * Math.min(1, (G.inputSteer ? 6 : 3.8) * dt);
  G.impactYaw += (0 - G.impactYaw) * Math.min(1, 4 * dt);
  const steerVel = G.inputSteer * TUNE.turnPower - segNow.curve * clamp(G.speedMs / TOP_MS, 0, 1.2) * 0.35
    + G.drift * G.inputSteer * 2.1; // drift slide: steer into it to slide the tail out, counter-steer to tuck back
  G.playerX += steerVel * dt;
  if (G.recoverT > 0) {
    G.recoverT = Math.max(0, G.recoverT - dt);
    if (!G.inputSteer && Math.abs(G.playerX) > 0.12) G.playerX += -G.playerX * Math.min(1, 1.35 * dt);
  }
  if(G.impact){G.impact.time-=dt;if(G.impact.time<=0)G.impact=null;}
  // road-edge scrape: the car body may never leave the road. Clamp where the
  // VISIBLE body touches the VISIBLE edge (edgeLimit, derived from the drawing
  // geometry — no gap, no overlap); grinding the edge — steering into it or
  // being pinned against it by a curve — throws sparks, slows the car, and
  // rattles the camera (Craig 2026-09-17: edge kisses did nothing and the body
  // floated outside the road).
  const lim = edgeLimit();
  if (Math.abs(G.playerX) >= lim) {
    G.playerX = Math.sign(G.playerX) * lim;
    const outward = Math.sign(steerVel) === Math.sign(G.playerX) && Math.abs(steerVel) > 0.02;
    if (outward) {
      G.scrapeT = 0.25;
      spawnEdgeSparks(Math.sign(G.playerX));
      G.shakeT = Math.max(G.shakeT, 0.12);
      if(!G.impact)setImpact('roadside',-Math.sign(G.playerX),clamp(G.speedMs/TOP_MS,0,1.2));
    }
  }
  if (G.scrapeT > 0) { G.scrapeT -= dt; G.scrapeAccum += dt; }
  // speed (base 66 m/s = 238 km/h)
  const scrape = G.scrapeT > 0;
  let target = G.nitroOn ? NITRO_MS : scrape ? TOP_MS * 0.72 : TOP_MS;
  if (!G.nitroOn && !scrape && G.drift > 0.5) target = TOP_MS * 0.96; // drift scrubs a little speed
  if (G.driftBoostT > 0 && !G.nitroOn && !scrape) target = Math.max(target, TOP_MS * 1.07); // drift-release boost
  const accel = G.nitroOn ? Math.max(60, TUNE.acceleration * 1.8) : TUNE.acceleration;
  if (G.speedMs < target) G.speedMs = Math.min(target, G.speedMs + accel * dt);
  else G.speedMs = Math.max(target, G.speedMs - 40 * dt);
  // nitro: MANUAL fire only (NITRO button). The bar fills from nitro bottles
  // picked up on the road — never self-increments, never auto-fires.
  if (G.nitroOn) {
    G.nitroT -= dt; G.nitro = Math.max(0, G.nitro - 30 * dt);
    if (G.nitroT <= 0 || G.nitro <= 0) G.nitroOn = false;
  }
  if (G.nitroDenyT > 0) G.nitroDenyT -= dt;
  checkNitro(); // bottle pickups
  G.playerDist += G.speedMs * dt;
  G.skyX += segNow.curve * dt * 0.02;
  // collision: costs 1 heart, ~2s invulnerability so hits can't chain
  if (G.invulnT > 0) G.invulnT -= dt;
  if (G.hitFlash > 0) G.hitFlash = Math.max(0, G.hitFlash - dt * 1.6);
  checkObstacles();
  checkRivalBump(dt);
  if (G.shakeT > 0) G.shakeT = Math.max(0, G.shakeT - dt);
  updateSparks(dt);
  updateSkids(dt);
  AudioSys.engine(clamp(G.speedMs / TOP_MS, 0, 1.3), G.nitroOn);
  if (G.playerDist >= TOTAL) {
    recordLap(); // final lap completes at the flag (idempotent)
    G.state = 'finished';
    document.getElementById('finish').classList.remove('hidden');
    document.getElementById('finishpos').textContent = playerPos() + OrdS(playerPos());
    let lapsHtml = '';
    for (let i = 0; i < G.lapTimes.length; i++)
      lapsHtml += 'LAP ' + (i + 1) + ' ' + fmtTime(Math.round(G.lapTimes[i] * 1000)) +
        (G.lapTimes[i] === G.bestLap ? ' ★' : '') + '<br>';
    document.getElementById('finishstats').innerHTML =
      'TIME ' + fmtTime(Math.floor(G.raceTime * 1000)) + '<br>' + lapsHtml +
      'BEST ' + fmtTime(Math.round(G.bestLap * 1000)) + '<br>TOP SPEED ' + Math.round(NITRO_KMH) + ' KM/H';
  }
}
/* ---------- mission helpers (p3d-002) ---------- */
function recordLap() {
  if (G.lastLap >= LAPS) return; // idempotent: the flag lap records once
  const lt = G.raceTime - G.lapStartT;
  G.lapTimes.push(+lt.toFixed(3));
  if (!G.bestLap || lt < G.bestLap) G.bestLap = lt;
  G.lapStartT = G.raceTime; G.lastLap = Math.floor(G.playerDist / LAP_LEN);
}
let bannerTO = 0;
function showBanner(text) {
  const b = document.getElementById('banner');
  if (!b) return;
  b.textContent = text; b.style.opacity = 1;
  clearTimeout(bannerTO);
  bannerTO = setTimeout(() => { b.style.opacity = 0; }, 2200);
}
function spawnDriftSmoke(dt) {
  // tire smoke while drifting: soft gray-blue puffs lagging the rear wheels —
  // reads as slide, not an explosion
  G.smokeT -= dt;
  if (G.smokeT > 0) return;
  G.smokeT = 0.035;
  const wpx = playerWpx(), hpx = wpx * 0.62;
  const x = W / 2, y = H * 0.815;
  const ddir = Math.sign(G.inputSteer) || Math.sign(G.steerVis) || 1;
  for (const sx of [-1, 1]) {
    G.sparks.push({
      x: x + sx * wpx * 0.30 + (rnd() - 0.5) * 10, y: y + hpx * 0.30,
      vx: -ddir * (20 + rnd() * 55), vy: -(45 + rnd() * 55),
      life: 0.9 + rnd() * 0.3, sz: 10 + rnd() * 10, col: 'rgba(185,195,210,0.48)', smoke: true,
    });
  }
  G.skids.push({d:G.playerDist,x:G.playerX-G.inputSteer*.06,life:5});
  if(G.skids.length>90)G.skids.shift();
}
function OrdS(n) { return n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'; }
function fmtTime(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000), o = Math.floor(ms % 1000);
  return m + ':' + String(s).padStart(2, '0') + '.' + String(o).padStart(3, '0');
}
function fmtTimeShort(ms) { // HUD-compact: m:ss.t
  const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000), t = Math.floor(ms % 1000 / 100);
  return m + ':' + String(s).padStart(2, '0') + '.' + t;
}

/* ---------- input ---------- */
function bindInput() {
  // manual NITRO button (shown during races; glows when the bar is full)
  const nbtn = document.getElementById('nitrobtn');
  const fire = (e) => { if (e) e.preventDefault(); AudioSys.init(); fireNitro(); };
  nbtn.addEventListener('touchstart', fire, { passive: false });
  nbtn.addEventListener('mousedown', fire);
  const press = (e) => {
    AudioSys.init();
    if (G.state !== 'racing') return;
    let left = false, right = false;
    const touches = e.touches ? Array.from(e.touches) : [e];
    for (const t of touches) { if (t.clientX < window.innerWidth / 2) left = true; else right = true; }
    G.inputSteer = (left && right) ? 0 : left ? -1 : right ? 1 : 0;
  };
  const release = () => { if (G.state === 'racing') G.inputSteer = 0; };
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); press(e); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); press(e); }, { passive: false });
  canvas.addEventListener('touchend', release);
  canvas.addEventListener('touchcancel', release);
  canvas.addEventListener('mousedown', press);
  window.addEventListener('mouseup', release);
  // keyboard (p3d-002): arrows/WASD steer, Space or Shift = drift,
  // N = nitro, R = restart. A held-key set (not a single direction value)
  // so opposite keys can't strand the steering.
  const held = { left: false, right: false };
  const applyKeys = () => { G.inputSteer = (held.right ? 1 : 0) - (held.left ? 1 : 0); };
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { held.left = true; applyKeys(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { held.right = true; applyKeys(); }
    else if (k === ' ' || k === 'Shift') { G.driftKey = true; e.preventDefault(); }
    else if (k === 'n' || k === 'N') { if (G.state === 'racing') fireNitro(); }
    else if (k === 'r' || k === 'R') {
      if (G.state === 'racing' || G.state === 'finished' || G.state === 'gameover') startRace();
    }
    else if (k === 'Escape') { e.preventDefault(); setPaused(G.state === 'racing'); }
    else if (k === 'Enter' && (G.state === 'title' || G.state === 'gameover')) startRace();
  });
  window.addEventListener('blur', () => {
    held.left = held.right = false; G.inputSteer = 0; G.driftKey = false;
    if (G.state === 'racing') setPaused(true);
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { held.left = false; applyKeys(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { held.right = false; applyKeys(); }
    else if (k === ' ' || k === 'Shift') G.driftKey = false;
  });
}

/* ---------- title / boot ---------- */
function startRace() {
  if (!artReady) return;
  AudioSys.init();
  resetRace();
  document.getElementById('title').classList.add('hidden');
  document.getElementById('finish').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  G.state = 'countdown';
}
let qaFrozen = HARNESS && Q.get('freeze') === '1';
let lastT = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.25) dt = 0.25;
  if (document.visibilityState !== 'visible' || qaFrozen || !artReady) return;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 4) { update(STEP); acc -= STEP; steps++; }
  if (steps === 4) acc = 0;
  render();
}
/* ---------- cheap full-scene bloom (p3d-005) ----------
   Downscale the finished world frame to 1/8 res (bilinear blur), then
   composite it back additively twice: a soft glow wash over every emissive
   element without per-sprite shadowBlur cost. */


function render() {
  if (!artReady) return;
  Object.keys(sceneEffectsStats).forEach(k=>sceneEffectsStats[k]=(k==='bridgeMemberMinPx'||k==='treeWorldGap'||k==='secondaryTrafficMinRel')?999:(k==='secondaryTrafficMaxRel'?-999:0));
  const env = getEnv(G.playerDist);
  projectFrame();
  ctx.save();
  if (G.shakeT > 0) {
    const k = G.shakeT / 0.45;
    ctx.translate(Math.sin(G.time * 75) * 6 * k, Math.cos(G.time * 58) * 4 * k);
  }
  drawSceneSky(env);
  drawSceneRoad(env);
  sceneSceneryJobs(env);
  sceneBridgeJobs();
  sceneTunnelJobs();
  sceneHighWallJobs();
  sceneRailJobs();
  sceneGateJobs();
  sceneSecondaryHighwayJobs(); sceneCrossroadJobs(); sceneSkidJobs();
  rivalJobs(); obstacleJobs(); nitroJobs();
  runJobs();
  ctx.restore();
  drawPlayerCar(); drawSparks();
  if (G.hitFlash > 0) {
    ctx.fillStyle = 'rgba(255,35,50,' + (G.hitFlash * 0.12) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (G.nitroOn) drawSpeedLines();
  drawHUD();
  const nb = document.getElementById('nitrobtn');
  const show = G.state === 'racing';
  nb.style.display = show ? 'block' : 'none';
  nb.classList.toggle('ready', show && G.nitro >= TUNE.nitroCap && !G.nitroOn);
}
/* ---------- p3d-032 (ART REBUILD): AI-generated art assets ----------
 * Every visible surface/sprite below comes from assets32/ — 1980s anime
 * cel-painted art AI-generated via the media image pipeline (never
 * designer-drawn; never script-drawn). Mechanical processing only:
 * chroma-key, crop, resize, re-encode. Source prompts + generation metadata:
 * hidden_files/art32/*.json. Technique: hidden_files/art32/TECHNIQUE.md.
 * Loading is async; each use site guards with imgReady() and falls back to
 * the legacy canvas path, so a slow/missing asset degrades gracefully and
 * never breaks the game or the regression harness. Texture tiles upgrade
 * the existing pattern variables in place (same guards, same scroll code). */
const ART = {};
let artReady = false;
const ART_FILES = {
  'tile-road-night': 'tile-road-night.webp',
  'tile-grass-night': 'tile-grass-night.webp',
  'tile-dirt-night': 'tile-dirt-night.webp',
  'tile-concrete-night': 'tile-concrete-night.webp',
  'tile-water-night': 'tile-water-night.webp',
  'tile-tunnel-wall': 'tile-tunnel-wall.webp',
  'tile-tunnel-ceiling': 'tile-tunnel-ceiling.webp', // p3d-033 (ART-002): AI tunnel ceiling
  'tunnel-portal-night': 'tunnel-portal-night.webp',
  'tunnel-hill-night': 'tunnel-hill-night.webp',
  'bridge-vista-night': 'bridge-vista-night.webp',
  'sky-night-band': 'sky-night-band.webp',
  'skyline-night': 'skyline-night.webp',
  'mountains-night': 'mountains-night.webp',
  'player-v00': 'player-v00.webp', 'player-v01': 'player-v01.webp',
  'player-v02': 'player-v02.webp', 'player-v03': 'player-v03.webp',
  'player-v04': 'player-v04.webp', 'player-v05': 'player-v05.webp',
  'player-v06': 'player-v06.webp', 'player-v07': 'player-v07.webp',
  'player-v08': 'player-v08.webp', 'player-v09': 'player-v09.webp',
  'player-v10': 'player-v10.webp', 'player-v11': 'player-v11.webp',
  'car-sedan': 'car-sedan.webp', 'car-taxi': 'car-taxi.webp',
  'car-van': 'car-van.webp', 'car-sport': 'car-sport.webp',
  'car-sedan-left': 'car-sedan-left.webp', 'car-sedan-straight': 'car-sedan-straight.webp', 'car-sedan-right': 'car-sedan-right.webp',
  'car-taxi-left': 'car-taxi-left.webp', 'car-taxi-straight': 'car-taxi-straight.webp', 'car-taxi-right': 'car-taxi-right.webp',
  'car-van-left': 'car-van-left.webp', 'car-van-straight': 'car-van-straight.webp', 'car-van-right': 'car-van-right.webp',
  'car-sport-left': 'car-sport-left.webp', 'car-sport-straight': 'car-sport-straight.webp', 'car-sport-right': 'car-sport-right.webp',
  'tree-pine': 'tree-pine.webp', 'tree-broad': 'tree-broad.webp',
  'cone': 'cone.webp', 'barricade': 'barricade.webp',
  'nitro-bottle': 'nitro-bottle.webp', 'lamp-night': 'lamp-night.webp',
  'gantry-night': 'gantry-night.webp', 'kanban-night': 'kanban-night.webp',
  'guardrail-seg': 'guardrail-seg.webp',
  'bridge-tower-night': 'bridge-tower-night.webp',
  // p3d-032 it1: AI facade variants + AI torii gate sprite
  'facade-night-1': 'facade-night-1.webp', 'facade-night-2': 'facade-night-2.webp',
  'facade-night-3': 'facade-night-3.webp', 'facade-night-4': 'facade-night-4.webp',
  'facade-shop-1': 'facade-shop-1.webp', 'facade-shop-2': 'facade-shop-2.webp',
  'facade-snow-1': 'facade-snow-1.webp', 'facade-snow-2': 'facade-snow-2.webp',
  'torii-night': 'torii-night.webp',
  // p3d-033 (ART-002): AI pedestrian sprites (1980s anime cel style),
  // replacing the canvas fillRect+arc crowd figures
  'person-night-1': 'person-night-1.webp',
  'person-night-2': 'person-night-2.webp',
  'person-night-3': 'person-night-3.webp',
  // p3d-032 it2: moon extracted from the sky band, drawn ONCE per frame
  'moon-night': 'moon-night.webp',
};
function imgReady(im) { return !!im && im.complete && im.naturalWidth > 0; }


// swap the procedural tiles for the AI-generated ones once loaded

function loadArt() {
  const button = document.getElementById('startbtn');
  button.disabled = true;
  let loaded = 0;
  const pending = Object.entries(ART_FILES).map(([key, file]) => new Promise((resolve, reject) => {
    const im = new Image(); ART[key] = im;
    im.onload = async () => {
      try { await im.decode(); loaded++; button.textContent = 'LOADING ' + Math.round(loaded / Object.keys(ART_FILES).length * 100) + '%'; resolve(); }
      catch (error) { reject(error); }
    };
    im.onerror = () => reject(new Error('Could not load ' + file));
    im.src = 'assets32/' + file;
  }));
  Promise.all(pending).then(() => {
    artReady = true; lastT = performance.now();
    button.disabled = false; button.textContent = 'START RACE'; render();
  }).catch(error => {
    console.error(error); button.textContent = 'ART FAILED TO LOAD — RELOAD';
  });
}
// terrain texture per district: climb grass, city/docklands concrete

resize();
loadArt(); // p3d-032: AI art assets (async; patterns upgrade in place)
bindInput();
document.getElementById('startbtn').onclick = startRace;
document.getElementById('startbtn2').onclick = startRace;
document.getElementById('startbtn3').onclick = startRace;
/* ---------- p3d-020 (BUG-050): pause menu + live Settings ---------- */
function setPaused(p) {
  if (p && G.state === 'racing') {
    G.state = 'paused';
    document.getElementById('pause').classList.remove('hidden');
  } else if (!p && G.state === 'paused') {
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('settings').classList.add('hidden');
    G.state = 'racing';
  }
}
document.getElementById('pausebtn').onclick = () => setPaused(true);
document.getElementById('resumebtn').onclick = () => setPaused(false);
document.getElementById('settingsbtn').onclick = () => {
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('settings').classList.remove('hidden');
};
document.getElementById('settingsback').onclick = () => {
  document.getElementById('settings').classList.add('hidden');
  document.getElementById('pause').classList.remove('hidden');
};
document.getElementById('quitbtn').onclick = () => {
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('settings').classList.add('hidden');
  document.getElementById('title').classList.remove('hidden');
  G.state = 'title';
};
// pause button visible only while racing (mirrors the nitro button)
const _pauseBtnSync = () => {
  const pb = document.getElementById('pausebtn');
  if (pb) pb.classList.toggle('hidden', G.state !== 'racing');
};
setInterval(_pauseBtnSync, 300);
// live tuning sliders: label, key, min, max, step, format
const TUNE_DEFS = [
  ['Vehicle speed', 'topSpeed', 30, 100, 1, (v) => v.toFixed(0) + ' m/s', 'live'],
  ['Acceleration', 'acceleration', 10, 60, 1, (v) => v.toFixed(0) + ' m/s²'],
  ['Turn power', 'turnPower', 0.5, 3.0, 0.1, (v) => v.toFixed(1)],
  ['Nitro speed', 'nitroSpeed', 40, 130, 0.5, (v) => v.toFixed(1) + ' m/s'],
  ['Nitro capacity', 'nitroCap', 50, 200, 5, (v) => v.toFixed(0)],
  ['Nitro per pickup', 'nitroFill', 5, 100, 5, (v) => v.toFixed(0)],
  ['Start health', 'startHearts', 1, 10, 1, (v) => v.toFixed(0) + ' ♥'],
  ['Road width', 'roadWidth', 10, 32, 1, (v) => v.toFixed(0)],
  ['Car size', 'carSize', 0.5, 2.0, 0.05, (v) => v.toFixed(2) + 'x'],
  ['Traffic density', 'traffic', 0, 2, 0.1, (v) => v.toFixed(1) + 'x'],
  ['Traffic speed', 'trafficSpeed', 0, 55, 1, (v) => v.toFixed(0) + ' m/s'],
  ['Opponent pace', 'rivalPace', 0.6, 1.4, 0.05, (v) => v.toFixed(2) + 'x'],
  ['Opponent count', 'rivalCount', 0, 8, 1, (v) => v.toFixed(0), 'next'],
  ['Prop density', 'propDensity', 0.25, 2, 0.25, (v) => v.toFixed(2) + 'x'],
  ['Lap count', 'lapCount', 0, 6, 1, (v) => v === 0 ? 'TRACK DEFAULT' : v.toFixed(0), 'next'],
];
function buildTuneSliders() {
  const host = document.getElementById('tunesliders');
  host.innerHTML = '';
  for (const [label, key, min, max, step, fmt, timing = 'live'] of TUNE_DEFS) {
    const row = document.createElement('div');
    row.className = 'trow';
    const lab = document.createElement('label');
    const name = document.createElement('span'); name.textContent = label + (timing === 'next' ? ' · NEXT RACE' : ' · LIVE');
    const val = document.createElement('span'); val.className = 'tval';
    val.textContent = fmt(TUNE[key]);
    lab.appendChild(name); lab.appendChild(val);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    inp.value = TUNE[key];
    inp.oninput = () => {
      TUNE[key] = parseFloat(inp.value);
      val.textContent = fmt(TUNE[key]);
      applyTune(); // immediate: speeds, road width, car size, traffic all live
      refreshTuneOutput();
      // starting health applies to the NEXT race (and the HUD heart slots now)
      if (key === 'startHearts' && (G.state === 'paused' || G.state === 'title')) {
        G.hearts = TUNE.startHearts;
      }
    };
    row.appendChild(lab); row.appendChild(inp);
    host.appendChild(row);
  }
}
buildTuneSliders();
function refreshTuneOutput() {
  const out = document.getElementById('tuneoutput');
  if (out) out.value = JSON.stringify(TUNE, null, 2);
}
document.getElementById('copytune').onclick = async () => {
  refreshTuneOutput();
  const out = document.getElementById('tuneoutput');
  out.select();
  const button = document.getElementById('copytune');
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(out.value);
    button.textContent = 'COPIED CONFIG';
  } catch (_) {
    button.textContent = 'COPY FAILED · JSON SELECTED';
    out.focus(); out.select();
  }
};
refreshTuneOutput();
/* ---------- dev log: same changelog data as CHANGELOG.md ---------- */
function esc(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function buildDevLog() {
  const dv = document.getElementById('devlog');
  const entries = (typeof window !== 'undefined' && window.TD_CHANGELOG && window.TD_CHANGELOG.length)
    ? window.TD_CHANGELOG : [];
  let html = '<div class="dhead">DEV LOG</div><div class="dsub">Running changelog — newest first. Sprite art is AI-generated; road geometry and HUD use Canvas.</div>';
  if (!entries.length) html += '<div class="dentry"><div class="dt">No changelog data loaded.</div></div>';
  for (const e of entries) {
    html += '<div class="dentry"><div class="dv">' + esc(e.version) + ' — ' + esc(e.date) + '</div><div class="dt">' + esc(e.title) + '</div>';
    const sec = (name, items) => items && items.length
      ? '<div class="dsec">' + name + '</div><ul>' + items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
    html += sec('BUG FIXES', e.fixes) + sec('NEW FEATURES', e.features) + sec('BLOCKERS', e.blockers);
    if (e.shots && e.shots.length)
      html += '<div class="dsec">EVIDENCE</div><div class="dshots">' + e.shots.map((s) =>
        '<figure><img src="' + s.data + '"><figcaption>' + esc(s.cap) + '</figcaption></figure>').join('') + '</div>';
    html += '</div>';
  }
  html += '<button id="devclose">CLOSE</button>';
  dv.innerHTML = html;
}
if (HARNESS) {
  window.__tdReset = () => {
    G.time = 0; G.skyX = 0; G.shakeT = 0; G.sparks = []; G.sparkSeq = 0;
    resetRace();
    G.state = 'countdown';
    document.getElementById('title').classList.add('hidden');
    document.getElementById('finish').classList.add('hidden');
    document.getElementById('gameover').classList.add('hidden');
    document.getElementById('devlog').classList.add('hidden');
  };
  window.__tdSetTrack = (t) => setTrack(t);
  window.__tdTune = (values) => {
    for (const [key, value] of Object.entries(values || {})) {
      if (Object.prototype.hasOwnProperty.call(TUNE, key) && Number.isFinite(value)) TUNE[key] = value;
    }
    applyTune(); buildTuneSliders(); refreshTuneOutput();
    return { ...TUNE };
  };
  // p3d-014: harness-only teleport + time control + water-polygon export,
  // for deterministic harbor probes (zero gameplay impact)
  window.__tdSetDist = (d) => { G.playerDist = d; render(); };
  // p3d-031 (SYS-001): the depth-pipeline audit hook — frames rendered,
  // jobs pushed with a valid finite depth key, jobs refused for a bad key
  window.__tdJobStats = () => JSON.stringify(jobStats);
  window.__tdSetTime = (t) => { G.time = t; render(); };
  window.__tdSetRaceTime = (t) => { G.raceTime = t; render(); };

  window.__tdGod = (on) => { godMode = !!on; };
  window.__tdSetX = (x) => { const lim = edgeLimit(); G.playerX = clamp(x, -lim, lim); };
  window.__tdEdgeLimit = () => edgeLimit();
  window.__tdSetHearts = (n) => { G.hearts = n; };
  window.__tdSteer = (v) => { G.inputSteer = v; };
  window.__tdDrift = (on) => { G.driftKey = !!on; }; // p3d-002: hold the drift key
  window.__tdInput = () => JSON.stringify({ steer: G.inputSteer, driftKey: G.driftKey });
  window.__tdPose = () => ({ steer: +G.steerVis.toFixed(3), hold: +G.steerHold.toFixed(3), yaw: +G.yawVis.toFixed(3), drift: +G.drift.toFixed(3), impactYaw: +G.impactYaw.toFixed(3) , playerView: playerViewKey(G.yawVis) });
  // p3d-070: player 12-view set inspection for tests/QA
  window.__tdPlayerViews = () => PLAYER_VIEW_KEYS.map(k => ({ key: k, loaded: !!(ART[k] && imgReady(ART[k])) }));
  window.__tdTotal = () => JSON.stringify({ total: TOTAL, laps: LAPS, lapLen: LAP_LEN });
  window.__tdTunnelZones = () => tunnelZones().map((z) => z.slice());
  window.__tdSceneWeights = d => ({...sceneWeights(d)});
  window.__tdProjectionState = () => ({width:W,height:H,projectionHeight:PROJ_H,cameraHeight:+cameraHeight().toFixed(3),horizon:HORIZON,roadHalf:+roadHalfPxAtCar().toFixed(2),playerWidth:+playerWpx().toFixed(2),playerY:+(H*.815).toFixed(2)});
  // p3d-063: harness-only rival telemetry — absolute distance, relative
  // distance and the snapshotted post-pass own-speed, so CI can assert an
  // overtaken rival keeps driving at its own speed instead of freezing.
  window.__tdRivals = () => G.rivals.map((r, i) => {
    const d = rivalDist(i);
    return {
      i, d: +d.toFixed(2), rel: +(d - G.playerDist).toFixed(2),
      passT: r.passT, passSpeed: r.passSpeed == null ? null : +r.passSpeed.toFixed(2),
      t: +G.raceTime.toFixed(3),
    };
  });
  window.__tdWorldEffects = () => ({...sceneEffectsStats});
  window.__tdVisualState = () => ({
    playerWidth: +playerWpx().toFixed(2), laneWidth: +(roadHalfPxAtCar()*2/3).toFixed(2),
    trafficOrientation: 'player-relative-frames', trafficKeys: ['car-sedan','car-taxi','car-van','car-sport'],
    trafficPartialMaxRel: TRAFFIC_PARTIAL_MAX_REL, trafficPartialMinOffset: TRAFFIC_PARTIAL_MIN_OFFSET,
    trafficMaxPlayerRatio: .92, secondaryRoadRange: [20,1600], secondaryTrafficLifecycle: [-150,1500],
    opponents: G.rivals.length, particles: G.sparks.length, skids:G.skids.length,
    impact:G.impact?{...G.impact}:null, crossTraffic:crossTrafficState(),
  });
  window.__tdTrafficFrame = (base,rel,lateral,playerLateral) => trafficFrame(base,rel,lateral,playerLateral);
  window.__tdForceImpact=(kind,speed,angle)=>{G.speedMs=speed;setImpact(kind,angle,speed/TOP_MS);spawnSparks();render();return window.__tdVisualState();};
  window.__tdSetNitro = (n) => { G.nitro = n; if (n < 100) G.nitroOn = false; };
  window.__tdSparks = () => G.sparks.length;
  window.__tdFireNitro = () => { fireNitro(); return G.nitroOn; };
  window.__tdBottles = () => {
    const out = [];
    const b0 = Math.floor((G.playerDist - 60) / NITRO_STEP), b1 = Math.floor((G.playerDist + 2000) / NITRO_STEP);
    for (let b = b0; b <= b1; b++) for (const o of nitroBlocks(b * NITRO_STEP)) {
      if (o.d > G.playerDist - 60) out.push({ d: Math.round(o.d), lane: o.lane, taken: !!(G.nitroTaken && G.nitroTaken.has(o.b)) });
    }
    return JSON.stringify(out);
  };
  window.__tdObstacles = () => {
    const out = [];
    const b0 = Math.floor((G.playerDist - 60) / OB_STEP), b1 = Math.floor((G.playerDist + 500) / OB_STEP);
    for (let b = b0; b <= b1; b++) for (const o of obstacleBlocks(b * OB_STEP)) {
      const od = obstacleDist(o);
      if (od > G.playerDist - 60) out.push({ d: Math.round(od), lane: o.lane, type: o.type });
    }
    return JSON.stringify(out);
  };
  window.__tdContact = () => {
    // harness-only contact geometry (p3d-011 BUG-030): the player's drawn
    // rect + collision half-widths, plus every obstacle within 60m with its
    // projected sprite rect and collision half-width — so the harness can
    // assert contact frames match the sprite visuals. Zero per-frame cost:
    // only computed when the harness calls it.
    const pw = playerWpx();
    const px = W / 2, py = H * 0.815;
    const out = {
      player: {
        rect: [Math.round(px - pw / 2), Math.round(py - pw * 0.62 * 0.55),
               Math.round(px + pw / 2), Math.round(py + pw * 0.62 * 0.38)],
        halfRoad: +playerHalfRoad().toFixed(4), edgeLimit: +edgeLimit().toFixed(4),
        x: +G.playerX.toFixed(3),
      },
      obstacles: [],
    };
    const b0 = Math.floor((G.playerDist - 10) / OB_STEP), b1 = Math.floor((G.playerDist + 60) / OB_STEP);
    for (let b = b0; b <= b1; b++) for (const o of obstacleBlocks(b * OB_STEP)) {
      const od = obstacleDist(o), rel = od - G.playerDist;
      if (rel < -10 || rel > 60) continue;
      const wob = o.type === 'car' ? Math.sin(G.time * 0.7 + o.seed) * 0.05 : 0;
      const p = projectSprite(Math.max(rel, 0.5), o.lane + wob, 0);
      let r;
      if (o.type === 'car') {
        const wpx = p.w * 0.50, hpx = wpx * 0.55;
        r = [p.x - wpx * 0.48, p.y - hpx * 0.5, p.x + wpx * 0.48, p.y + hpx * 0.38];
      } else if (o.type === 'barrier') {
        const wpx = p.w * 0.70, hpx = p.scale * PROJ_H * Y_FACTOR * 0.16;
        r = [p.x - wpx * 0.55, p.y - hpx, p.x + wpx * 0.55, p.y];
      } else {
        const hpx = p.scale * PROJ_H * Y_FACTOR * 0.14, sw = hpx * 1.15;
        r = [p.x - sw, p.y - hpx, p.x + sw, p.y];
      }
      out.obstacles.push({
        d: Math.round(od), rel: +rel.toFixed(1), lane: +o.lane.toFixed(3), type: o.type,
        rect: r.map((v) => Math.round(v)), halfRoad: +obstacleHalfRoad(o).toFixed(4),
      });
    }
    return JSON.stringify(out);
  };
  window.__tdState = () => {
    const inL = ((G.playerDist % LAP_LEN) + LAP_LEN) % LAP_LEN;
    const seg = TRACK[Math.floor(inL / SEG_LEN) % NSEG];
    return JSON.stringify({
      dist: Math.round(G.playerDist), state: G.state,
      speed: Math.round(G.speedMs * 3.6), lap: Math.floor(G.playerDist / LAP_LEN),
      inBridge: inBridge(G.playerDist),
      hearts: G.hearts, invuln: +G.invulnT.toFixed(2), px: +G.playerX.toFixed(2),
      nitro: Math.round(G.nitro), nitroOn: G.nitroOn, scrape: +G.scrapeT.toFixed(2),
      drift: +G.drift.toFixed(2), driftEvents: G.driftEvents,
      collisions: G.collisions, scrapeAccum: +G.scrapeAccum.toFixed(1),
      curve: +seg.curve.toFixed(2),
      lapTimes: G.lapTimes, bestLap: +G.bestLap.toFixed(3), raceTime: +G.raceTime.toFixed(1),
    });
  };
  window.__tdJump = (t) => {
    const steps = Math.round(t / STEP);
    for (let i = 0; i < steps; i++) update(STEP);
    render();
  };
  window.__tdReset();
} else {
  buildTitleScreen();
  document.getElementById('devbtn').onclick = () => {
    buildDevLog();
    document.getElementById('title').classList.add('hidden');
    document.getElementById('devlog').classList.remove('hidden');
    AudioSys.init();
  };
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'devclose') {
      document.getElementById('devlog').classList.add('hidden');
      document.getElementById('title').classList.remove('hidden');
    }
  });
}
function buildTitleScreen() {
  const carOpts = document.getElementById('caropts');
  carOpts.innerHTML = '';
  ['RED FALCON', 'NEON VIPER'].forEach((nm, i) => {
    const d = document.createElement('div');
    d.className = 'opt' + (i === 0 ? ' sel' : '');
    d.textContent = nm;
    d.onclick = () => {
      [...carOpts.children].forEach(x => x.classList.remove('sel'));
      d.classList.add('sel'); AudioSys.init(); AudioSys.beep(520, 0.08);
    };
    carOpts.appendChild(d);
  });
  const trackOpts = document.getElementById('trackopts');
  trackOpts.innerHTML = '';
  [['circuit', 'NEON CIRCUIT', 'tokyo night \u2022 3 laps \u2022 mission'],
   ['night', 'NEON NIGHT', 'city neon \u2022 2 laps'],
   ['mixed', 'SNOW & SUN', 'snow \u2022 firework tunnels \u2022 2 laps']].forEach(([val, nm, sub], i) => {
    const d = document.createElement('div');
    d.className = 'opt' + (i === 0 ? ' sel' : '');
    d.innerHTML = nm + '<small>' + sub + '</small>';
    d.onclick = () => {
      [...trackOpts.children].forEach(x => x.classList.remove('sel'));
      d.classList.add('sel'); setTrack(val); AudioSys.init(); AudioSys.beep(520, 0.08);
      document.querySelector('#title h2').textContent =
        val === 'night' ? 'NEON CITY \u2022 2 LAPS'
        : val === 'circuit' ? 'TOKYO NIGHT \u2022 3 LAPS' : 'SNOW & SUN \u2022 2 LAPS';
    };
    trackOpts.appendChild(d);
  });
}
requestAnimationFrame(frame);
