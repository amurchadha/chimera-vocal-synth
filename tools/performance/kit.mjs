#!/usr/bin/env bun
/**
 * A modeled drum kit: kick, snare (and its ghost), closed and open hi-hat, crash. Synthesized
 * from models, no samples.
 *
 *   bun tools/performance/kit.mjs hits.json out.wav [--seed n] [--duration s]
 *   import { renderKit } from "./kit.mjs"   // renderKit(hits, { duration?, sampleRate = 48000, seed = 1 }) -> { samples }
 *
 * hits: [{ t: seconds, part: "kick" | "snare" | "ghost" | "hats" | "open" | "crash", accent?: boolean }]
 * (hits.json is that array, or { hits: [...] }). Mono. The render is `duration` seconds, or by
 * default until the last hit's tail has died away. Deterministic: every hit draws its noise and
 * its metal's phases from its own seeded generator (seed, index of the hit in time order, simultaneous
 * hits ordered by part, then accent), so the order of the list never matters.
 *
 * Models (t = seconds since the hit; every voice starts from silence on the hit's first sample
 * and fades out over its window's last 30 ms, so nothing steps):
 * - kick: the batter head's fundamental membrane mode, a sine whose frequency falls from
 *   f0 (1 + sweep) to f0 = 60 Hz with time constant tauP (the head's tension relaxing as the
 *   hit's excursion dies), amplitude exp(-(t/tau)^shape); the head's next six modes at the
 *   circular membrane's Bessel-zero ratios (1.59 ... 3.16 f0), shorter; a tanh drive; and the
 *   beater click, band-passed noise of ~1 ms that carries the attack (peak ~9 dB over the
 *   first 100 ms' RMS; the reference kick's ~12). Energy at 55-120 Hz, above the 808's sub;
 *   centroid < 200 Hz.
 * - snare: three head/shell modes (186, 296, 342 Hz) with a small pitch drop, plus the snare
 *   wires: noise band-passed (2nd-order high- and low-pass) that buzzes only while the head
 *   moves them past a contact threshold, so it stops at ~90 ms instead of fading forever; plus
 *   a sub-ms stick crack. ghost = the same model 12 dB down and darker.
 * - hats: six inharmonic partials (base x sqrt(1, 2, 3, 5, 7, 11)) ring-modulated in two
 *   groups of three (the metal), plus noise; 4th-order high-pass; a 2-stage decay (a strike
 *   transient, then the body). open = the same, longer; the next hi-hat hit after it (closed
 *   or open) chokes it: a 6 ms raised-cosine fade from that hit's first sample.
 * - crash: twelve inharmonic partials ring-modulated in pairs, plus noise in two bands, the
 *   high band dying faster than the low one, swelling in over ~10 ms; a long wash.
 * - accent: louder (gain x ACCENT.gain) and brighter (filter corners x ACCENT.bright, more click,
 *   pitch sweep and crash high band).
 * The kit's output goes through a soft clip that is the identity below 0.9 and never exceeds 1;
 * the part gains keep single hits under it (an accented snare, the loudest, peaks at ~0.91).
 *
 * Tuned toward a reference song's separated drums (private; read, never stored): average
 * 1/3-octave band shape over each hit's first 120 ms, decay of the band envelope, crest factor,
 * and the parts' relative levels. The commit that tuned it gives the numbers.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { wavBytes } from "./808.mjs";

export const PARTS = ["kick", "snare", "ghost", "hats", "open", "crash"];

/** model parameters (exported so a tuning script can read them; treat as constants) */
export const KIT = {
  kick: {
    f0: 60, sweep: 13, tauP: 0.01, tau: 0.134, shape: 2.29,
    // membrane modes above the fundamental: Bessel-zero ratios of a circular membrane
    modes: { amp: 0.7, tau: 0.1, upper: 0.24, upperTau: 0.052 },
    drive: 2, gain: 0.21,
    click: { amp: 2.95, tau: 0.00127, hp: 800, lp: 12000 },
    tail: 1.0,
  },
  snare: {
    modes: [[186, 0.59, 0.054], [296, 1.21, 0.01], [342, 0.35, 0.0107]], drop: 0.05, tauP: 0.008,
    body: 0.65, wires: 0.75, wiresTau: 0.046, contact: 0.04, wiresAttack: 0.0007, hp: 300, lp: 8900,
    crack: 0.3, crackTau: 0.0006, crackHp: 300, gain: 0.33, tail: 0.5,
  },
  ghost: { gain: 0.25, bright: 0.75 },
  hats: {
    base: 6930, metal: 0.48, noise: 0.54, hp: 2000, lp: 13500, hit: 0.27, hitTau: 0.0071,
    tau: 0.0203, gain: 0.125, tail: 0.25,
  },
  open: { tau: 0.3, hp: 1800, gain: 0.12, tail: 2.5 },
  crash: {
    base: 1900, metal: 0.45, noise: 0.8, hp: 2600, lpHi: 14000, split: 6500,
    tauLo: 0.9, tauHi: 0.38, bloom: 0.012, gain: 0.31, tail: 7,
  },
};
const ACCENT = { gain: 1.35, bright: 1.25 };
const CHOKE = 0.006; // s
const END_FADE = 0.03; // s, every voice's window ends in a raised-cosine fade

/** 1 inside the window, a raised-cosine fade over its last END_FADE s */
const endFade = (i, end, sr) => {
  const k = end - i, F = END_FADE * sr;
  return k >= F ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * k) / F);
};
const MEMBRANE = [1.594, 2.136, 2.296, 2.653, 2.918, 3.156]; // (1,1) (2,1) (0,2) (3,1) (1,2) (4,1) over (0,1)
const SQRTS = [1, Math.SQRT2, Math.sqrt(3), Math.sqrt(5), Math.sqrt(7), Math.sqrt(11)];
const CRASH_RATIOS = [1, 1.37, 1.79, 2.11, 2.52, 2.89, 3.31, 3.68, 4.13, 4.56, 4.97, 5.43];

/** mulberry32: a float in [-1, 1) per call */
function rng32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}
const hitSeed = (seed, i) => (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca77)) >>> 0;

/** RBJ biquad, 2nd order: "lp" | "hp" | "bp" (constant 0 dB peak) */
function biquad(type, f, q, sr) {
  const w = (2 * Math.PI * Math.min(f, 0.45 * sr)) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, A1 = (-2 * c) / a0, A2 = (1 - al) / a0;
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// ---- voices: each adds its hit into out[s .. end) ----

function kick(out, s, end, sr, acc, rnd) {
  const P = KIT.kick, M = P.modes, g = P.gain * (acc ? ACCENT.gain : 1), b = acc ? ACCENT.bright : 1;
  const sweep = P.sweep * b, drive = P.drive * (acc ? 1.15 : 1), norm = 1 / Math.tanh(drive);
  const hp = biquad("hp", P.click.hp * b, 0.7, sr), lp = biquad("lp", P.click.lp * b, 0.7, sr);
  const clickAmp = P.click.amp * (acc ? 1.2 : 1), clickN = 12 * P.click.tau;
  // mode amplitudes and decays: (1,1) at M.amp / M.tau; the rest M.upper, falling 0.7x per mode
  const amps = MEMBRANE.map((_, k) => (k === 0 ? M.amp : M.upper * 0.7 ** (k - 1)));
  const taus = MEMBRANE.map((_, k) => (k === 0 ? M.tau : M.upperTau));
  const ph = [0, ...MEMBRANE.map(() => 0)];
  for (let i = s; i < end; i++) {
    const t = (i - s) / sr;
    const f = P.f0 * (1 + sweep * Math.exp(-t / P.tauP));
    const a = Math.exp(-((t / P.tau) ** P.shape));
    let m = Math.sin(ph[0]) * a;
    ph[0] += (2 * Math.PI * f) / sr;
    for (let k = 0; k < MEMBRANE.length; k++) {
      m += amps[k] * Math.sin(ph[k + 1]) * Math.exp(-t / taus[k]);
      ph[k + 1] += (2 * Math.PI * f * MEMBRANE[k]) / sr;
    }
    let y = Math.tanh(drive * m) * norm;
    if (t < clickN) y += clickAmp * lp(hp(rnd())) * Math.exp(-t / P.click.tau);
    out[i] += g * y * endFade(i, end, sr);
    if (a < 1e-5 && t > clickN) break;
  }
}

function snare(out, s, end, sr, acc, rnd, ghost) {
  const P = KIT.snare, G = KIT.ghost;
  const b = (acc ? ACCENT.bright : 1) * (ghost ? G.bright : 1);
  const g = P.gain * (acc ? ACCENT.gain : 1) * (ghost ? G.gain : 1);
  const hp = biquad("hp", P.hp * b, 0.7, sr), lp = biquad("lp", P.lp * b, 0.7, sr);
  const hpC = biquad("hp", P.crackHp * b, 0.7, sr);
  const ph = P.modes.map(() => 0);
  for (let i = s; i < end; i++) {
    const t = (i - s) / sr;
    let body = 0;
    const bend = 1 + P.drop * b * Math.exp(-t / P.tauP);
    for (let k = 0; k < P.modes.length; k++) {
      const [f, a, tau] = P.modes[k];
      body += a * Math.sin(ph[k]) * Math.exp(-t / tau);
      ph[k] += (2 * Math.PI * f * bend) / sr;
    }
    const n = rnd();
    // the wires buzz while the head moves them past their contact threshold
    const head = Math.exp(-t / P.wiresTau);
    const wiresEnv = (1 - Math.exp(-t / P.wiresAttack)) * Math.max(0, head - P.contact) / (1 - P.contact);
    const wires = lp(hp(n)) * wiresEnv;
    const crack = t < 12 * P.crackTau ? hpC(n) * Math.exp(-t / P.crackTau) : 0;
    out[i] += g * (P.body * body + P.wires * wires * 2.2 + P.crack * crack) * endFade(i, end, sr);
    if (t > 0.05 && head <= P.contact && Math.exp(-t / P.modes[0][2]) < 1e-5) break;
  }
}

/** the metal: two groups of three partials, each group summed, the groups multiplied */
function metal(phases, freqs, sr) {
  let a = 0, c = 0;
  for (let k = 0; k < 3; k++) { a += Math.sin(phases[k]); phases[k] += (2 * Math.PI * freqs[k]) / sr; }
  for (let k = 3; k < 6; k++) { c += Math.sin(phases[k]); phases[k] += (2 * Math.PI * freqs[k]) / sr; }
  return (a * c) / 4;
}

function hat(out, s, end, chokeAt, sr, acc, rnd, open) {
  const P = KIT.hats, O = KIT.open, b = acc ? ACCENT.bright : 1;
  const g = (open ? O.gain : P.gain) * (acc ? ACCENT.gain : 1), tau = open ? O.tau : P.tau;
  const hp1 = biquad("hp", (open ? O.hp : P.hp) * b, 0.7, sr), hp2 = biquad("hp", (open ? O.hp : P.hp) * b, 0.7, sr);
  const lp = biquad("lp", P.lp, 0.7, sr);
  const freqs = SQRTS.map((r) => P.base * r * b ** 0.25);
  const phases = freqs.map(() => Math.PI * (rnd() + 1));
  const fadeN = Math.round(CHOKE * sr);
  for (let i = s; i < end; i++) {
    const t = (i - s) / sr;
    const env = (1 - P.hit) * Math.exp(-t / tau) + P.hit * Math.exp(-t / P.hitTau);
    let y = lp(hp2(hp1(P.metal * metal(phases, freqs, sr) + P.noise * rnd()))) * env;
    if (chokeAt >= 0 && i >= chokeAt) {
      const k = i - chokeAt;
      if (k >= fadeN) break;
      y *= 0.5 * (1 + Math.cos((Math.PI * k) / fadeN));
    }
    out[i] += g * y * endFade(i, end, sr);
    if (env < 1e-5) break;
  }
}

function crash(out, s, end, sr, acc, rnd) {
  const P = KIT.crash, b = acc ? ACCENT.bright : 1, g = P.gain * (acc ? ACCENT.gain : 1);
  const freqs = CRASH_RATIOS.map((r) => P.base * r * (1 + 0.01 * rnd()));
  const phases = freqs.map(() => Math.PI * (rnd() + 1));
  const hp = biquad("hp", P.hp, 0.7, sr), split = biquad("hp", P.split, 0.7, sr);
  const lpLo = biquad("lp", P.split, 0.7, sr), lpHi = biquad("lp", P.lpHi, 0.7, sr);
  const hiGain = 1.4 * b * b; // an accent rings brighter: more of the high band
  for (let i = s; i < end; i++) {
    const t = (i - s) / sr;
    let m = 0;
    for (let k = 0; k < 12; k += 2) {
      m += Math.sin(phases[k]) * Math.sin(phases[k + 1]);
      phases[k] += (2 * Math.PI * freqs[k]) / sr;
      phases[k + 1] += (2 * Math.PI * freqs[k + 1]) / sr;
    }
    const x = hp(P.metal * (m / 3) + P.noise * rnd());
    const bloom = 1 - Math.exp(-t / P.bloom);
    const lo = lpLo(x) * Math.exp(-t / P.tauLo), hi = lpHi(split(x)) * Math.exp(-t / P.tauHi);
    out[i] += g * bloom * (lo + hiGain * hi) * endFade(i, end, sr);
    if (t > 0.1 && Math.exp(-t / P.tauLo) < 1e-5) break;
  }
}

const tailOf = (part) => (part === "ghost" ? KIT.snare.tail : KIT[part].tail);

/** soft clip: identity below 0.9, then a tanh knee that never exceeds 1 */
export function softClip(x) {
  const a = Math.abs(x);
  return a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
}

export function renderKit(hits, opts = {}) {
  const sr = opts.sampleRate ?? 48000, seed = opts.seed ?? 1;
  // time order; simultaneous hits by part, then accent, so the list's order never matters
  const list = hits
    .map((h) => ({ ...h, accent: !!h.accent }))
    .sort((a, b) => a.t - b.t || PARTS.indexOf(a.part) - PARTS.indexOf(b.part) || Number(a.accent) - Number(b.accent));
  for (const h of list) {
    if (!PARTS.includes(h.part)) throw new Error(`kit: unknown part "${h.part}"`);
    if (!(h.t >= 0)) throw new Error(`kit: bad hit time ${h.t}`);
  }
  const dur = opts.duration ?? list.reduce((m, h) => Math.max(m, h.t + tailOf(h.part)), 0);
  const n = Math.max(0, Math.round(dur * sr));
  const out = new Float32Array(n);
  const acc = new Float64Array(n);
  // an open hat is choked by the next hi-hat hit (closed or open) after it
  const nextHat = new Array(list.length).fill(-1);
  for (let i = list.length - 2, nx = -1; i >= 0; i--) {
    if (list[i + 1].part === "hats" || list[i + 1].part === "open") nx = i + 1;
    nextHat[i] = nx;
  }
  list.forEach((h, i) => {
    const s = Math.round(h.t * sr);
    if (s >= n) return;
    const end = Math.min(n, s + Math.round(tailOf(h.part) * sr));
    const rnd = rng32(hitSeed(seed, i));
    const a = !!h.accent;
    switch (h.part) {
      case "kick": kick(acc, s, end, sr, a, rnd); break;
      case "snare": snare(acc, s, end, sr, a, rnd, false); break;
      case "ghost": snare(acc, s, end, sr, a, rnd, true); break;
      case "crash": crash(acc, s, end, sr, a, rnd); break;
      case "hats": hat(acc, s, end, -1, sr, a, rnd, false); break;
      case "open": {
        const nx = nextHat[i];
        hat(acc, s, end, nx >= 0 ? Math.round(list[nx].t * sr) : -1, sr, a, rnd, true);
        break;
      }
    }
  });
  for (let i = 0; i < n; i++) out[i] = softClip(acc[i]);
  return { samples: out };
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
  const seed = flag("--seed", 1), duration = flag("--duration", undefined);
  const [inPath, outPath] = args;
  if (!inPath || !outPath) {
    console.error("usage: bun tools/performance/kit.mjs hits.json out.wav [--seed n] [--duration s]");
    process.exit(2);
  }
  const j = JSON.parse(readFileSync(inPath, "utf8"));
  const hits = Array.isArray(j) ? j : j.hits;
  const { samples } = renderKit(hits, { seed, duration });
  writeFileSync(outPath, wavBytes(samples, 48000));
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  console.log(`kit: ${(samples.length / 48000).toFixed(2)} s, ${hits.length} hits, peak ${peak.toFixed(3)} -> ${outPath}`);
}
