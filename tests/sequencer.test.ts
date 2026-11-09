import { describe, expect, test } from "bun:test";
// @ts-expect-error plain JS module
import { render808 } from "../tools/performance/808.mjs";
import { machineState, type Track808 } from "../src/show/sequencer.ts";
import { GHOST, type KitTrack } from "../src/show/kit.ts";

const BPM = 120, STEP = 15 / BPM;
const BAR = "m:36> . . . | . . m:36 . | . . . . | . . . .";
const track = (): Track808 => render808(`${BAR} | ${BAR}`, BPM).track;
const at = (k: number) => k * STEP;
const kit: KitTrack = {
  hits: [
    { t: at(0), part: "kick", accent: true },
    { t: at(6) - 0.008, part: "kick" }, // a little early: still step 6
    { t: at(4), part: "snare" },
    { t: at(7), part: "ghost" },
    { t: at(2), part: "hats" },
    { t: at(14), part: "open" },
    { t: at(16 + 4), part: "snare" },
  ],
};

describe("drum machine state", () => {
  test("the step clock: a 16th is 15/bpm s from t = 0, sixteen to a bar", () => {
    const tr = track();
    expect(machineState(tr, undefined, 0).step).toBe(0);
    expect(machineState(tr, undefined, at(5.5)).step).toBe(5);
    const s = machineState(tr, undefined, at(17.2));
    expect([s.bar, s.step]).toEqual([1, 1]);
    const before = machineState(tr, undefined, -0.3);
    expect([before.step, before.running]).toEqual([-1, false]);
    expect([0, 4, 8, 12].map((k) => machineState(tr, undefined, at(k + 0.3)).beat)).toEqual([true, true, true, true]);
    expect(machineState(tr, undefined, at(5.3)).beat).toBe(false);
  });

  test("the bass row is the track's own hits; without a kit the other rows stay dark", () => {
    const s = machineState(track(), undefined, at(3));
    expect(s.grid.bass[0]).toBeCloseTo(1.3, 6);
    expect(s.grid.bass[6]).toBe(1);
    expect(s.grid.bass.filter((v) => v > 0).length).toBe(2);
    expect([...s.grid.kick, ...s.grid.snare, ...s.grid.hats].every((v) => v === 0)).toBe(true);
  });

  test("the kit's rows: each hit on its nearest step, accents and ghosts kept, open hats marked", () => {
    const s = machineState(track(), kit, at(1));
    expect(s.grid.kick[0]).toBeGreaterThan(1);
    expect(s.grid.kick[6]).toBe(1);
    expect(s.grid.snare[4]).toBe(1);
    expect(s.grid.snare[7]).toBe(GHOST);
    expect(s.grid.hats[2]).toBe(1);
    expect(s.open[14]).toBe(true);
    expect(s.open[2]).toBe(false);
    // the next bar's pattern is the next bar's
    const next = machineState(track(), kit, at(16.5));
    expect(next.grid.snare[4]).toBe(1);
    expect(next.grid.kick.every((v) => v === 0)).toBe(true);
  });

  test("a step flashes as it plays, kick first where kick and bass land together, and dies away", () => {
    const tr = track();
    const s = machineState(tr, kit, at(6));
    expect(s.fired[6]).toEqual(["kick", "bass"]);
    expect(s.flash[6]).toBeCloseTo(1, 6);
    expect(s.flash[7]).toBe(0); // not played yet
    expect(s.flash[5]).toBe(0); // nothing on it
    expect(s.flash[4]).toBeGreaterThan(0);
    expect(s.flash[4]).toBeLessThan(s.flash[6]);
    expect(machineState(tr, kit, at(6) + 0.3).flash[6]).toBeLessThan(0.2);
  });

  test("a frame is a pure function of the time", () => {
    const tr = track();
    const ts = [at(6.1), 0.05, at(20), at(6.1)];
    const a = ts.map((t) => JSON.stringify(machineState(tr, kit, t)));
    expect(a[0]).toBe(a[3]);
    expect(JSON.stringify(machineState(track(), { hits: [...kit.hits] }, at(6.1)))).toBe(a[0]);
  });
});
