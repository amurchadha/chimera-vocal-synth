import { describe, expect, test } from "bun:test";
// @ts-expect-error plain JS module
import { render808, midiHz, SR } from "../tools/performance/808.mjs";

const STEP74 = 60 / 74 / 4;
const peakIn = (s: Float32Array, a: number, b: number) => {
  let p = 0;
  for (let i = Math.floor(a * SR); i < Math.min(s.length, Math.floor(b * SR)); i++) p = Math.max(p, Math.abs(s[i]));
  return p;
};
const maxAbs = (s: ArrayLike<number>) => {
  let p = 0;
  for (let i = 0; i < s.length; i++) p = Math.max(p, Math.abs(s[i]));
  return p;
};

describe("808", () => {
  test("the first hit sounds at t = 0", () => {
    const { samples } = render808("m:36 . . .", 120);
    let first = -1;
    for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > 0.01) { first = i; break; }
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first / SR).toBeLessThan(0.001);
  });

  test("rests are silent", () => {
    const { samples, track } = render808(". - | . .", 120);
    expect(maxAbs(samples)).toBe(0);
    expect(track.hit.every((h: number) => h === 0)).toBe(true);
  });

  test("pitch falls from above the note to within 3% of it", () => {
    const { track } = render808("m:36 . . . | . . . . | . . . . | . . . . | . . . .", 74);
    const f0 = midiHz(36);
    expect(track.hz[0]).toBeGreaterThan(track.hz[30]);
    expect(track.hz[0] / f0).toBeGreaterThan(1.3);
    expect(track.hz[0] / f0).toBeLessThan(1.7);
    expect(Math.abs(track.hz[30] / f0 - 1)).toBeLessThan(0.03);
  });

  test("the audio pitch falls too (zero-crossing periods)", () => {
    const { samples } = render808("m:36 . . . . . . . . . . . . . . .", 74, { drive: 1 });
    const period = (t0: number) => {
      let i = Math.floor(t0 * SR);
      while (!(samples[i] < 0 && samples[i + 1] >= 0)) i++;
      let j = i + 1;
      while (!(samples[j] < 0 && samples[j + 1] >= 0)) j++;
      return j - i;
    };
    expect(period(0.02)).toBeLessThan(period(0.4));
  });

  test("an accented hit is louder than a plain one", () => {
    const { samples } = render808("m:36> . . . | . . . . | . . . . | m:36 . . .", 74);
    expect(peakIn(samples, 0, 0.1)).toBeGreaterThan(peakIn(samples, 12 * STEP74, 12 * STEP74 + 0.1));
  });

  test("16 accented hits in a row: finite, bounded, deterministic", () => {
    const pat = Array(16).fill("m:34>").join(" ");
    const a = render808(pat, 120), b = render808(pat, 120);
    expect(a.samples.every(Number.isFinite)).toBe(true);
    expect(a.track.disp.every(Number.isFinite)).toBe(true);
    expect(maxAbs(a.samples)).toBeLessThanOrEqual(1.1);
    expect(Buffer.from(a.samples.buffer).equals(Buffer.from(b.samples.buffer))).toBe(true);
    expect(JSON.stringify(a.track)).toBe(JSON.stringify(b.track));
  });

  test("track frames match the length; hits land on their frames", () => {
    const { samples, track } = render808("m:36 . m:39 .", 100, { decay: 0.5 });
    const frames = Math.ceil((samples.length * 100) / SR);
    for (const k of ["note", "disp", "hz", "energy", "hit", "amp"]) expect(track[k].length).toBe(frames);
    const stepSec = 60 / 100 / 4;
    expect(track.hit[0]).toBe(1);
    expect(track.hit[Math.floor(2 * stepSec * 100)]).toBe(1);
  });
});
