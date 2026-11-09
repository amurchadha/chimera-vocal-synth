import { describe, expect, test } from "bun:test";
import { KEY_COUNT, RELEASE, chordName, foldKey, keyRange, keysState, noteLabel, type KeysNote, type KeysTrack } from "../src/show/keys.ts";

const note = (t: number, dur: number, midi: number, part: "chord" | "riff" = "chord"): KeysNote => ({ t, dur, midi, part });
const keys = (notes: KeysNote[]): KeysTrack => ({ notes });

describe("synth keyboard state", () => {
  test("the three octaves: the C that puts every note on a key, the notes nearest the middle", () => {
    expect(keyRange([note(0, 1, 62), note(0, 1, 80)])).toBe(48); // C3..C6: 62..80 sit around 66, the middle
    expect(keyRange([note(0, 1, 72), note(0, 1, 100)])).toBe(72);
    expect(keyRange([])).toBe(48);
    // wider than three octaves: the C with the most notes on a key, the rest folded in by octaves
    const wide = [24, 60, 62, 64, 65, 67, 90].map((m) => note(0, 1, m));
    const lo = keyRange(wide);
    expect(lo).toBe(60); // C4..C7 holds all but 24
    expect(foldKey(24, lo)).toBe(0);
    expect(foldKey(90, lo)).toBe(30);
    for (const m of [0, 30, 127]) expect(foldKey(m, lo)).toBeGreaterThanOrEqual(0), expect(foldKey(m, lo)).toBeLessThan(KEY_COUNT);
  });

  test("a key goes down while its note sounds and comes back up over the release", () => {
    const k = keys([note(1, 0.5, 60)]);
    const key = 60 - keysState(k, 0).lo;
    expect(keysState(k, 0.99).press[key]).toBe(0);
    expect(keysState(k, 1.2).press[key]).toBe(1);
    expect(keysState(k, 1.5 + RELEASE / 2).press[key]).toBeCloseTo(0.5, 6);
    expect(keysState(k, 1.5 + RELEASE).press[key]).toBe(0);
    // a chord struck again as the last one ends barely lifts
    const again = keys([note(1, 0.5, 60), note(1.5, 0.5, 60)]);
    expect(keysState(again, 1.505).press[key]).toBeGreaterThan(0.95);
  });

  test("each part glows in its own colour; a key both play glows in both", () => {
    const k = keys([note(0, 1, 67), note(0, 1, 70), note(0, 1, 74), note(0.2, 0.3, 74, "riff"), note(0.2, 0.3, 62, "riff")]);
    const s = keysState(k, 0.3), at = (m: number) => m - s.lo;
    expect(s.chord[at(67)]).toBeGreaterThan(0.5);
    expect(s.riff[at(67)]).toBe(0);
    expect(s.riff[at(62)]).toBeGreaterThan(0.5);
    expect(s.chord[at(62)]).toBe(0);
    expect(s.chord[at(74)]).toBeGreaterThan(0.5);
    expect(s.riff[at(74)]).toBeGreaterThan(0.5);
    // a strike is brightest as it lands, then settles
    expect(keysState(k, 0.01).chord[at(67)]).toBeGreaterThan(keysState(k, 0.8).chord[at(67)]);
  });

  test("the chord is named from the notes sounding, and stays (dimmed) until the next", () => {
    expect(chordName([67, 70, 74])).toBe("Gm");
    expect(chordName([62, 66, 69])).toBe("D");
    expect(chordName([64, 67, 72])).toBe("C/E");
    expect(chordName([60, 64, 70])).toBe("C7"); // no fifth
    expect(chordName([61, 64, 68])).toBe("C#m");
    expect(chordName([63, 66, 70])).toBe("Ebm");
    expect(chordName([])).toBe("");
    const k = keys([note(1, 1, 67), note(1, 1, 70), note(1, 1, 74), note(1.5, 0.25, 62, "riff")]);
    expect(keysState(k, 0.5).chordName).toBe("");
    expect([keysState(k, 1.5).chordName, keysState(k, 1.5).chordLive]).toEqual(["Gm", true]);
    expect([keysState(k, 3).chordName, keysState(k, 3).chordLive]).toEqual(["Gm", false]);
    expect([keysState(k, 1.6).riffNote, keysState(k, 1.6).riffLive]).toEqual(["D4", true]);
    expect(noteLabel(70)).toBe("Bb4");
  });

  test("the knobs drift with how much is sounding; the mod wheel's level with the riff", () => {
    const k = keys([note(0, 2, 60), note(0, 2, 64), note(0, 2, 67), note(1, 1, 72, "riff")]);
    expect(keysState(k, 0.9).busy).toBeGreaterThan(keysState(k, 0.2).busy);
    expect(keysState(k, 3).busy).toBeLessThan(keysState(k, 1.9).busy);
    expect(keysState(k, 0.9).riffLevel).toBe(0);
    expect(keysState(k, 1.6).riffLevel).toBeGreaterThan(0.3);
  });

  test("a frame is a pure function of the time", () => {
    const notes = [note(0.2, 0.8, 67), note(0.2, 0.8, 70), note(0.6, 0.2, 62, "riff"), note(1, 0.8, 62), note(1.1, 0.4, 74, "riff")];
    const k = keys(notes);
    const a = [0.65, 1.3, 0.05, 0.65].map((t) => JSON.stringify(keysState(k, t)));
    expect(a[0]).toBe(a[3]);
    // the order of the file's notes doesn't matter
    expect(JSON.stringify(keysState(keys([...notes].reverse()), 0.65))).toBe(a[0]);
  });
});
