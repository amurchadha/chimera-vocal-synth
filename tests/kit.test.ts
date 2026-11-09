import { describe, expect, test } from "bun:test";
// @ts-expect-error plain JS module
import { renderKit } from "../tools/performance/kit.mjs";
import { bandFraction, centroid, maxAbs, rms } from "./spectrum";

const SR = 48000;
type Hit = { t: number; part: string; accent?: boolean };
const kit = (hits: Hit[], opts: Record<string, unknown> = {}): Float32Array => renderKit(hits, opts).samples;
/** one hit at t = 0 */
const one = (part: string, accent = false) => kit([{ t: 0, part, accent }]);
const bytes = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const bitEqual = (a: Float32Array, b: Float32Array) => bytes(a).equals(bytes(b));

// four bars of 16ths at 148 bpm, every part, accents, and stacked hits
const STEP = 15 / 148;
const groove: Hit[] = [];
for (let k = 0; k < 64; k++) {
  const t = k * STEP;
  if (k % 8 === 0 || k % 16 === 10) groove.push({ t, part: "kick", accent: k % 16 === 0 });
  if (k % 8 === 4) groove.push({ t, part: "snare", accent: k % 16 === 12 });
  if (k % 8 === 7) groove.push({ t, part: "ghost" });
  if (k % 2 === 0) groove.push({ t, part: k % 16 === 14 ? "open" : "hats", accent: k % 4 === 0 });
  if (k % 32 === 0) groove.push({ t, part: "crash", accent: true });
}

describe("kit", () => {
  test("same input, same samples; another seed changes the noise", () => {
    const a = kit(groove), b = kit(groove), c = kit(groove, { seed: 2 });
    expect(a.length).toBe(b.length);
    expect(bitEqual(a, b)).toBe(true);
    expect(bitEqual(a, c)).toBe(false);
  });

  test("hit order in the list does not matter", () => {
    expect(bitEqual(kit(groove), kit([...groove].reverse()))).toBe(true);
  });

  test("a hit sounds at its time, not before", () => {
    const s = kit([{ t: 0.25, part: "kick" }]);
    const at = Math.round(0.25 * SR);
    expect(maxAbs(s, 0, at)).toBe(0);
    expect(maxAbs(s, at, at + SR / 1000)).toBeGreaterThan(0.01);
  });

  test("spectral centroids: kick < 200 Hz, snare 1-5 kHz and broadband, hats > 6 kHz", () => {
    const n = Math.round(0.5 * SR);
    const k = one("kick"), s = one("snare"), h = one("hats");
    expect(centroid(k, SR, 0, n)).toBeLessThan(200);
    // the kick's energy sits at 55-120 Hz, above an 808's sub
    expect(bandFraction(k, SR, 0, n, 50, 130)).toBeGreaterThan(0.6);
    expect(bandFraction(k, SR, 0, n, 0, 45)).toBeLessThan(0.05);
    const cs = centroid(s, SR, 0, n);
    expect(cs).toBeGreaterThan(1000);
    expect(cs).toBeLessThan(5000);
    expect(bandFraction(s, SR, 0, n, 150, 500)).toBeGreaterThan(0.08); // the shell
    expect(bandFraction(s, SR, 0, n, 2000, 24000)).toBeGreaterThan(0.3); // the wires
    expect(centroid(h, SR, 0, Math.round(0.2 * SR))).toBeGreaterThan(6000);
    expect(centroid(one("open"), SR, 0, n)).toBeGreaterThan(5000);
    expect(centroid(one("crash"), SR, 0, 2 * SR)).toBeGreaterThan(4000);
  });

  test("an open hat rings until the next closed hat chokes it", () => {
    const open = kit([{ t: 0, part: "open" }], { duration: 1 });
    const choked = kit([{ t: 0, part: "open" }, { t: 0.2, part: "hats" }], { duration: 1 });
    const at = (sec: number) => Math.round(sec * SR);
    // the same up to the closed hat
    expect(bitEqual(open.subarray(0, at(0.2)), choked.subarray(0, at(0.2)))).toBe(true);
    // alone, the open hat still rings at 0.45-0.8 s; choked, it (and the short closed hat) is gone
    expect(rms(open, at(0.45), at(0.8))).toBeGreaterThan(0.002);
    expect(maxAbs(choked, at(0.45), at(0.8))).toBe(0);
    // within 10 ms of the closed hat the open hat's ring is down to the closed hat's level or less
    const closed = kit([{ t: 0.2, part: "hats" }], { duration: 1 });
    expect(rms(choked, at(0.25), at(0.4))).toBeLessThan(2 * rms(closed, at(0.25), at(0.4)) + 1e-4);
  });

  test("a kick or snare does not choke an open hat", () => {
    const open = kit([{ t: 0, part: "open" }], { duration: 1 });
    const withSnare = kit([{ t: 0, part: "open" }, { t: 0.2, part: "snare" }], { duration: 1 });
    const at = (sec: number) => Math.round(sec * SR);
    // after the snare's tail (0.5 s window) the open hat is still there, unchanged
    expect(bitEqual(open.subarray(at(0.75), at(1)), withSnare.subarray(at(0.75), at(1)))).toBe(true);
  });

  test("an accent is louder and brighter", () => {
    const n = Math.round(0.3 * SR);
    for (const part of ["kick", "snare", "hats", "crash"]) {
      const p = one(part), a = one(part, true);
      expect(rms(a, 0, n)).toBeGreaterThan(1.2 * rms(p, 0, n));
      expect(centroid(a, SR, 0, n)).toBeGreaterThan(centroid(p, SR, 0, n));
    }
  });

  test("ghost is the snare, much quieter", () => {
    const n = Math.round(0.3 * SR);
    const ratio = rms(one("ghost"), 0, n) / rms(one("snare"), 0, n);
    expect(ratio).toBeGreaterThan(0.15);
    expect(ratio).toBeLessThan(0.35);
  });

  test("no clipping past +-1, even on stacked accents; finite", () => {
    const s = kit(groove);
    expect(s.every(Number.isFinite)).toBe(true);
    expect(maxAbs(s)).toBeLessThanOrEqual(1);
    const stack = kit(["kick", "snare", "crash", "open", "hats"].map((part) => ({ t: 0.1, part, accent: true })));
    expect(maxAbs(stack)).toBeLessThanOrEqual(1);
    // single hits stay under the soft clip's knee (0.9 is where it starts to bend)
    for (const part of ["kick", "snare", "ghost", "hats", "open", "crash"]) expect(maxAbs(one(part, true))).toBeLessThan(0.95);
  });

  test("a voice cut by `duration` ends without a step", () => {
    const s = kit([{ t: 0, part: "crash" }], { duration: 0.5 });
    expect(s.length).toBe(Math.round(0.5 * SR));
    expect(Math.abs(s[s.length - 1])).toBeLessThan(1e-3);
  });

  test("an unknown part is an error", () => {
    expect(() => kit([{ t: 0, part: "cowbell" }])).toThrow();
  });
});
