/**
 * Drums as wireframes (centimetres, y up, the floor at y = 0): a generic bass drum whose head the
 * modeled 808 moves. Shells and hardware are structure (blue), heads are white, and sound pulls
 * them towards amber.
 */
import * as THREE from "three";
import { V } from "../colors.ts";
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

// ------------------------------------------------------------------ the 808's bass drum

const BD = { r: 28, d: 40 };
/** how far the played head bows at full displacement, cm (exaggerated, as on the old flat panel) */
const BULGE = 0.45 * BD.r;
/** ripples run past the rim, out into the air, to this many radii */
export const RIPPLE_REACH = 1.5;

export interface Drum808 {
  /** head displacement, about -1..1 (up/out positive) */
  disp: number;
  /** envelope of the ringing, 0..1 */
  amp: number;
  /** output level, 0..1 */
  energy: number;
  /** hits still rippling: u, 0..1 through the ripple's life, and its strength */
  ripples: { u: number; a: number }[];
}

/** A bass drum on its side, its played head (local +y) facing +z, bowed and rippled by the model. */
export function draw808(pen: Pen, s: Drum808): void {
  const e = s.energy, h = BD.d / 2;
  place(pen, 0, BD.r + 4, 0, Math.PI / 2);
  shell(pen, BD.r, BD.d, 10, 20, e);
  // the fundamental mode bows the head; each hit's ripple rides on it
  const w = (rho: number) => {
    let z = s.disp * BULGE * (1 - rho * rho);
    for (const r of s.ripples) {
      const x = (rho - r.u * RIPPLE_REACH) / 0.1;
      z += r.a * 0.07 * BD.r * Math.exp(-x * x) * (1 - r.u) * (1 - r.u) * (1 - rho ** 6);
    }
    return z;
  };
  const glow = Math.min(1, e * 1.2);
  head(pen, BD.r, h, w, { rings: 7, spokes: 16, color: tint(V.white, glow * 0.3), width: 1.0, alpha: 0.34 + 0.4 * glow, hot: glow > 0.6 });
  // the head's profile down its middle (seen from the side, the bow bends it), and the ringing's
  // envelope either side
  const M = 40;
  for (const [k, color, width, alpha, hot] of [[1, V.white, 1.6, 1, true], [s.amp, V.amber, 1.05, 0.75, false], [-s.amp, V.amber, 1.05, 0.75, false]] as const) {
    pen.start();
    for (let i = 0; i <= M; i++) {
      const x = -1 + (2 * i) / M, rho = Math.abs(x);
      pen.p(0, h + (k === 1 ? w(rho) : k * BULGE * (1 - rho * rho)), x * BD.r);
    }
    pen.stroke(color, width, alpha, hot);
  }
  // ripples: rings out from the centre, across the head and on into the air past the rim
  for (const r of s.ripples) {
    for (let j = 0; j < 3; j++) {
      const u = r.u - j * 0.09;
      if (u <= 0) continue;
      const rho = u * RIPPLE_REACH;
      pen.circle(BD.r * rho, h + (rho < 1 ? w(rho) : 0.6), 48, V.amber, 1.05, r.a * (1 - u) * (1 - u) * (1 - j * 0.25));
    }
  }
  head(pen, BD.r, -h, () => 0, { rings: 3, spokes: 8, color: V.blueMid, width: 0.85, alpha: 0.4 });
  pen.m.identity();
  for (const sx of [1, -1]) pen.seg(sx * BD.r * 0.78, BD.r * 0.45, h - 7, sx * (BD.r + 9), 0, h + 3, V.blueMid, 1.05, 0.85); // spurs
}

/** the drum's extent: the head bowed both ways, and a ripple just past the rim (further out they
 *  have all but faded, and may run off the panel as sound does) */
export const BD_BOUNDS: V3[] = [
  ...boundsOf((pen) => draw808(pen, { disp: 1, amp: 1, energy: 0, ripples: [{ u: 0.62, a: 1 }] })),
  ...boundsOf((pen) => draw808(pen, { disp: -1, amp: 1, energy: 0, ripples: [] })),
];
