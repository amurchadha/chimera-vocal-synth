/**
 * The synth keyboard on the duet page (a voice of kind "keys"): what it plays, as its state at one
 * moment. A pure function of the notes and the time, like everything a captured frame draws.
 *
 *   { "notes": [{ "t": 0.20, "dur": 0.81, "midi": 67, "part": "chord" }, { "t": 0.61, "dur": 0.2, "midi": 62, "part": "riff" }, …] }
 *
 * t and dur are seconds on the show's clock; a note sounds while t <= time < t + dur.
 */

export type KeysPart = "chord" | "riff";
export interface KeysNote {
  t: number;
  dur: number;
  midi: number;
  part: KeysPart;
}
export interface KeysTrack {
  notes: KeysNote[];
}

/** keys on the keyboard: three octaves, C to C */
export const KEY_COUNT = 37;
/** how long a released key takes to come back up, s */
export const RELEASE = 0.1;
/** how long a key takes to go down, s */
const ATTACK = 0.012;
/** a struck key's glow: brightest as it's struck, falling to SUSTAIN over ~FLASH s while held */
const FLASH = 0.15, SUSTAIN = 0.65;
/** the knobs' drift with how much is sounding: rising over ~DRIFT_UP s, falling over ~DRIFT_DOWN s after */
const DRIFT_UP = 0.25, DRIFT_DOWN = 0.5;
/** how far back the drift still feels a note that has ended, s */
const DRIFT_REACH = 6 * DRIFT_DOWN;
export const WAVE_N = 64;

export interface KeysState {
  /** the lowest key's MIDI note */
  lo: number;
  /** per key: how far down, 0..1 */
  press: number[];
  /** per key: its glow in each part's colour, 0..1 */
  chord: number[];
  riff: number[];
  /** the chord sounding (or the last one, `chordLive` false), e.g. "Gm"; "" before the first */
  chordName: string;
  chordLive: boolean;
  /** the riff's note sounding (or the last one, `riffLive` false), e.g. "D4"; "" before the first */
  riffNote: string;
  riffLive: boolean;
  /** how much is sounding, eased (about the number of notes held) */
  busy: number;
  /** how much of the riff is sounding, eased, 0..1 (1 - e^-x of about the riff notes held) */
  riffLevel: number;
  /** a little waveform of what's sounding, -1..1 */
  wave: number[];
}

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** a note's name with its octave, e.g. 62 -> "D4" (spelled as chords are: Bb, not A#) */
export function noteLabel(midi: number): string {
  return `${FLAT[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** chord shapes: their intervals above the root, simplest first */
const CHORDS: [string, number[]][] = [
  ["", [0, 4, 7]],
  ["m", [0, 3, 7]],
  ["5", [0, 7]],
  ["7", [0, 4, 7, 10]],
  ["m7", [0, 3, 7, 10]],
  ["maj7", [0, 4, 7, 11]],
  ["sus4", [0, 5, 7]],
  ["sus2", [0, 2, 7]],
  ["dim", [0, 3, 6]],
  ["aug", [0, 4, 8]],
  ["6", [0, 4, 7, 9]],
  ["m6", [0, 3, 7, 9]],
  ["m7b5", [0, 3, 6, 10]],
  ["dim7", [0, 3, 6, 9]],
  ["add9", [0, 2, 4, 7]],
  ["madd9", [0, 2, 3, 7]],
  ["9", [0, 2, 4, 7, 10]],
  ["m9", [0, 2, 3, 7, 10]],
  ["maj9", [0, 2, 4, 7, 11]],
];

/**
 * The chord's name from the notes sounding, e.g. [67, 70, 74] -> "Gm", [64, 67, 72] -> "C/E". A shape
 * may leave out its fifth. The root is preferred in the bass; a chord whose root isn't in the bass is
 * written over its bass note. Notes that make no chord name the bass note; none, "".
 */
export function chordName(midis: readonly number[]): string {
  if (!midis.length) return "";
  const bass = Math.min(...midis), bpc = ((bass % 12) + 12) % 12;
  const pcs = [...new Set(midis.map((m) => ((m % 12) + 12) % 12))];
  let best: { score: number; name: string } | null = null;
  for (const root of pcs) {
    const iv = new Set(pcs.map((p) => (p - root + 12) % 12));
    CHORDS.forEach(([q, shape], rank) => {
      const exact = shape.length === iv.size && shape.every((i) => iv.has(i));
      const no5 = !exact && shape.includes(7) && shape.length - 1 === iv.size && iv.size >= 2 && shape.every((i) => i === 7 || iv.has(i));
      if (!exact && !no5) return;
      const score = (root === bpc ? 0 : 100) + (exact ? 0 : 50) + rank;
      if (best && best.score <= score) return;
      const minorish = q.startsWith("m") && !q.startsWith("maj") || q.startsWith("dim");
      const name = (minorish && (root === 1 || root === 8) ? SHARP : FLAT)[root] + q;
      best = { score, name: root === bpc ? name : `${name}/${FLAT[bpc]}` };
    });
  }
  return (best as { name: string } | null)?.name ?? FLAT[bpc];
}

interface KeysIndex {
  /** the notes by start time */
  notes: KeysNote[];
  /** the longest note, s */
  maxDur: number;
  lo: number;
}
const cache = new WeakMap<KeysTrack, KeysIndex>();

/**
 * The keyboard's lowest key: the C that puts every note on a key with the notes nearest the middle;
 * when they span more than three octaves, the C that puts the most of them on a key (the rest are
 * folded in by octaves, foldKey).
 */
export function keyRange(notes: readonly KeysNote[]): number {
  if (!notes.length) return 48;
  const ms = notes.map((n) => Math.round(n.midi));
  const min = Math.min(...ms), max = Math.max(...ms), mid = (min + max) / 2;
  let best = 48, bestIn = -1, bestOff = Infinity;
  for (let lo = Math.floor(min / 12) * 12 - 36; lo <= max; lo += 12) {
    const inside = ms.filter((m) => m >= lo && m < lo + KEY_COUNT).length;
    const off = Math.abs(lo + (KEY_COUNT - 1) / 2 - mid);
    if (inside > bestIn || (inside === bestIn && off < bestOff)) [best, bestIn, bestOff] = [lo, inside, off];
  }
  return best;
}

/** the key (0..KEY_COUNT-1) a note lands on, folded by octaves into the keyboard */
export function foldKey(midi: number, lo: number): number {
  let k = Math.round(midi) - lo;
  while (k < 0) k += 12;
  while (k >= KEY_COUNT) k -= 12;
  return k;
}

function indexOf(tr: KeysTrack): KeysIndex {
  let ix = cache.get(tr);
  if (!ix) {
    const notes = tr.notes.filter((n) => Number.isFinite(n.t) && n.dur > 0 && Number.isFinite(n.midi)).sort((a, b) => a.t - b.t);
    ix = { notes, maxDur: notes.reduce((m, n) => Math.max(m, n.dur), 0), lo: keyRange(notes) };
    cache.set(tr, ix);
  }
  return ix;
}

/** the index of the last note starting at or before t, -1 if none */
function lastStart(a: KeysNote[], t: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m].t <= t) lo = m + 1;
    else hi = m;
  }
  return lo - 1;
}

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** The keyboard at time t (s). */
export function keysState(tr: KeysTrack, t: number): KeysState {
  const { notes, maxDur, lo } = indexOf(tr);
  const press = new Array<number>(KEY_COUNT).fill(0);
  const glow: Record<KeysPart, number[]> = { chord: new Array<number>(KEY_COUNT).fill(0), riff: new Array<number>(KEY_COUNT).fill(0) };
  const held: Record<KeysPart, KeysNote[]> = { chord: [], riff: [] };
  let busy = 0, riffLevel = 0;
  const last = lastStart(notes, t);
  for (let i = last; i >= 0 && notes[i].t >= t - maxDur - DRIFT_REACH; i--) {
    const n = notes[i], age = t - n.t, end = n.t + n.dur;
    const part: KeysPart = n.part === "riff" ? "riff" : "chord";
    // the drift: rising while it's held, falling once it's let go
    const upTo = Math.min(age, n.dur);
    const env = (1 - Math.exp(-upTo / DRIFT_UP)) * (t < end ? 1 : Math.exp(-(t - end) / DRIFT_DOWN));
    busy += env;
    if (part === "riff") riffLevel += env;
    if (t >= end + RELEASE) continue;
    const k = foldKey(n.midi, lo);
    const sounding = t < end;
    if (sounding) held[part].push(n);
    const up = sounding ? 1 : 1 - smooth((t - end) / RELEASE);
    press[k] = Math.max(press[k], Math.min(1, age / ATTACK) * up);
    const lit = SUSTAIN + (1 - SUSTAIN) * Math.exp(-Math.min(age, n.dur) / FLASH);
    glow[part][k] = Math.max(glow[part][k], lit * up);
  }

  // the names: what's sounding, or else the last thing that did
  const name = (part: KeysPart): { text: string; live: boolean; midis: number[] } => {
    if (held[part].length) return { text: "", live: true, midis: held[part].map((n) => n.midi) };
    for (let i = last; i >= 0; i--) {
      if (notes[i].part !== part) continue;
      const at = notes[i].t;
      const midis: number[] = [];
      for (let j = i; j >= 0 && notes[j].t >= at - maxDur; j--) if (notes[j].part === part && notes[j].t <= at && at < notes[j].t + notes[j].dur) midis.push(notes[j].midi);
      return { text: "", live: false, midis };
    }
    return { text: "", live: false, midis: [] };
  };
  const ch = name("chord"), rf = name("riff");
  // the riff is a line: its newest note
  const riffMidi = rf.live ? held.riff.reduce((a, b) => (b.t > a.t ? b : a)).midi : rf.midis.length ? rf.midis[0] : null;

  // the waveform: each held note a sine, higher notes more cycles across the screen, drifting by
  const wave = new Array<number>(WAVE_N).fill(0);
  const voices = [...held.chord, ...held.riff];
  if (voices.length) {
    const amp = voices.map((n) => glow[n.part === "riff" ? "riff" : "chord"][foldKey(n.midi, lo)]);
    const sum = amp.reduce((a, b) => a + b, 0);
    for (let j = 0; j < WAVE_N; j++) {
      const x = j / (WAVE_N - 1);
      let y = 0;
      voices.forEach((n, v) => {
        const cycles = 1.5 * 2 ** ((n.midi - 60) / 12);
        y += amp[v] * Math.sin(2 * Math.PI * cycles * (x + 0.35 * t));
      });
      wave[j] = y / Math.max(1, sum);
    }
  }

  return {
    lo,
    press,
    chord: glow.chord,
    riff: glow.riff,
    chordName: chordName(ch.midis),
    chordLive: ch.live,
    riffNote: riffMidi === null ? "" : noteLabel(riffMidi),
    riffLive: rf.live,
    busy,
    riffLevel: 1 - Math.exp(-riffLevel),
    wave,
  };
}

/** whether a key (0..) from the bottom C is a black key */
export const isBlack = (k: number): boolean => [1, 3, 6, 8, 10].includes(k % 12);
