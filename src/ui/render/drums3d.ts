/**
 * A drum kit as a wireframe (centimetres, y up, the floor at y = 0): a generic kit (kick with its
 * pedal, snare, rack and floor tom, hi-hat, crash) posed by kitPose. Shells, stands and hardware
 * are structure (blue); heads are white and cymbals blue at rest, and a hit pulls a piece towards
 * amber (sound) as it rings.
 *
 * The audience's side is +z; the drummer sits at -z, so the drummer's left is -x.
 */
import * as THREE from "three";
import { V } from "../colors.ts";
import { BEATER_REST, type KitPose } from "../../show/kit.ts";
import { boundsOf, tint, type Pen, type V3 } from "./wire3d.ts";

const TAU = Math.PI * 2;
const rot = new THREE.Matrix4();

/** pen.m = translate(x, y, z) · rotZ(rz) · rotX(rx): a piece's local y axis tilted by rx, then rz */
function place(pen: Pen, x: number, y: number, z: number, rx = 0, rz = 0): void {
  pen.m.makeTranslation(x, y, z);
  if (rz) pen.m.multiply(rot.makeRotationZ(rz));
  if (rx) pen.m.multiply(rot.makeRotationX(rx));
}

// ------------------------------------------------------------------ parts

/**
 * A drum's shell round local y, its heads at y = ±d/2: the shell's edges and staves, a hoop over
 * each head, and lugs on the shell with their tension rods to the hoops. `glow` warms the hoops.
 */
function shell(pen: Pen, r: number, d: number, lugs: number, staves: number, glow = 0): void {
  const h = d / 2, n = 48;
  const hoop = tint(V.blue, glow * 0.7);
  for (const s of [1, -1]) {
    pen.circle(r, s * h, n, V.blueMid, 1.0, 0.7);
    pen.circle(r + 0.9, s * (h + 0.6), n, hoop, 1.3, 0.95);
    pen.circle(r + 0.9, s * (h - 0.9), n, hoop, 0.85, 0.55);
  }
  for (let i = 0; i < staves; i++) {
    const a = (i / staves) * TAU, c = Math.cos(a), sn = Math.sin(a);
    pen.seg(r * c, -h, r * sn, r * c, h, r * sn, V.blueDim, 0.85, 0.45 + 0.3 * glow);
  }
  const L = Math.min(d * 0.15, 3.2), ro = r + 1.5, rr = r + 1.2;
  for (let i = 0; i < lugs; i++) {
    const a = ((i + 0.5) / lugs) * TAU, c = Math.cos(a), sn = Math.sin(a);
    pen.start().p(r * c, -L, r * sn).p(ro * c, -L * 0.7, ro * sn).p(ro * c, L * 0.7, ro * sn).p(r * c, L, r * sn).stroke(V.blue, 1.05, 0.85);
    pen.seg(rr * c, L, rr * sn, rr * c, h + 0.6, rr * sn, V.blueMid, 0.85, 0.6);
    pen.seg(rr * c, -L, rr * sn, rr * c, -h - 0.6, rr * sn, V.blueMid, 0.85, 0.6);
  }
}

interface HeadStyle {
  rings: number;
  spokes: number;
  color: string;
  width: number;
  alpha: number;
  hot?: boolean;
}

/** a drum head at height y across radius r: rings and spokes, lifted along +y by w(ρ) cm (ρ: 0 centre, 1 rim) */
function head(pen: Pen, r: number, y: number, w: (rho: number) => number, s: HeadStyle): void {
  const n = 40;
  for (let k = 1; k < s.rings; k++) {
    const rho = k / s.rings, z = y + w(rho);
    pen.start();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      pen.p(r * rho * Math.cos(a), z, r * rho * Math.sin(a));
    }
    pen.stroke(s.color, s.width, s.alpha, s.hot, true);
  }
  const m = 4 * s.rings;
  for (let j = 0; j < s.spokes; j++) {
    const a = (j / s.spokes) * TAU, c = Math.cos(a), sn = Math.sin(a);
    pen.start();
    for (let i = 0; i <= m; i++) {
      const rho = i / m;
      pen.p(r * rho * c, y + w(rho), r * rho * sn);
    }
    pen.stroke(s.color, s.width, s.alpha * 0.8);
  }
}

/** a cymbal's height above its rim at ρ (bell up): a shallow cone and a bell */
const cymbalY = (r: number, rho: number) => r * (0.065 * (1 - rho) + 0.065 * Math.max(0, 1 - (rho / 0.24) ** 2) ** 0.8);
const CYMBAL_RINGS = [0.08, 0.24, 0.5, 0.76, 1];
const CYMBAL_SPOKE = [0.08, 0.14, 0.2, 0.24, 0.32, 0.5, 0.76, 1];

/** a cymbal round local y with its rim at y = 0, bell up (flip −1: bell down) */
function cymbal(pen: Pen, r: number, flip: 1 | -1, color: string, alpha: number, hot: boolean, spokes = 16): void {
  const n = 48;
  for (const rho of CYMBAL_RINGS) {
    const y = flip * cymbalY(r, rho), rim = rho === 1;
    pen.start();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      pen.p(r * rho * Math.cos(a), y, r * rho * Math.sin(a));
    }
    pen.stroke(color, rim ? 1.3 : 0.9, rim ? alpha : alpha * 0.7, rim && hot, true);
  }
  for (let j = 0; j < spokes; j++) {
    const a = (j / spokes) * TAU, c = Math.cos(a), sn = Math.sin(a);
    pen.start();
    for (const rho of CYMBAL_SPOKE) pen.p(r * rho * c, flip * cymbalY(r, rho), r * rho * sn);
    pen.stroke(color, 0.85, alpha * 0.55);
  }
}

/** a stand's three legs from a collar at height cy over (x, z) out to feet at radius fr */
function tripod(pen: Pen, x: number, z: number, cy: number, fr: number, turn: number): void {
  pen.m.identity();
  for (let i = 0; i < 3; i++) {
    const a = turn + (i / 3) * TAU, fx = x + fr * Math.cos(a), fz = z + fr * Math.sin(a);
    pen.seg(x, cy, z, fx, 0, fz, V.blueMid, 1.0, 0.85);
    // the brace from low on the pole to the leg's middle
    pen.seg(x, cy * 0.45, z, (x + fx) / 2, cy / 2, (z + fz) / 2, V.blueDim, 0.85, 0.7);
  }
}

/** a footboard from heel (x, zh) to toe (x, zt), the toe at height toe */
function footboard(pen: Pen, x: number, zh: number, zt: number, toe: number, color: string): void {
  pen.m.identity();
  pen.start().p(x - 4, 1.2, zh).p(x + 4, 1.2, zh).p(x + 4, toe, zt).p(x - 4, toe, zt).stroke(color, 1.05, 0.9, false, true);
  pen.seg(x - 4, 0.3, zh, x - 4, 0.3, zt, V.blueDim, 0.85, 0.7);
  pen.seg(x + 4, 0.3, zh, x + 4, 0.3, zt, V.blueDim, 0.85, 0.7);
}

// ------------------------------------------------------------------ the kit

const KICK = { r: 25.4, d: 36, y: 27 };
const SNARE = { r: 17.8, d: 14, x: -24, y: 60, z: -42 };
const HATS = { r: 17.8, x: -55, y: 94, z: -44, open: 5.5 };
const CRASH = { r: 20.3, x: -36, y: 142, z: -16 };
const RACK = { r: 12.7, d: 20, x: 10, y: 67, z: -8 };
const FLOOR = { r: 20.3, d: 34, x: 44, y: 37, z: -38 };
/** the snare's wave speed across the head, in radii per second */
const SNARE_WAVE = 7;

/** The kit in the given pose. */
export function drawKit(pen: Pen, p: KitPose): void {
  const g = p.glow;

  // ---- kick: lying on its side, the batter head (local +y) towards the drummer (-z)
  place(pen, 0, KICK.y, 0, -Math.PI / 2);
  shell(pen, KICK.r, KICK.d, 8, 16, g.kick);
  const flex = (rho: number) => -p.kickFlex * 3.2 * (1 - rho * rho);
  const kickHead = tint(V.white, g.kick * 0.8);
  head(pen, KICK.r, KICK.d / 2, flex, { rings: 4, spokes: 12, color: kickHead, width: 1.0, alpha: 0.45 + 0.5 * g.kick, hot: g.kick > 0.3 });
  head(pen, KICK.r, -KICK.d / 2, (rho) => 0.35 * flex(rho), { rings: 3, spokes: 8, color: V.white, width: 0.85, alpha: 0.32 });
  pen.m.identity();
  for (const s of [1, -1]) pen.seg(s * 20, 13, 12, s * 31, 0, 21, V.blueMid, 1.05, 0.85); // spurs

  // the pedal: base, posts and axle, footboard, and the beater swinging into the head
  const toe = 5 + 5 * (p.beater / BEATER_REST);
  pen.m.identity();
  pen.start().p(-5, 0.3, -20).p(5, 0.3, -20).p(5, 0.3, -48).p(-5, 0.3, -48).stroke(V.blueDim, 0.85, 0.7, false, true);
  for (const s of [1, -1]) pen.seg(s * 6, 0, -24, s * 6, 13, -24, V.blueMid, 1.05, 0.9);
  pen.seg(-6, 13, -24, 6, 13, -24, V.blueMid, 1.05, 0.9);
  footboard(pen, 0, -47, -27, toe, V.blueMid);
  pen.seg(0, toe, -27, 0, 10, -25, V.blueDim, 0.85, 0.8);
  const L = 17.5, psi = Math.atan2(4.2, 17) - p.beater;
  const by = 13 + L * Math.cos(psi), bz = -25.5 + L * Math.sin(psi);
  const beat = tint(V.white, g.kick);
  pen.seg(0, 13, -25.5, 0, by, bz, beat, 1.05, 0.95);
  for (const s of [1, -1]) {
    pen.start();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      pen.p(s * 3, by + 2.6 * Math.cos(a), bz + 2.6 * Math.sin(a));
    }
    pen.stroke(beat, 1.05, 0.95, g.kick > 0.3, true);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    pen.seg(-3, by + 2.6 * Math.cos(a), bz + 2.6 * Math.sin(a), 3, by + 2.6 * Math.cos(a), bz + 2.6 * Math.sin(a), beat, 0.85, 0.8);
  }

  // ---- rack tom on the kick, tipped towards the drummer
  place(pen, RACK.x, RACK.y, RACK.z, -0.5, 0.15);
  shell(pen, RACK.r, RACK.d, 6, 12);
  head(pen, RACK.r, RACK.d / 2, () => 0, { rings: 3, spokes: 8, color: V.white, width: 0.85, alpha: 0.38 });
  const [mx, my, mz] = pen.world(RACK.r + 1.6, -2, 0);
  pen.m.identity();
  pen.seg(4, KICK.y + KICK.r + 0.5, -6, 4, KICK.y + KICK.r + 7, -6, V.blueMid, 1.05, 0.9);
  pen.seg(4, KICK.y + KICK.r + 7, -6, mx, my, mz, V.blueMid, 1.05, 0.9);

  // ---- floor tom on its three legs
  place(pen, FLOOR.x, FLOOR.y, FLOOR.z);
  shell(pen, FLOOR.r, FLOOR.d, 8, 14);
  head(pen, FLOOR.r, FLOOR.d / 2, () => 0, { rings: 3, spokes: 10, color: V.white, width: 0.85, alpha: 0.38 });
  for (let i = 0; i < 3; i++) {
    const a = 0.6 + (i / 3) * TAU, c = Math.cos(a), s = Math.sin(a);
    pen.seg((FLOOR.r + 1.6) * c, 8, (FLOOR.r + 1.6) * s, (FLOOR.r + 6) * c, -FLOOR.y, (FLOOR.r + 6) * s, V.blueMid, 1.05, 0.85);
  }

  // ---- snare on its stand: a wave runs out across the head from each hit
  tripod(pen, SNARE.x, SNARE.z, 16, 20, 0.4);
  place(pen, SNARE.x, SNARE.y, SNARE.z, -0.12, 0.08);
  const [px, py, pz] = pen.world(0, -SNARE.d / 2 - 5, 0);
  pen.m.identity();
  pen.seg(SNARE.x, 13, SNARE.z, px, py, pz, V.blueMid, 1.05, 0.9);
  place(pen, SNARE.x, SNARE.y, SNARE.z, -0.12, 0.08);
  for (let i = 0; i < 3; i++) {
    const a = 0.4 + (i / 3) * TAU;
    pen.seg(0, -SNARE.d / 2 - 5, 0, 0.75 * SNARE.r * Math.cos(a), -SNARE.d / 2 - 0.6, 0.75 * SNARE.r * Math.sin(a), V.blueMid, 1.0, 0.85);
  }
  shell(pen, SNARE.r, SNARE.d, 10, 16, g.snare);
  const wave = (rho: number) => {
    let s = 0;
    for (const w of p.snare) {
      const front = w.age * SNARE_WAVE;
      const x = (rho - front) / 0.16;
      // the stick's dent at the centre, then a crest running out, pinned at the rim
      s += w.amp * (-1.6 * Math.exp(-w.age / 0.025) * (1 - rho * rho) + 1.9 * Math.exp(-w.age / 0.22) * Math.exp(-x * x) * Math.cos(2.2 * x) * (1 - rho ** 6));
    }
    return s;
  };
  const snareHead = tint(V.white, g.snare * 0.8);
  head(pen, SNARE.r, SNARE.d / 2, wave, { rings: 6, spokes: 16, color: snareHead, width: 1.0, alpha: 0.42 + 0.5 * g.snare, hot: g.snare > 0.3 });
  for (const w of p.snare) {
    const rho = w.age * SNARE_WAVE;
    if (rho >= 1) continue;
    const a = Math.min(1, w.amp) * (1 - rho) * (1 - rho);
    pen.circle(SNARE.r * rho, SNARE.d / 2 + wave(rho) + 0.2, 40, V.amber, 1.3, a);
  }
  head(pen, SNARE.r, -SNARE.d / 2, () => 0, { rings: 2, spokes: 8, color: V.white, width: 0.85, alpha: 0.28 });
  // the snare wires under the bottom head buzz with it
  const wires = tint(V.blueMid, g.snare);
  for (let k = -4; k <= 4; k++) pen.seg(-0.72 * SNARE.r, -SNARE.d / 2 - 0.8, k * 1.7, 0.72 * SNARE.r, -SNARE.d / 2 - 0.8, k * 1.7, wires, 0.85, 0.75);

  // ---- hi-hat: the bottom hat fixed bell-down, the top one on the pull rod
  tripod(pen, HATS.x, HATS.z, 24, 23, 1.2);
  const gap = p.hatGap * HATS.open, bell = cymbalY(HATS.r, 0);
  pen.m.identity();
  pen.seg(HATS.x, 18, HATS.z, HATS.x, HATS.y - bell - 0.6, HATS.z, V.blueMid, 1.3, 0.95);
  pen.seg(HATS.x, HATS.y - bell, HATS.z, HATS.x, HATS.y + gap + bell + 7, HATS.z, V.blueMid, 0.85, 0.9);
  footboard(pen, HATS.x, -72, -51, 2.5 + 6.5 * p.hatGap, V.blueMid);
  pen.seg(HATS.x, 2.5 + 6.5 * p.hatGap, -51, HATS.x, 3, HATS.z, V.blueDim, 0.85, 0.8);
  const hat = tint(V.blueMid, g.hats);
  place(pen, HATS.x, HATS.y, HATS.z);
  cymbal(pen, HATS.r, -1, hat, 0.85, false);
  place(pen, HATS.x, HATS.y + gap, HATS.z, p.hatTilt[0], p.hatTilt[1]);
  cymbal(pen, HATS.r, 1, tint(V.blue, g.hats), 0.95, g.hats > 0.3);
  pen.circle(1.3, bell + 1.5, 10, V.blueMid, 0.85, 0.9); // the clutch
  pen.circle(1.3, bell + 3.5, 10, V.blueMid, 0.85, 0.9);

  // ---- crash on its stand, rocking about the felt
  tripod(pen, CRASH.x - 8, CRASH.z - 6, 26, 25, 2.0);
  pen.m.identity();
  pen.seg(CRASH.x - 8, 22, CRASH.z - 6, CRASH.x - 2, CRASH.y - 14, CRASH.z - 2, V.blueMid, 1.05, 0.9);
  pen.seg(CRASH.x - 2, CRASH.y - 14, CRASH.z - 2, CRASH.x, CRASH.y - 3, CRASH.z, V.blueMid, 1.05, 0.9);
  place(pen, CRASH.x, CRASH.y, CRASH.z, -0.32 + p.crashTilt[0], -0.22 + p.crashTilt[1]);
  pen.seg(0, -3, 0, 0, cymbalY(CRASH.r, 0) + 3, 0, V.blueMid, 0.85, 0.9);
  cymbal(pen, CRASH.r, 1, tint(V.blue, g.crash), 0.95, g.crash > 0.25, 18);
  pen.circle(1.6, cymbalY(CRASH.r, 0) + 1.2, 10, V.blueMid, 0.85, 0.8);
}

/** the kit's extent: the rest pose with the hats open and the crash tipped (it wobbles) */
export const KIT_BOUNDS: V3[] = boundsOf((pen) =>
  drawKit(pen, { beater: BEATER_REST, kickFlex: 0, snare: [], hatGap: 1, hatTilt: [0, 0], crashTilt: [0.1, 0.06], glow: { kick: 0, snare: 0, hats: 0, crash: 0 } }),
);
