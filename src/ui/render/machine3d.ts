/**
 * A step-sequencer drum machine as a wireframe (centimetres, y up, the case's front edge towards
 * +z). It is a wide, flat case whose top slopes up to the back. Along the front is a grid of the bar
 * in four rows: kick, snare and hats, then the bass nearest the edge. Behind the grid are the 16
 * step keys in groups of four. Behind the keys are two knobs a row for each part, with that part's
 * stripe, and tempo and volume knobs, three lamps, three switches, a row of pattern buttons and a
 * small screen tracing the bass's ringing. It is generic, with no maker's layout or key colours:
 * the case is the palette's structure blue and each part has a palette colour.
 */
import { V } from "../colors.ts";
import { PARTS, SCOPE_N, type MachineState, type Part } from "../../show/sequencer.ts";
import { boundsOf, tint, type Pen, type V3 } from "./wire3d.ts";

/** each part's colour: its row, its key flashes, its knobs' stripe */
export const PART_COLOR: Record<Part, string> = { kick: V.red, snare: V.pink, hats: V.green, bass: V.amber };

const W = 33; // half-width
const ZF = 21, ZB = -19; // the front and back edges
const HF = 4, HB = 9; // the case's height at the front and the back
/** the top's height at z (it slopes up towards the back) */
const topY = (z: number) => HF + ((HB - HF) * (ZF - z)) / (ZF - ZB);

/** the 16 keys' centres across the case, in groups of four */
const KEY_X = Array.from({ length: 16 }, (_, k) => -27.2 + k * 3.45 + Math.floor(k / 4) * 0.9);
const KEY_Z0 = 2.4, KEY_Z1 = 7.4, KEY_H = 0.9;
/** the grid's rows, back to front */
const ROW_Z: Record<Part, number> = { kick: 10.0, snare: 12.2, hats: 14.4, bass: 16.6 };
const CELL = 0.7; // half a cell's depth
/** each part's knob section across the case */
const SECTION_X: Record<Part, number> = { kick: -24.5, snare: -13.5, hats: -2.5, bass: 8.5 };
/** the knobs that don't follow anything, where they were left */
const SET = [0.62, 0.35, 0.48, 0.7, 0.4, 0.55, 0.3, 0.66, 0.5, 0.58, 0.44, 0.38];

/** a point on the top surface, lifted off it by `lift` */
function on(pen: Pen, x: number, z: number, lift = 0): Pen {
  return pen.p(x, topY(z) + lift, z);
}

/** a rectangle on the top surface */
function rect(pen: Pen, x0: number, x1: number, z0: number, z1: number, lift: number, color: string, width: number, alpha: number, hot = false): void {
  pen.start();
  on(pen, x0, z0, lift);
  on(pen, x1, z0, lift);
  on(pen, x1, z1, lift);
  on(pen, x0, z1, lift);
  pen.stroke(color, width, alpha, hot, true);
}

/** a circle on the top surface */
function disc(pen: Pen, x: number, z: number, r: number, lift: number, n: number, color: string, width: number, alpha: number, hot = false): void {
  pen.start();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    on(pen, x + r * Math.cos(a), z + r * Math.sin(a), lift);
  }
  pen.stroke(color, width, alpha, hot, true);
}

/** a lamp, lit 0..1 */
function lamp(pen: Pen, x: number, z: number, color: string, lit: number): void {
  disc(pen, x, z, 0.6, 0.05, 12, color, 1.05, 0.3 + 0.7 * lit, lit > 0.5);
  if (lit > 0.15) disc(pen, x, z, 0.25, 0.05, 8, color, 1.05, lit, lit > 0.5);
}

/** a knob turned to v (0..1 sweeps 270°, 0.5 points straight back), its cap ring in `cap` */
function knob(pen: Pen, x: number, z: number, r: number, v: number, cap: string): void {
  const y0 = topY(z), h = r * 0.9, n = 12;
  pen.start();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pen.p(x + r * Math.cos(a), y0, z + r * Math.sin(a));
  }
  pen.stroke(V.blueMid, 0.85, 0.7, false, true);
  pen.start();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pen.p(x + 0.85 * r * Math.cos(a), y0 + h, z + 0.85 * r * Math.sin(a));
  }
  pen.stroke(cap, 1.05, 0.9, false, true);
  for (let i = 0; i < 4; i++) {
    const a = (i + 0.5) * (Math.PI / 2), c = Math.cos(a), s = Math.sin(a);
    pen.seg(x + r * c, y0, z + r * s, x + 0.85 * r * c, y0 + h, z + 0.85 * r * s, V.blueDim, 0.85, 0.7);
  }
  // the pointer: straight back is 12 o'clock to someone at the front
  const a = (-0.75 + 1.5 * v) * Math.PI, dx = Math.sin(a), dz = -Math.cos(a);
  pen.seg(x + 0.2 * r * dx, y0 + h, z + 0.2 * r * dz, x + 0.85 * r * dx, y0 + h, z + 0.85 * r * dz, V.white, 1.3, 0.95);
}

/** a toggle switch, its lever thrown back (up) or forward */
function toggle(pen: Pen, x: number, z: number, up: boolean): void {
  rect(pen, x - 1.1, x + 1.1, z - 0.7, z + 0.7, 0.05, V.blueMid, 0.85, 0.8);
  const y0 = topY(z), lean = up ? -0.55 : 0.55;
  const tx = x, ty = y0 + 1.6 * Math.cos(lean), tz = z + 1.6 * Math.sin(lean);
  pen.seg(x, y0, z, tx, ty, tz, V.blue, 1.3, 0.95);
  pen.start();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * Math.PI;
    pen.p(tx + 0.35 * Math.cos(a), ty, tz + 0.35 * Math.sin(a));
  }
  pen.stroke(V.blue, 1.05, 0.9, false, true);
}

/** The drum machine in the given state. */
export function drawMachine(pen: Pen, s: MachineState): void {
  pen.m.identity();

  // ---- the case: bottom, sloped top, corners, the front face's trim and the top's bevel
  const yF = topY(ZF), yB = topY(ZB);
  pen.start().p(-W, 0, ZF).p(W, 0, ZF).p(W, 0, ZB).p(-W, 0, ZB).stroke(V.blueMid, 1.0, 0.7, false, true);
  pen.start().p(-W, yF, ZF).p(W, yF, ZF).p(W, yB, ZB).p(-W, yB, ZB).stroke(V.blue, 1.3, 0.95, false, true);
  for (const x of [-W, W]) for (const z of [ZF, ZB]) pen.seg(x, 0, z, x, topY(z), z, V.blue, 1.3, 0.9);
  pen.seg(-W, HF * 0.45, ZF, W, HF * 0.45, ZF, V.blueDim, 0.85, 0.6);
  rect(pen, -W + 1.2, W - 1.2, ZB + 1.2, ZF - 1.2, 0, V.blueMid, 0.85, 0.55);

  // ---- the bar's grid: a row per part, a lamp at its head, the step now playing boxed
  for (const part of PARTS) {
    const z = ROW_Z[part], c = PART_COLOR[part], row = s.grid[part];
    lamp(pen, -30.7, z, c, 0.2 + 0.8 * s.level[part]);
    for (let k = 0; k < 16; k++) {
      const x = KEY_X[k], v = row[k];
      if (!v) {
        rect(pen, x - 1.3, x + 1.3, z - CELL, z + CELL, 0.05, V.blueDim, 0.85, 0.45);
        continue;
      }
      const f = s.fired[k].includes(part) ? s.flash[k] : 0;
      const a = Math.min(1, 0.5 + 0.25 * v + 0.5 * f);
      rect(pen, x - 1.3, x + 1.3, z - CELL, z + CELL, 0.05, c, 1.05, a, f > 0.3);
      if (part === "hats" && s.open[k]) {
        disc(pen, x, z, 0.35, 0.05, 10, c, 1.05, a); // an open hat: a ring
      } else {
        // filled: a line through the middle, two for an accent, a stub for a ghost
        const half = v < 0.6 ? 0.5 : 1.05;
        pen.start();
        on(pen, x - half, z, 0.05);
        on(pen, x + half, z, 0.05);
        pen.stroke(c, 1.05, a, f > 0.3);
        if (v > 1.2) rect(pen, x - 0.9, x + 0.9, z - 0.38, z + 0.38, 0.05, c, 0.85, a);
      }
    }
  }
  if (s.step >= 0) {
    const x = KEY_X[s.step];
    rect(pen, x - 1.65, x + 1.65, ROW_Z.kick - CELL - 0.3, ROW_Z.bass + CELL + 0.3, 0.1, V.white, 0.85, 0.55);
  }

  // ---- the 16 step keys: the one playing lights white; a key flashes in the colour of what fires on it
  for (let k = 0; k < 16; k++) {
    const x = KEY_X[k], x0 = x - 1.5, x1 = x + 1.5;
    const f = s.flash[k], fired = s.fired[k], cur = k === s.step;
    let color: string = V.blueMid, alpha = 0.75, hot = false, inner: string | null = null, innerA = 0;
    if (fired.length && f > 0.02) {
      color = tint(V.blueMid, f, PART_COLOR[fired[0]]);
      alpha = 0.75 + 0.25 * f;
      hot = f > 0.4;
      inner = PART_COLOR[fired[1] ?? fired[0]];
      innerA = f;
    } else if (cur) {
      color = V.white;
      alpha = 1;
      hot = true;
      inner = V.white;
      innerA = 0.6;
    }
    rect(pen, x0, x1, KEY_Z0, KEY_Z1, KEY_H, color, cur ? 1.3 : 1.05, alpha, hot || cur);
    pen.seg(x0, topY(KEY_Z1), KEY_Z1, x0, topY(KEY_Z1) + KEY_H, KEY_Z1, color, 0.85, alpha * 0.8);
    pen.seg(x1, topY(KEY_Z1), KEY_Z1, x1, topY(KEY_Z1) + KEY_H, KEY_Z1, color, 0.85, alpha * 0.8);
    pen.seg(x0, topY(KEY_Z1), KEY_Z1, x1, topY(KEY_Z1), KEY_Z1, color, 0.85, alpha * 0.8);
    if (inner && innerA > 0.05) rect(pen, x0 + 0.6, x1 - 0.6, KEY_Z0 + 0.7, KEY_Z1 - 0.7, KEY_H, inner, 1.05, innerA, innerA > 0.5);
  }

  // ---- each part's section: a stripe in its colour and four knobs; the first turns with the part's level
  let set = 0;
  for (const part of PARTS) {
    const cx = SECTION_X[part], c = PART_COLOR[part], lv = s.level[part];
    pen.start();
    on(pen, cx - 4.6, 0.6, 0.05);
    on(pen, cx + 4.6, 0.6, 0.05);
    pen.stroke(c, 1.05, 0.45 + 0.5 * lv, lv > 0.6);
    const cap = tint(V.blueMid, 0.45 + 0.5 * lv, c);
    knob(pen, cx - 2.6, -3.2, 1.45, 0.3 + 0.45 * lv, cap);
    knob(pen, cx + 2.6, -3.2, 1.45, SET[set++], cap);
    knob(pen, cx - 2.6, -9.0, 1.45, SET[set++], cap);
    knob(pen, cx + 2.6, -9.0, 1.45, SET[set++], cap);
  }

  // ---- tempo and volume, the lamps (beat, crash, run), the switches, the pattern buttons
  knob(pen, 20.5, -4.6, 2.5, 0.5, V.blue);
  knob(pen, 27.5, -4.6, 1.8, 0.64, V.blue);
  lamp(pen, 18.5, 0.6, V.white, s.beat ? 1 : 0);
  lamp(pen, 23.5, 0.6, V.amber, s.crash);
  lamp(pen, 28.5, 0.6, V.green, s.running ? 0.8 : 0);
  toggle(pen, 18.5, -10.2, s.running);
  toggle(pen, 23, -10.2, false);
  toggle(pen, 27.5, -10.2, true);
  for (let i = 0; i < 8; i++) {
    const x = -27 + i * 5, lit = s.running && ((s.bar % 8) + 8) % 8 === i;
    rect(pen, x - 0.9, x + 0.9, -16, -14.6, 0.4, lit ? V.white : V.blueMid, lit ? 1.3 : 0.85, lit ? 0.95 : 0.6, lit);
  }

  // ---- the screen: the bass's ringing over the last moments, newest at the right
  const sx0 = 16.8, sx1 = 30.7, sz0 = -17.4, sz1 = -13.2;
  rect(pen, sx0, sx1, sz0, sz1, 0.05, V.blueMid, 1.05, 0.85);
  pen.start();
  on(pen, sx0 + 0.5, sz1 - 0.5, 0.06);
  on(pen, sx1 - 0.5, sz1 - 0.5, 0.06);
  pen.stroke(V.blueDim, 0.85, 0.6);
  pen.start();
  for (let j = 0; j < SCOPE_N; j++) {
    const x = sx0 + 0.5 + ((sx1 - sx0 - 1) * j) / (SCOPE_N - 1);
    on(pen, x, sz1 - 0.5 - Math.min(1, s.scope[j]) * (sz1 - sz0 - 1), 0.08);
  }
  pen.stroke(V.amber, 1.05, 0.95, true);
}

const z16 = () => new Array<number>(16).fill(0);
/** the machine's extent */
export const MACHINE_BOUNDS: V3[] = boundsOf((pen) =>
  drawMachine(pen, {
    bar: 0,
    step: 0,
    grid: { kick: z16(), snare: z16(), hats: z16(), bass: z16() },
    open: new Array<boolean>(16).fill(false),
    fired: Array.from({ length: 16 }, () => []),
    flash: z16(),
    level: { kick: 0, snare: 0, hats: 0, bass: 0 },
    crash: 0,
    scope: new Array<number>(SCOPE_N).fill(0),
    beat: false,
    running: false,
  }),
);
