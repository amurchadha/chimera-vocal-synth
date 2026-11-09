/**
 * The drum machine on the duet page (a voice of kind "808"), as its state at one moment: the step
 * of the bar now playing, what each part plays on each of the bar's 16 steps, how bright each
 * step's flash still is, and the parts' levels. A pure function of the time, like everything a
 * captured frame draws.
 *
 * The step clock is the 808 track's own: a step is a 16th note, 15/bpm s, and step 0 starts at
 * t = 0. The bass row comes from the track's hits; the kick, snare and hats rows from an optional
 * kit hit list (src/show/kit.ts) on the same clock. Without one, only the bass row lights.
 */
import { barSteps, kitLevel, type KitTrack } from "./kit.ts";

/** The track written by tools/performance/808.mjs (100 frames per second; see its header). */
export interface Track808 {
  rate: number;
  note: number[];
  disp: number[];
  hz: number[];
  energy: number[];
  hit: number[];
  amp?: number[];
  acc?: number[];
  /** the pattern's tempo: one step is 15/bpm s (808.mjs writes it) */
  bpm?: number;
}

export const PARTS = ["kick", "snare", "hats", "bass"] as const;
export type Part = (typeof PARTS)[number];
/** when several parts fire on one step, the order its key shows them in */
const FIRST: readonly Part[] = ["kick", "bass", "snare", "hats"];

export interface MachineState {
  /** the bar now playing (0 from t = 0; negative before) */
  bar: number;
  /** the step now playing in the bar, 0..15 (-1 before the start) */
  step: number;
  /** each part's hits in this bar, by step: 0 none, else the hit's strength (1 plain, more for an accent, less for a ghost) */
  grid: Record<Part, number[]>;
  /** the steps of this bar where the hats are let open */
  open: boolean[];
  /** per step, the parts that fire there, in the order its key shows them */
  fired: Part[][];
  /** per step, its flash: 1 as the step starts, dying away after; 0 for steps not yet played or with nothing on them */
  flash: number[];
  /** each part's level 0..1 */
  level: Record<Part, number>;
  /** the crash's level 0..1 */
  crash: number;
  /** the bass's ringing envelope over the last SCOPE_S s, oldest first, 0..1 */
  scope: number[];
  /** on for the first step of every beat */
  beat: boolean;
  /** the song has started */
  running: boolean;
}

/** how long a step's flash takes to fall to 1/e, s */
export const STEP_FLASH = 0.16;
export const SCOPE_N = 64;
export const SCOPE_S = 0.8;
/** the tempo when a track doesn't carry one */
const DEFAULT_BPM = 120;

/** frame value at frame position f, linearly interpolated */
export function at(a: number[], f: number): number {
  const i = Math.max(0, Math.min(a.length - 1, Math.floor(f)));
  const j = Math.min(a.length - 1, i + 1);
  const u = Math.max(0, Math.min(1, f - i));
  return a[i] * (1 - u) + a[j] * u;
}

/** the bass hits' start times (s), sorted, and their accents: a hit starts in its frame */
const bassCache = new WeakMap<Track808, { t: number[]; acc: number[] }>();
function bassHits(tr: Track808): { t: number[]; acc: number[] } {
  let b = bassCache.get(tr);
  if (!b) {
    b = { t: [], acc: [] };
    for (let k = 0; k < tr.hit.length; k++) {
      if (!tr.hit[k]) continue;
      b.t.push(k / tr.rate);
      b.acc.push(tr.acc?.[k] || 1);
    }
    bassCache.set(tr, b);
  }
  return b;
}

/** The machine at time t (s, on the track's clock). */
export function machineState(tr: Track808, kit: KitTrack | undefined, t: number): MachineState {
  const step = 15 / (tr.bpm && tr.bpm > 0 ? tr.bpm : DEFAULT_BPM);
  const running = t >= 0;
  const si = Math.floor(t / step);
  const bar = Math.floor(si / 16), t0 = bar * 16 * step;
  const cur = running ? si - bar * 16 : -1;

  // the bar's pattern: the kit's rows, and the bass row from the track's own hits
  const ks = kit ? barSteps(kit, t0, step) : null;
  const empty = () => new Array<number>(16).fill(0);
  const bass = empty();
  const bh = bassHits(tr);
  let lo = 0, hi = bh.t.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (bh.t[m] < t0 - step / 2) lo = m + 1;
    else hi = m;
  }
  for (let i = lo; i < bh.t.length; i++) {
    const k = Math.round((bh.t[i] - t0) / step);
    if (k > 15) break;
    if (k >= 0) bass[k] = Math.max(bass[k], bh.acc[i]);
  }
  const grid: Record<Part, number[]> = { kick: ks?.kick ?? empty(), snare: ks?.snare ?? empty(), hats: ks?.hats ?? empty(), bass };
  const fired: Part[][] = [];
  const flash: number[] = [];
  for (let k = 0; k < 16; k++) {
    const on = FIRST.filter((p) => grid[p][k] > 0);
    fired.push(on);
    flash.push(on.length && k <= cur ? Math.exp(-(t - (t0 + k * step)) / STEP_FLASH) : 0);
  }

  const f = t * tr.rate - 0.5; // frame k is sampled at (k + 0.5) / rate
  const scope: number[] = [];
  for (let j = 0; j < SCOPE_N; j++) {
    const fj = (t - SCOPE_S + (j * SCOPE_S) / (SCOPE_N - 1)) * tr.rate - 0.5;
    scope.push(fj < -0.5 || !tr.disp.length ? 0 : tr.amp ? at(tr.amp, fj) : Math.abs(at(tr.disp, fj)));
  }
  const kl = kit ? kitLevel(kit, t) : { kick: 0, snare: 0, hats: 0, crash: 0 };
  return {
    bar,
    step: cur,
    grid,
    open: ks?.open ?? new Array<boolean>(16).fill(false),
    fired,
    flash,
    level: { kick: kl.kick, snare: kl.snare, hats: kl.hats, bass: running && tr.energy.length ? at(tr.energy, f) : 0 },
    crash: kl.crash,
    scope,
    beat: running && si % 4 === 0,
    running,
  };
}
