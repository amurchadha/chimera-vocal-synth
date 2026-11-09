import { describe, expect, test } from "bun:test";
// @ts-expect-error plain JS module
import { renderSynth } from "../tools/performance/synth.mjs";
import { maxAbs, peakHz } from "./spectrum";

const SR = 48000;
type Note = { t: number; dur: number; midi: number; vel?: number };
const synth = (notes: Note[], opts: Record<string, unknown> = {}): Float32Array => renderSynth(notes, opts).samples;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

// gaps, a legato overlap (glide), touching notes, a note during another's release, velocities
const RIFF: Note[] = [
  { t: 0.1, dur: 0.2, midi: 45 }, { t: 0.45, dur: 0.25, midi: 48, vel: 0.7 }, { t: 0.65, dur: 0.3, midi: 52 },
  { t: 1.0, dur: 0.2, midi: 50 }, { t: 1.2, dur: 0.2, midi: 57 }, { t: 1.45, dur: 0.15, midi: 55, vel: 0.5 },
  { t: 1.62, dur: 0.6, midi: 60 }, { t: 2.3, dur: 0.4, midi: 43 },
];

/** pitch from the waveform's period (autocorrelation over 40 ms); the lead's sub makes it 2/f */
function leadHz(x: Float32Array, t: number): number {
  const a = Math.round(t * SR), W = 1920;
  let best = -1, lag0 = 0;
  for (let lag = 100; lag < 1000; lag++) {
    let s = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < W; i++) { s += x[a + i] * x[a + i + lag]; e1 += x[a + i] ** 2; e2 += x[a + i + lag] ** 2; }
    const r = s / Math.sqrt(e1 * e2 + 1e-12);
    if (r > best) { best = r; lag0 = lag; }
  }
  return (2 * SR) / lag0;
}

describe("synth", () => {
  test("same input, same samples", () => {
    for (const preset of ["lead", "pluck"]) {
      const a = synth(RIFF, { preset }), b = synth(RIFF, { preset });
      expect(a.length).toBe(b.length);
      expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
    }
  });

  test("a note's pitch is right: the FFT peaks at its frequency", () => {
    for (const preset of ["lead", "pluck"]) {
      for (const midi of [45, 57, 69, 76]) {
        const s = synth([{ t: 0, dur: 1.2, midi }], { preset });
        const f = peakHz(s, SR, Math.round(0.1 * SR), 32768, 40, 3000);
        // the lead's two saws sit +-8 cents off the note; the FFT bin is 1.5 Hz
        expect(Math.abs(cents(f, hz(midi)))).toBeLessThan(20);
      }
    }
  });

  test("no clicks: small sample-to-sample jumps around every note start and end", () => {
    for (const preset of ["lead", "pluck"]) {
      const s = synth(RIFF, { preset });
      expect(s.every(Number.isFinite)).toBe(true);
      for (const n of RIFF) {
        for (const b of [n.t, n.t + n.dur].map((t) => Math.round(t * SR))) {
          let jump = 0;
          for (let i = b - 96; i < b + 96; i++) jump = Math.max(jump, Math.abs(s[i] - s[i - 1]));
          // measured as built: lead 0.031, pluck 0.072 (its bright FM attack); with an instant
          // attack or release instead (a gated note) the same riff jumps lead 0.18-0.22, pluck 0.10
          expect(jump).toBeLessThan(preset === "lead" ? 0.08 : 0.09);
        }
      }
      // from silence, a note starts at ~0: its first 0.1 ms stays tiny
      const first = Math.round(RIFF[0].t * SR);
      expect(maxAbs(s, first, first + 5)).toBeLessThan(0.01);
      // and ends at ~0
      expect(Math.abs(s[s.length - 1])).toBeLessThan(1e-3);
    }
  });

  test("no clipping past +-1, even with many loud notes", () => {
    const chord = [45, 52, 57, 60, 64, 69, 72, 76].map((midi) => ({ t: 0, dur: 1, midi, vel: 1 }));
    expect(maxAbs(synth(chord, { preset: "pluck" }))).toBeLessThanOrEqual(1);
    expect(maxAbs(synth(RIFF, { preset: "lead" }))).toBeLessThan(0.9);
    expect(maxAbs(synth(RIFF, { preset: "pluck" }))).toBeLessThan(0.9);
  });

  test("lead: overlapping notes glide, a note after a gap starts on its pitch", () => {
    const legato = synth([{ t: 0, dur: 0.55, midi: 45 }, { t: 0.5, dur: 0.6, midi: 57 }]);
    const gap = synth([{ t: 0, dur: 0.45, midi: 45 }, { t: 0.5, dur: 0.6, midi: 57 }]);
    // 20 ms into the second note: gliding (between the notes) vs already there
    const mid = leadHz(legato, 0.52);
    expect(mid).toBeGreaterThan(hz(45) * 1.1);
    expect(mid).toBeLessThan(hz(57) * 0.95);
    expect(Math.abs(cents(leadHz(gap, 0.52), hz(57)))).toBeLessThan(25);
    // both arrive
    expect(Math.abs(cents(leadHz(legato, 0.8), hz(57)))).toBeLessThan(25);
  });

  test("an unknown preset is an error", () => {
    expect(() => synth(RIFF, { preset: "theremin" })).toThrow();
  });
});
