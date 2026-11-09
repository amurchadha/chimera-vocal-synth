import { describe, expect, test } from "bun:test";
import { BEATER_REST, HAT_REST, kitPose, type KitTrack } from "../src/show/kit.ts";

const kit = (hits: KitTrack["hits"]): KitTrack => ({ hits });

describe("drum kit pose", () => {
  test("a frame is a pure function of the time: the same t gives the same pose in any order", () => {
    const k = kit([{ t: 0, part: "crash", accent: true }, { t: 0.2, part: "kick" }, { t: 0.4, part: "snare" }, { t: 0.5, part: "hats" }, { t: 0.7, part: "open" }]);
    const ts = [0.73, 0.1, 0.45, 0.21, 0.73, 2, 0.1];
    const first = ts.map((t) => JSON.stringify(kitPose(k, t)));
    const again = [...ts].reverse().map((t) => JSON.stringify(kitPose(kit(k.hits), t))).reverse();
    expect(again).toEqual(first);
    expect(first[0]).toBe(first[4]);
  });

  test("no hits yet: the kit at rest", () => {
    const p = kitPose(kit([{ t: 1, part: "kick" }]), 0.2);
    expect(p.beater).toBe(BEATER_REST);
    expect(p.kickFlex).toBe(0);
    expect(p.hatGap).toBeCloseTo(HAT_REST, 6);
    expect(p.glow).toEqual({ kick: 0, snare: 0, hats: 0, crash: 0 });
  });

  test("the beater swings in to the head at the hit and falls back after", () => {
    const k = kit([{ t: 1, part: "kick" }]);
    expect(kitPose(k, 0.95).beater).toBeLessThan(BEATER_REST);
    expect(kitPose(k, 1).beater).toBeCloseTo(0, 6);
    expect(kitPose(k, 1.03).beater).toBeGreaterThan(0.2 * BEATER_REST);
    expect(kitPose(k, 1.5).beater).toBeGreaterThan(0.99 * BEATER_REST);
    expect(kitPose(k, 1.01).kickFlex).toBeGreaterThan(0.5);
  });

  test("a closed hat shuts the pair at the hit; an open one stays apart until the next closed hit", () => {
    const k = kit([{ t: 1, part: "hats" }, { t: 2, part: "open" }, { t: 3, part: "hats" }]);
    expect(kitPose(k, 1).hatGap).toBeCloseTo(0, 6);
    expect(kitPose(k, 1.02).hatGap).toBeCloseTo(0, 6);
    expect(kitPose(k, 1.6).hatGap).toBeCloseTo(HAT_REST, 2);
    expect(kitPose(k, 2.2).hatGap).toBeGreaterThan(0.95);
    expect(kitPose(k, 2.9).hatGap).toBeGreaterThan(0.95);
    expect(kitPose(k, 3).hatGap).toBeCloseTo(0, 6);
  });

  test("an accent is bigger than a plain hit, and a ghost is quieter", () => {
    const at = (part: "snare" | "ghost" | "crash", accent: boolean, dt: number) => kitPose(kit([{ t: 1, part, accent }]), 1 + dt);
    expect(at("snare", true, 0.02).glow.snare).toBeGreaterThan(at("snare", false, 0.02).glow.snare);
    expect(at("ghost", false, 0.02).glow.snare).toBeLessThan(0.5 * at("snare", false, 0.02).glow.snare);
    expect(at("ghost", false, 0.02).snare[0].amp).toBeLessThan(at("snare", false, 0.02).snare[0].amp);
    expect(Math.abs(at("crash", true, 0.1).crashTilt[0])).toBeGreaterThan(Math.abs(at("crash", false, 0.1).crashTilt[0]));
  });

  test("the crash starts rocking from level and dies away", () => {
    const k = kit([{ t: 1, part: "crash" }]);
    expect(kitPose(k, 1).crashTilt[0]).toBeCloseTo(0, 6);
    expect(Math.abs(kitPose(k, 1.1).crashTilt[0])).toBeGreaterThan(0.05);
    expect(Math.abs(kitPose(k, 4.5).crashTilt[0])).toBe(0);
  });
});
