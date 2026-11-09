/**
 * A synth keyboard as a wireframe (centimetres, y up, the player at +z): 37 keys, C to C. Each
 * white key is notched where its black neighbours sit, so no line runs under a black key. A
 * pressed key tips down at the front, pivoting at the back. On the left are a pitch wheel and a
 * mod wheel in a block. Behind the keys, a control panel slopes up to the back with two groups
 * of knobs, a small screen tracing a waveform of what's sounding, and a lamp for each part. It is
 * generic, with no maker's layout: the case is the palette's structure blue, white keys are
 * white, black keys blue, and each part has a palette colour.
 */
import { V } from "../colors.ts";
import { KEY_COUNT, WAVE_N, isBlack, type KeysPart, type KeysState } from "../../show/keys.ts";
import { boundsOf, knob, tint, type Pen, type V3 } from "./wire3d.ts";

/** each part's colour: its keys' glow, its lamp, its readout */
export const KEYS_COLOR: Record<KeysPart, string> = { chord: V.green, riff: V.pink };

const KW = 2.35, GAP = 0.18; // a white key's pitch and the gap between keys
const NW = 22; // white keys in 37, C to C
const WL = 14.5, KT = 1.4, KY = 4.0; // white keys' length, thickness and top
const ZF = 8, ZK = ZF - WL; // the keys' front edge and the back (their pivot)
const BW = 1.25, BL = 9.2, BH = 1.0; // black keys' width, length and height above the white
const ZB = ZK + BL; // the black keys' front
/** a black key's offset from the line between its white neighbours, by pitch class */
const BLACK_OFF: Record<number, number> = { 1: -0.22, 3: 0.22, 6: -0.28, 8: 0, 10: 0.28 };
const DIP = 0.75, BDIP = 0.6; // how far a pressed key's front goes down

const WHEELS = 8.5, RIGHT = 2.0; // the wheel block's width and the right cheek's
const CL = -(NW * KW + WHEELS + RIGHT) / 2, CR = -CL; // the case's sides
const KX = CL + WHEELS; // the keys' left edge
const KXR = KX + NW * KW; // their right edge
const CZF = ZF + 1.5, CZB = -19; // the case's front and back
const LIP = 2.2, CHEEK = 4.6; // the front lip's height under the keys, the cheeks' height
const PZ = -7, PY0 = 6.0, PY1 = 7.6; // the panel: its front edge and its height there and at the back
/** the panel's height at z (it slopes up towards the back) */
const panelY = (z: number) => PY0 + ((PY1 - PY0) * (PZ - z)) / (PZ - CZB);

/** the parts' glow on a key: the outline's colour and alpha, and the inner mark's when lit */
function lit(rest: string, restA: number, chord: number, riff: number): { color: string; alpha: number; hot: boolean; inner: string | null; innerA: number } {
  const g = Math.max(chord, riff);
  if (g < 0.02) return { color: rest, alpha: restA, hot: false, inner: null, innerA: 0 };
  // both parts on one key: the outline in the chord's colour, the mark in the riff's
  const out: KeysPart = chord >= 0.02 ? "chord" : "riff";
  const mark: KeysPart = riff >= 0.02 ? "riff" : "chord";
  const u = out === "chord" ? chord : riff;
  return { color: tint(rest, Math.min(1, 0.35 + 0.65 * u), KEYS_COLOR[out]), alpha: restA + (1 - restA) * g, hot: g > 0.5, inner: KEYS_COLOR[mark], innerA: mark === "chord" ? chord : riff };
}

function whiteKey(pen: Pen, k: number, wi: number, s: KeysState): void {
  const xl = KX + wi * KW + GAP / 2, xr = KX + (wi + 1) * KW - GAP / 2;
  const d = DIP * s.press[k];
  const y = (z: number) => KY - (d * (z - ZK)) / (ZF - ZK);
  // notched where a black key sits beside it
  const nl = k > 0 && isBlack(k - 1) ? KX + wi * KW + BLACK_OFF[(k - 1) % 12] + BW / 2 + GAP / 2 : null;
  const nr = k < KEY_COUNT - 1 && isBlack(k + 1) ? KX + (wi + 1) * KW + BLACK_OFF[(k + 1) % 12] - BW / 2 - GAP / 2 : null;
  const zn = ZB + GAP / 2;
  const L = lit(V.white, 0.42, s.chord[k], s.riff[k]);
  pen.start().p(xl, y(ZF), ZF).p(xr, y(ZF), ZF);
  if (nr !== null) pen.p(xr, y(zn), zn).p(nr, y(zn), zn).p(nr, y(ZK), ZK);
  else pen.p(xr, y(ZK), ZK);
  if (nl !== null) pen.p(nl, y(ZK), ZK).p(nl, y(zn), zn).p(xl, y(zn), zn);
  else pen.p(xl, y(ZK), ZK);
  pen.stroke(L.color, L.hot ? 1.3 : 0.95, L.alpha, L.hot, true);
  pen.start().p(xl, y(ZF), ZF).p(xl, y(ZF) - KT, ZF).p(xr, y(ZF) - KT, ZF).p(xr, y(ZF), ZF).stroke(L.color, 0.85, L.alpha * 0.8);
  if (L.inner && L.innerA > 0.05) {
    const z0 = ZF - 0.7, z1 = zn + 0.8;
    pen.start().p(xl + 0.45, y(z0), z0).p(xr - 0.45, y(z0), z0).p(xr - 0.45, y(z1), z1).p(xl + 0.45, y(z1), z1).stroke(L.inner, 1.05, L.innerA, L.innerA > 0.5, true);
  }
}

function blackKey(pen: Pen, k: number, wi: number, s: KeysState): void {
  const x = KX + wi * KW + BLACK_OFF[k % 12], x0 = x - BW / 2, x1 = x + BW / 2;
  const d = BDIP * s.press[k];
  const y = (z: number) => KY + BH - (d * (z - ZK)) / (ZB - ZK);
  const L = lit(V.blueMid, 0.9, s.chord[k], s.riff[k]);
  pen.start().p(x0, y(ZB), ZB).p(x1, y(ZB), ZB).p(x1, y(ZK), ZK).p(x0, y(ZK), ZK).stroke(L.color, L.hot ? 1.3 : 1.05, L.alpha, L.hot, true);
  pen.start().p(x0, y(ZB), ZB).p(x0, KY, ZB).p(x1, KY, ZB).p(x1, y(ZB), ZB).stroke(L.color, 0.85, L.alpha * 0.8);
  if (L.inner && L.innerA > 0.05) {
    const z0 = ZB - 0.6, z1 = ZK + 2.2;
    pen.start().p(x0 + 0.3, y(z0), z0).p(x1 - 0.3, y(z0), z0).p(x1 - 0.3, y(z1), z1).p(x0 + 0.3, y(z1), z1).stroke(L.inner, 1.05, L.innerA, L.innerA > 0.5, true);
  }
}

/** a wheel in the left block: the part above the block's top, its ridges turning with `turn` (rad, + towards the player) */
function wheel(pen: Pen, x: number, z: number, turn: number, mark: string): void {
  const r = 2.8, cy = CHEEK - 0.9, half = 0.55;
  const reach = Math.acos((CHEEK - cy) / r); // the angle from the top where it goes under
  const at = (a: number): [number, number] => [cy + r * Math.cos(a), z + r * Math.sin(a)];
  for (const side of [x - half, x + half]) {
    pen.start();
    for (let i = 0; i <= 10; i++) {
      const [py, pz] = at(-reach + (2 * reach * i) / 10);
      pen.p(side, py, pz);
    }
    pen.stroke(V.blue, 1.05, 0.9);
  }
  for (let j = -8; j <= 8; j++) {
    const a = turn + (j * Math.PI) / 8;
    if (Math.abs(a) >= reach) continue;
    const [py, pz] = at(a);
    pen.seg(x - half, py, pz, x + half, py, pz, j === 0 ? mark : V.blueDim, j === 0 ? 1.3 : 0.85, j === 0 ? 1 : 0.7);
  }
  const dz = r * Math.sin(reach) + 0.25;
  pen.start().p(x - half - 0.3, CHEEK, z - dz).p(x + half + 0.3, CHEEK, z - dz).p(x + half + 0.3, CHEEK, z + dz).p(x - half - 0.3, CHEEK, z + dz).stroke(V.blueMid, 0.85, 0.7, false, true);
}

/** a lamp on the panel, lit 0..1 */
function lamp(pen: Pen, x: number, z: number, color: string, u: number): void {
  for (const [r, a] of [[0.6, 0.3 + 0.7 * u], [0.25, u]] as const) {
    if (a < 0.15) continue;
    pen.start();
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * 2 * Math.PI;
      pen.p(x + r * Math.cos(t), panelY(z) + 0.05, z + r * Math.sin(t));
    }
    pen.stroke(color, 1.05, a, u > 0.5, true);
  }
}

/** The keyboard in the given state. */
export function drawKeys(pen: Pen, s: KeysState): void {
  pen.m.identity();

  // ---- the case: its bottom, the side profiles, the front lip, the cheeks' tops, the panel's edges
  pen.start().p(CL, 0, CZF).p(CR, 0, CZF).p(CR, 0, CZB).p(CL, 0, CZB).stroke(V.blueMid, 1.0, 0.7, false, true);
  for (const x of [CL, CR]) pen.start().p(x, 0, CZF).p(x, CHEEK, CZF).p(x, CHEEK, PZ).p(x, PY0, PZ).p(x, PY1, CZB).p(x, 0, CZB).stroke(V.blue, 1.3, 0.9, false, true);
  pen.seg(CL, CHEEK, CZF, KX, CHEEK, CZF, V.blue, 1.3, 0.9);
  pen.seg(KXR, CHEEK, CZF, CR, CHEEK, CZF, V.blue, 1.3, 0.9);
  pen.start().p(KX, CHEEK, CZF).p(KX, LIP, CZF).p(KXR, LIP, CZF).p(KXR, CHEEK, CZF).stroke(V.blue, 1.05, 0.85);
  pen.seg(KX, CHEEK, CZF, KX, CHEEK, PZ, V.blueMid, 0.85, 0.7);
  pen.seg(KXR, CHEEK, CZF, KXR, CHEEK, PZ, V.blueMid, 0.85, 0.7);
  pen.seg(KX, CHEEK, PZ, KXR, CHEEK, PZ, V.blueMid, 0.85, 0.6);
  pen.seg(CL, PY0, PZ, CR, PY0, PZ, V.blue, 1.3, 0.95);
  pen.seg(CL, PY1, CZB, CR, PY1, CZB, V.blue, 1.3, 0.95);

  // ---- the keys: the white ones, then the black ones over them
  let wi = 0;
  const whites: number[] = [];
  for (let k = 0; k < KEY_COUNT; k++) {
    whites.push(wi);
    if (!isBlack(k)) wi++;
  }
  for (let k = 0; k < KEY_COUNT; k++) if (!isBlack(k)) whiteKey(pen, k, whites[k], s);
  for (let k = 0; k < KEY_COUNT; k++) if (isBlack(k)) blackKey(pen, k, whites[k], s);

  // ---- the wheels: pitch at its centre, mod rolled away from the player as the riff plays
  const mod = Math.min(1, 0.12 + 0.75 * s.riffLevel);
  wheel(pen, CL + 2.6, 1.0, 0, V.white);
  wheel(pen, CL + 5.9, 1.0, 1.0 - 2.0 * mod, mod > 0.35 ? KEYS_COLOR.riff : V.white);

  // ---- the panel: knobs either side of the screen; the first on the left turns with how much is
  // sounding, the first on the right with the riff
  const busy = 1 - Math.exp(-s.busy / 2.5);
  const zk = -12.6;
  const left = [-27, -22.5, -18, -13.5], right = [14.5, 19, 23.5, 28];
  const set = [0.42, 0.6, 0.35, 0.55, 0.68, 0.3];
  knob(pen, left[0], panelY(zk), zk, 1.5, 0.25 + 0.55 * busy, tint(V.blueMid, 0.4 + 0.6 * busy, KEYS_COLOR.chord));
  for (let i = 1; i < 4; i++) knob(pen, left[i], panelY(zk), zk, 1.5, set[i - 1], V.blueMid);
  knob(pen, right[0], panelY(zk), zk, 1.5, 0.3 + 0.5 * s.riffLevel, tint(V.blueMid, 0.4 + 0.6 * s.riffLevel, KEYS_COLOR.riff));
  for (let i = 1; i < 4; i++) knob(pen, right[i], panelY(zk), zk, 1.5, set[i + 2], V.blueMid);
  lamp(pen, 11.2, -10.6, KEYS_COLOR.chord, Math.min(1, Math.max(...s.chord)));
  lamp(pen, 11.2, -14.6, KEYS_COLOR.riff, Math.min(1, Math.max(...s.riff)));

  // ---- the screen: a waveform of what's sounding
  const sx0 = -9, sx1 = 9, sz0 = -16.6, sz1 = -9.4, zc = (sz0 + sz1) / 2;
  const on = (x: number, z: number) => pen.p(x, panelY(z) + 0.06, z);
  pen.start();
  on(sx0, sz0);
  on(sx1, sz0);
  on(sx1, sz1);
  on(sx0, sz1);
  pen.stroke(V.blueMid, 1.05, 0.85, false, true);
  pen.start();
  on(sx0 + 0.6, zc);
  on(sx1 - 0.6, zc);
  pen.stroke(V.blueDim, 0.85, 0.6);
  pen.start();
  for (let j = 0; j < WAVE_N; j++) on(sx0 + 0.6 + ((sx1 - sx0 - 1.2) * j) / (WAVE_N - 1), zc - s.wave[j] * (zc - sz0 - 0.6));
  pen.stroke(V.amber, 1.05, 0.95, true);
}

/** the keyboard's extent */
export const KEYS_BOUNDS: V3[] = boundsOf((pen) => {
  const z = () => new Array<number>(KEY_COUNT).fill(0);
  drawKeys(pen, { lo: 48, press: z(), chord: z(), riff: z(), chordName: "", chordLive: false, riffNote: "", riffLive: false, busy: 0, riffLevel: 0, wave: new Array<number>(WAVE_N).fill(0) });
});
