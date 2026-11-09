#!/usr/bin/env bun
/**
 * A physically modeled 808 bass drum.
 *
 *   bun tools/performance/808.mjs "<pattern>" <bpm> <out-stem> [--decay s] [--drive d]
 *   import { render808 } from "./808.mjs"   // render808(pattern, bpm, {decay, drive}) -> { samples, track }
 *
 * Pattern: tokens separated by spaces and `|`; one token is one 16th note at <bpm>. `.` or `-`
 * is a rest; `m:NN` is a hit at MIDI note NN (36 = C2 = 65.4 Hz); a trailing `>` accents it
 * (strength 1.3, else 1.0); `~L` after it holds the note for L steps (a long 808: it rings on,
 * fading slowly, until let go, then dies in 0.18 s), e.g. `m:31>~16`. Step k starts at exactly k*60/bpm/4 s; the first hit is at t = 0.
 * The render is the pattern plus a `decay`-second tail.
 *
 * Model: the drum head's fundamental mode as a damped nonlinear oscillator, per sample (48 kHz,
 * semi-implicit Euler):
 *     x'' = -w0^2 (1 + KAPPA x^2) x - (2 s + CD |v|) v + F(t)
 * w0 = 2 pi f(note); KAPPA x^2 is tension modulation (the head stiffens as it bulges, so a hard
 * hit starts sharp and the pitch falls to f(note) as it rings down); s = ln(1000)/decay gives
 * -60 dB in `decay` s once the amplitude is small; CD is air loading that kills big excursions
 * fast, so the glide settles in ~100 ms. F is a 3 ms raised-cosine mallet pulse whose impulse
 * gives a peak excursion of ~accent head units, ADDED to the ringing head (no reset, no clicks).
 * Output = tanh(drive*x) * 0.9 plus a 2 ms beater click that starts at full level on the hit's
 * first sample.
 *
 * Track JSON (100 frames/s; frame k is sampled at t = (k+0.5)/100 s; frames = ceil(len*100/48000)):
 *   { rate: 100, sampleRate: 48000, bpm, decay, drive, duration,
 *     note:   MIDI note of the last hit (0 before the first),
 *     disp:   head displacement at mid-frame, about -1..1 (x / 1.4, clamped),
 *     amp:    envelope of the ringing, sqrt(x^2 + (v/w)^2) / 1.4, 0..1,
 *     hz:     instantaneous pitch f0*sqrt(1 + KAPPA amp^2 / 2) (0 before the first hit),
 *     energy: 0..1, output level (peak-held, ~40 ms release),
 *     hit:    1 on the frame where a hit starts, else 0,
 *     acc:    accent of that hit (1 / 1.3) on hit frames, else 0 }
 */
import { writeFileSync } from "node:fs";

export const SR = 48000;
export const FRAME_RATE = 100;
const KAPPA = 3.4; // tension modulation
const IMP = 1.0; // peak excursion of an unaccented hit, head units
const CD = 0.045; // amplitude-dependent (air loading) damping, per unit velocity
const PULSE = 0.003; // mallet pulse length, s
const CLICK = 0.002; // beater click length, s
const DISP_SCALE = 1.4;

/** a held note loses this much over 4 s (plus the air loading), then dies to -60 dB in RELEASE s */
const HOLD_DB = 2, RELEASE = 0.18;
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** parse the pattern into hits: { step, note, acc } */
export function parsePattern(pattern) {
  const toks = pattern.split(/[\s|]+/).filter(Boolean);
  const hits = [];
  toks.forEach((tok, step) => {
    if (tok === "." || tok === "-") return;
    const m = /^m:(\d+)(>?)(?:~(\d+))?$/.exec(tok);
    if (!m) throw new Error(`808: bad token "${tok}"`);
    hits.push({ step, note: Number(m[1]), acc: m[2] ? 1.3 : 1.0, hold: m[3] ? Number(m[3]) : 0 });
  });
  return { steps: toks.length, hits };
}

export function render808(pattern, bpm, opts = {}) {
  const decay = opts.decay ?? 0.9;
  const drive = opts.drive ?? 1.5;
  const { steps, hits } = parsePattern(pattern);
  const stepSamples = (SR * 60) / bpm / 4;
  const n = Math.round(steps * stepSamples + decay * SR);
  const samples = new Float32Array(n);
  const sigma = Math.log(1000) / decay;
  const dt = 1 / SR;
  const pulseN = Math.round(PULSE * SR), clickN = Math.round(CLICK * SR);
  const fr = SR / FRAME_RATE;

  const frames = Math.ceil(n / fr);
  const z = () => new Array(frames).fill(0);
  const track = {
    rate: FRAME_RATE, sampleRate: SR, bpm, decay, drive, duration: n / SR,
    note: z(), disp: z(), amp: z(), hz: z(), energy: z(), hit: z(), acc: z(),
  };
  const startOf = hits.map((h) => Math.round(h.step * stepSamples));
  // a held note (m:NN~L) rings on for L steps (losing only HOLD_DB) and then is let go in RELEASE s
  const endOf = hits.map((h, k) => (h.hold ? startOf[k] + Math.round(h.hold * stepSamples) : -1));
  const sigmaHold = Math.log(10 ** (HOLD_DB / 20)) / 4, sigmaRelease = Math.log(1000) / RELEASE;
  let holdEnd = -1;
  let x = 0, v = 0, hi = 0, note = 0, w0 = 0, accC = 0, lastStart = -1, rng = 12345, level = 0;
  let active = []; // mallet pulses still pushing: { s, f0 }

  for (let i = 0; i < n; i++) {
    while (hi < hits.length && startOf[hi] <= i) {
      const h = hits[hi], s = startOf[hi];
      hi++;
      note = h.note;
      w0 = 2 * Math.PI * midiHz(note);
      // raised cosine of peak F0 has impulse F0*pulseN*dt/2; a velocity kick of w0*acc gives a
      // peak excursion of ~acc
      active.push({ s, f0: (IMP * h.acc * w0 * 2) / (pulseN * dt) });
      accC = h.acc;
      lastStart = s;
      holdEnd = endOf[hi - 1];
      const fk = Math.min(frames - 1, Math.floor(s / fr));
      track.hit[fk] = 1;
      track.acc[fk] = h.acc;
    }
    let F = 0;
    if (active.length) {
      for (const p of active) {
        const k = i - p.s;
        if (k < pulseN) F += p.f0 * 0.5 * (1 - Math.cos((2 * Math.PI * (k + 0.5)) / pulseN));
      }
      active = active.filter((p) => i - p.s < pulseN - 1);
    }
    if (w0 > 0) {
      const stiff = w0 * w0 * (1 + KAPPA * x * x);
      const damp = holdEnd < 0 ? sigma : i < holdEnd ? sigmaHold : sigmaRelease;
      // once a held note's glide is over (~100 ms), the air loading eases too, so it sustains
      const air = holdEnd >= 0 && i < holdEnd && i - lastStart > 0.1 * SR ? CD * 0.1 : CD;
      const c = Math.min(0.5 / dt, 2 * damp + air * Math.abs(v));
      v += dt * (-stiff * x - c * v + F);
      x += dt * v;
    }
    let click = 0;
    if (lastStart >= 0 && i - lastStart < clickN) {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      const u = (i - lastStart) / clickN;
      click = i === lastStart ? 0.12 * accC : 0.12 * accC * (rng / 2147483648 - 1) * (1 - u) * (1 - u);
    }
    const y = Math.tanh(drive * x) * 0.9 + click;
    samples[i] = y;

    level = Math.max(Math.abs(y), level * 0.9995);
    if (i % fr === fr / 2) {
      const k = (i - fr / 2) / fr;
      const weff = w0 * Math.sqrt(1 + KAPPA * x * x);
      const a = w0 ? Math.sqrt(x * x + (v / weff) ** 2) : 0;
      track.note[k] = note;
      track.disp[k] = Math.max(-1, Math.min(1, x / DISP_SCALE));
      track.amp[k] = Math.min(1, a / DISP_SCALE);
      track.hz[k] = note ? midiHz(note) * Math.sqrt(1 + (KAPPA * a * a) / 2) : 0;
      track.energy[k] = Math.min(1, level);
    }
  }
  const round = (a, d) => a.map((q) => Math.round(q * d) / d);
  track.disp = round(track.disp, 1000);
  track.amp = round(track.amp, 1000);
  track.hz = round(track.hz, 100);
  track.energy = round(track.energy, 1000);
  return { samples, track };
}

export function wavBytes(samples, sr = SR) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name, d) => {
    const i = args.indexOf(name);
    if (i < 0) return d;
    const v = Number(args[i + 1]);
    args.splice(i, 2);
    return v;
  };
  const decay = flag("--decay", 0.9), drive = flag("--drive", 1.5);
  const [pattern, bpmS, stem] = args;
  if (!pattern || !bpmS || !stem) {
    console.error('usage: bun tools/performance/808.mjs "<pattern>" <bpm> <out-stem> [--decay s] [--drive d]');
    process.exit(2);
  }
  const { samples, track } = render808(pattern, Number(bpmS), { decay, drive });
  writeFileSync(`${stem}.wav`, wavBytes(samples));
  writeFileSync(`${stem}.json`, JSON.stringify(track));
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  console.log(`808: ${(samples.length / SR).toFixed(2)} s, ${track.hit.reduce((a, b) => a + b, 0)} hits, peak ${peak.toFixed(3)} -> ${stem}.wav/.json`);
}
