#!/usr/bin/env bun
/**
 * A lead synth for a melodic riff, and a pluck. Synthesized, no samples.
 *
 *   bun tools/performance/synth.mjs notes.json out.wav [--preset lead|pluck] [--duration s]
 *   import { renderSynth } from "./synth.mjs"   // renderSynth(notes, { duration?, sampleRate = 48000, preset = "lead" }) -> { samples }
 *
 * notes: [{ t: seconds, dur: seconds, midi, vel?: 0..1 (default 1) }] (notes.json is that array,
 * or { notes: [...] }). Mono, deterministic (no randomness). The render is `duration` seconds,
 * or by default until the last note's release has died away.
 *
 * "lead" (monophonic, last note wins):
 * - two band-limited (PolyBLEP) saws detuned +-DETUNE cents and a sine an octave below; the
 *   oscillators run freely from t = 0, so a note never resets a phase;
 * - a resonant lowpass (Zavalishin TPT state-variable filter, stable under modulation) whose
 *   cutoff sits CUTOFF octaves over the note and opens ENV_OCT more on the filter envelope
 *   (scaled by velocity); the cutoff is smoothed (1 ms) in log frequency;
 * - amp and filter ADSRs that are continuous: the attack ramps from wherever the level is, the
 *   decay and release are exponential;
 * - glide: a note that starts while another is held (they overlap) takes over without
 *   retriggering the envelopes, and the pitch slides there (GLIDE s time constant, in log
 *   frequency); a note after a gap retriggers and starts on its own pitch.
 * "pluck" (polyphonic): per note a sine carrier phase-modulated at 3.5x its frequency (the
 * inharmonic sidebands make it bell-ish) with a fast-falling index, plus a quieter octave;
 * a 2 ms raised-cosine attack, an exponential decay, and a 40 ms release after `dur`.
 * Output goes through the kit's soft clip (identity below 0.9, never past 1).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { wavBytes, midiHz } from "./808.mjs";
import { softClip } from "./kit.mjs";

export const PRESETS = {
  lead: {
    detune: 8, sub: 0.25, cutoff: 1.0, envOct: 3.5, q: 2.2, glide: 0.045, gain: 0.32,
    amp: { a: 0.005, d: 0.25, s: 0.75, r: 0.12 },
    filt: { a: 0.003, d: 0.35, s: 0.25, r: 0.15 },
  },
  pluck: { ratio: 3.5, index: 2.6, indexTau: 0.05, octave: 0.18, attack: 0.002, decay: 0.32, release: 0.04, gain: 0.3 },
};

/** PolyBLEP residual for a saw at phase p (0..1) with increment dt */
function blep(p, dt) {
  if (p < dt) { const x = p / dt; return x + x - x * x - 1; }
  if (p > 1 - dt) { const x = (p - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

/** ADSR with continuous output: attack ramps from the current level; decay/release exponential */
function adsr({ a, d, s, r }, sr) {
  const atk = 1 / Math.max(1, a * sr), kd = 1 - Math.exp(-4 / (d * sr)), kr = 1 - Math.exp(-4 / (r * sr));
  let level = 0, stage = 0; // 0 idle, 1 attack, 2 decay/sustain, 3 release
  return {
    on() { stage = 1; },
    off() { if (stage) stage = 3; },
    next() {
      if (stage === 1) { level += atk; if (level >= 1) { level = 1; stage = 2; } }
      else if (stage === 2) level += (s - level) * kd;
      else if (stage === 3) { level -= level * kr; if (level < 1e-7) { level = 0; stage = 0; } }
      return level;
    },
    get idle() { return stage === 0; },
  };
}

function renderLead(notes, out, sr) {
  const P = PRESETS.lead;
  const ampEnv = adsr(P.amp, sr), filtEnv = adsr(P.filt, sr);
  const dUp = 2 ** (P.detune / 1200), dDn = 1 / dUp;
  // note events in sample time; offs before ons at the same sample (touching notes do not glide)
  const ev = [];
  notes.forEach((n, k) => {
    const s = Math.round(n.t * sr), e = Math.max(s + 1, Math.round((n.t + n.dur) * sr));
    ev.push({ i: s, on: true, k }, { i: e, on: false, k });
  });
  ev.sort((a, b) => a.i - b.i || (a.on === b.on ? a.k - b.k : a.on ? 1 : -1));
  const held = []; // note indices, in the order they started
  let ei = 0, cur = -1;
  let logF = Math.log(midiHz(notes.length ? notes[0].midi : 60)), logTarget = logF;
  let vel = notes.length ? notes[0].vel ?? 1 : 1, velTarget = vel;
  let logCut = logF + P.cutoff * Math.LN2;
  let p1 = 0, p2 = 0.37, ps = 0, ic1 = 0, ic2 = 0;
  const kGlide = 1 - Math.exp(-1 / (P.glide * sr)), kSmooth = 1 - Math.exp(-1 / (0.001 * sr));
  const kVel = 1 - Math.exp(-1 / (0.005 * sr)), k = 1 / P.q;
  for (let i = 0; i < out.length; i++) {
    while (ei < ev.length && ev[ei].i <= i) {
      const e = ev[ei++];
      if (e.on) {
        const n = notes[e.k];
        const legato = held.length > 0;
        held.push(e.k);
        logTarget = Math.log(midiHz(n.midi));
        velTarget = n.vel ?? 1;
        if (!legato) {
          // a new phrase: start on pitch, retrigger both envelopes from where they are
          logF = logTarget;
          if (ampEnv.idle) vel = velTarget;
          ampEnv.on(); filtEnv.on();
        }
        cur = e.k;
      } else {
        const j = held.indexOf(e.k);
        if (j >= 0) held.splice(j, 1);
        if (e.k === cur) {
          if (held.length) {
            // back to the latest note still held: glide, no retrigger
            cur = held[held.length - 1];
            logTarget = Math.log(midiHz(notes[cur].midi));
            velTarget = notes[cur].vel ?? 1;
          } else { ampEnv.off(); filtEnv.off(); }
        }
      }
    }
    logF += (logTarget - logF) * kGlide;
    vel += (velTarget - vel) * kVel;
    const f = Math.exp(logF);
    const a = ampEnv.next(), fe = filtEnv.next();
    // oscillators: free-running PolyBLEP saws and the sub sine
    const dt1 = (f * dUp) / sr, dt2 = (f * dDn) / sr;
    const saw = (2 * p1 - 1 - blep(p1, dt1) + 2 * p2 - 1 - blep(p2, dt2)) * 0.5;
    const x = saw + P.sub * Math.sin(2 * Math.PI * ps);
    p1 += dt1; if (p1 >= 1) p1 -= 1;
    p2 += dt2; if (p2 >= 1) p2 -= 1;
    ps += f / 2 / sr; if (ps >= 1) ps -= 1;
    // filter: cutoff in log frequency, smoothed; TPT SVF lowpass
    const target = logF + (P.cutoff + P.envOct * fe * (0.4 + 0.6 * vel)) * Math.LN2;
    logCut += (target - logCut) * kSmooth;
    const fc = Math.min(0.45 * sr, Math.max(20, Math.exp(logCut)));
    const g = Math.tan((Math.PI * fc) / sr), a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    out[i] = P.gain * v2 * a * vel;
  }
}

function renderPluck(notes, out, sr) {
  const P = PRESETS.pluck;
  const atkN = Math.max(1, Math.round(P.attack * sr));
  for (const n of notes) {
    const s = Math.round(n.t * sr), off = Math.max(s + 1, Math.round((n.t + n.dur) * sr));
    const f = midiHz(n.midi), v = n.vel ?? 1, g = P.gain * v;
    const wc = (2 * Math.PI * f) / sr, wm = wc * P.ratio;
    const kRel = Math.exp(-1 / (P.release * sr));
    let rel = 1;
    for (let i = s; i < out.length; i++) {
      const k = i - s, t = k / sr;
      if (i >= off) { rel *= kRel; }
      const env = (k < atkN ? 0.5 - 0.5 * Math.cos((Math.PI * k) / atkN) : 1) * Math.exp(-t / P.decay) * rel;
      if (env < 1e-6 && k > atkN) break;
      const I = P.index * (0.5 + 0.5 * v) * Math.exp(-t / P.indexTau);
      const y = Math.sin(wc * k + I * Math.sin(wm * k)) + P.octave * Math.sin(2 * wc * k) * Math.exp(-t / (P.decay / 2));
      out[i] += g * env * y;
    }
  }
}

export function renderSynth(notes, opts = {}) {
  const sr = opts.sampleRate ?? 48000, preset = opts.preset ?? "lead";
  if (!PRESETS[preset]) throw new Error(`synth: unknown preset "${preset}"`);
  const list = notes.map((n, k) => ({ ...n, k })).sort((a, b) => a.t - b.t || a.k - b.k);
  for (const n of list) {
    if (!(n.t >= 0) || !(n.dur > 0) || !Number.isFinite(n.midi)) throw new Error(`synth: bad note ${JSON.stringify(n)}`);
  }
  const P = PRESETS[preset];
  // the lead's release reaches -100 dB in ~2.9 r; a pluck dies on its decay or 15 releases after dur
  const end = list.reduce((m, n) => Math.max(m, preset === "lead"
    ? n.t + n.dur + 3 * P.amp.r
    : n.t + Math.min(P.decay * 14, n.dur + P.release * 15)), 0);
  const n = Math.max(0, Math.round((opts.duration ?? end) * sr));
  const out = new Float32Array(n);
  if (preset === "lead") renderLead(list, out, sr);
  else renderPluck(list, out, sr);
  for (let i = 0; i < n; i++) out[i] = softClip(out[i]);
  return { samples: out };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const take = (name, d) => {
    const i = args.indexOf(name);
    if (i < 0) return d;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const preset = take("--preset", "lead"), duration = take("--duration", undefined);
  const [inPath, outPath] = args;
  if (!inPath || !outPath) {
    console.error("usage: bun tools/performance/synth.mjs notes.json out.wav [--preset lead|pluck] [--duration s]");
    process.exit(2);
  }
  const j = JSON.parse(readFileSync(inPath, "utf8"));
  const notes = Array.isArray(j) ? j : j.notes;
  const { samples } = renderSynth(notes, { preset, duration: duration === undefined ? undefined : Number(duration) });
  writeFileSync(outPath, wavBytes(samples, 48000));
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  console.log(`synth (${preset}): ${(samples.length / 48000).toFixed(2)} s, ${notes.length} notes, peak ${peak.toFixed(3)} -> ${outPath}`);
}
