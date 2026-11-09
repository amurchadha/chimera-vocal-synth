/**
 * A drum kit's part in a show (a duet voice of kind "kit"): a list of hits, and the kit's pose at
 * any moment as a pure function of the time. No state is carried between frames, so a frame
 * captured on its own (tools/duet-video.ts jumps the clock) is the frame a live replay draws.
 *
 *   { "hits": [{ "t": 0.0, "part": "kick", "accent": true }, { "t": 0.405, "part": "snare" }, …] }
 *
 * Parts: kick, snare, ghost (a quiet snare hit), hats (closed hi-hat), open (open hi-hat), crash.
 * Every hit starts a short physical decay of its piece; an accent is bigger.
 */
export type KitPart = "kick" | "snare" | "ghost" | "hats" | "open" | "crash";

export interface KitHit {
  /** s, on the show's clock */
  t: number;
  part: KitPart;
  accent?: boolean;
}

export interface KitTrack {
  hits: KitHit[];
}

/** a hit as a piece feels it: when, and how hard (1 plain, ACCENT accented, GHOST a ghost note) */
interface Strike {
  t: number;
  amp: number;
}

/** the kit's hits sorted per piece */
interface KitIndex {
  kick: Strike[];
  snare: Strike[];
  /** closed and open hi-hat hits, in order; open marks the open ones */
  hats: (Strike & { open: boolean })[];
  crash: Strike[];
}

export const ACCENT = 1.45;
export const GHOST = 0.35;

/** the beater's rest angle back from the head, rad */
export const BEATER_REST = 0.8;

const cache = new WeakMap<KitTrack, KitIndex>();

function indexOf(kit: KitTrack): KitIndex {
  let ix = cache.get(kit);
  if (ix) return ix;
  ix = { kick: [], snare: [], hats: [], crash: [] };
  for (const h of kit.hits ?? []) {
    if (!(Number.isFinite(h?.t) && h.t >= 0)) continue;
    const amp = h.accent ? ACCENT : 1;
    switch (h.part) {
      case "kick":
        ix.kick.push({ t: h.t, amp });
        break;
      case "snare":
        ix.snare.push({ t: h.t, amp });
        break;
      case "ghost":
        ix.snare.push({ t: h.t, amp: GHOST * (h.accent ? 1.4 : 1) });
        break;
      case "hats":
      case "open":
        ix.hats.push({ t: h.t, amp, open: h.part === "open" });
        break;
      case "crash":
        ix.crash.push({ t: h.t, amp });
        break;
    }
  }
  for (const a of [ix.kick, ix.snare, ix.hats, ix.crash] as Strike[][]) a.sort((p, q) => p.t - q.t);
  cache.set(kit, ix);
  return ix;
}

/** index of the last strike at or before t (-1 if none) */
function lastAt(a: Strike[], t: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m].t <= t) lo = m + 1;
    else hi = m;
  }
  return lo - 1;
}

/** each strike within `life` s before t, newest first: f(age, amp) summed */
function sumRecent(a: Strike[], t: number, life: number, f: (age: number, amp: number) => number): number {
  let s = 0;
  for (let i = lastAt(a, t); i >= 0; i--) {
    const age = t - a[i].t;
    if (age > life) break;
    s += f(age, a[i].amp);
  }
  return s;
}

/** a damped swing that starts from rest with all its speed (a struck thing): 0 at age 0 */
const swing = (age: number, hz: number, tau: number) => Math.exp(-age / tau) * Math.sin(2 * Math.PI * hz * age);
/** a struck thing's flash, 1 at the hit */
const flash = (age: number, tau: number) => Math.exp(-age / tau);

export interface SnareWave {
  /** s since the hit */
  age: number;
  amp: number;
}

export interface KitPose {
  /** beater angle back from the batter head, rad (0: on the head, BEATER_REST at rest) */
  beater: number;
  /** the kick's batter head pushed in by the beater (head units, about 0..1.5) */
  kickFlex: number;
  /** the snare's waves still running (newest first) */
  snare: SnareWave[];
  /** hi-hat gap at the rims, 0 (closed) .. 1 (fully open) */
  hatGap: number;
  /** the top hat's rocking after a stick hit, rad about two axes */
  hatTilt: [number, number];
  /** the crash's wobble, rad about two axes */
  crashTilt: [number, number];
  /** each piece's glow, 0..1 (the hit's flash) */
  glow: { kick: number; snare: number; hats: number; crash: number };
}

const SNARE_LIFE = 0.7;
/** the top hat's gap with the foot resting on the pedal (closed hits chick it shut from here) */
export const HAT_REST = 0.45;
/** how long before a closed hit the top hat starts down, s */
const HAT_CLOSE = 0.05;
/** how long the beater takes from rest to the head, s */
const BEATER_SWING = 0.09;

/** the hi-hat's gap just after its strike i (and the strikes before it) has had `age` s */
function hatAfter(hats: KitIndex["hats"], i: number, age: number): number {
  const h = hats[i];
  if (!h.open) {
    // shut at the hit, held a moment by the stick and foot, then lifting back to the rest gap
    const held = Math.max(0, age - 0.03);
    return HAT_REST * (1 - Math.exp(-held / 0.09));
  }
  // open: the foot lets the top hat up at once, from wherever it was
  const before = i > 0 && !hats[i - 1].open ? hatAfter(hats, i - 1, h.t - hats[i - 1].t) : i > 0 ? 1 : HAT_REST;
  return before + (1 - before) * (1 - Math.exp(-age / 0.035));
}

/** A bar's hits by step, per piece: 0 for none, else the hit's strength (the strongest on a step). */
export interface BarSteps {
  kick: number[];
  snare: number[];
  hats: number[];
  /** the steps where the hi-hat is let open */
  open: boolean[];
  crash: number[];
}

/**
 * The bar of 16 steps starting at t0, each `step` s long: which steps each piece is hit on. A hit
 * belongs to its nearest step, so one a little early or late still lands on the grid.
 */
export function barSteps(kit: KitTrack, t0: number, step: number): BarSteps {
  const ix = indexOf(kit);
  const open = new Array<boolean>(16).fill(false);
  const row = (a: Strike[], onHit?: (k: number, i: number) => void) => {
    const out = new Array<number>(16).fill(0);
    for (let i = lastAt(a, t0 - step / 2) + 1; i < a.length; i++) {
      const k = Math.round((a[i].t - t0) / step);
      if (k > 15) break;
      if (k < 0) continue;
      out[k] = Math.max(out[k], a[i].amp);
      onHit?.(k, i);
    }
    return out;
  };
  const hats = row(ix.hats, (k, i) => (open[k] = open[k] || ix.hats[i].open));
  return { kick: row(ix.kick), snare: row(ix.snare), hats, open, crash: row(ix.crash) };
}

/**
 * Each piece's level at t, 0..1: a swell over ~30 ms after each hit that dies away (a meter, or a
 * knob that turns gently with it), unlike the flash, which is brightest at the hit itself.
 */
export function kitLevel(kit: KitTrack, t: number): { kick: number; snare: number; hats: number; crash: number } {
  const ix = indexOf(kit);
  const lv = (a: Strike[], tau: number) => Math.min(1, sumRecent(a, t, 6 * tau, (age, amp) => (amp / ACCENT) * (1 - Math.exp(-age / 0.03)) * Math.exp(-age / tau)));
  return { kick: lv(ix.kick, 0.3), snare: lv(ix.snare, 0.3), hats: lv(ix.hats, 0.2), crash: lv(ix.crash, 0.8) };
}

/** The kit at time t (s): a pure function of the hits and t. */
export function kitPose(kit: KitTrack, t: number): KitPose {
  const ix = indexOf(kit);

  // ---- kick: the beater swings in over BEATER_SWING s, hits, and falls back; the head gives
  let beater = BEATER_REST;
  const kp = lastAt(ix.kick, t);
  if (kp >= 0) beater = BEATER_REST * (1 - Math.exp(-(t - ix.kick[kp].t) / 0.045));
  const kn = kp + 1;
  if (kn < ix.kick.length) {
    const lead = ix.kick[kn].t - t;
    if (lead < BEATER_SWING) {
      const u = lead / BEATER_SWING; // 1 → 0 as the hit comes
      // an accent winds up further back before it comes in
      const wind = (ix.kick[kn].amp > 1 ? 0.35 : 0.12) * Math.sin(Math.PI * u);
      beater = Math.min(beater, BEATER_REST * (u * u + wind));
    }
  }
  const kickFlex = sumRecent(ix.kick, t, 0.6, (a, amp) => amp * Math.exp(-a / 0.07) * Math.cos(2 * Math.PI * 7 * a));
  const kickGlow = sumRecent(ix.kick, t, 0.6, (a, amp) => amp * flash(a, 0.12));

  // ---- snare: a wave runs out across the head from each hit
  const snare: SnareWave[] = [];
  for (let i = lastAt(ix.snare, t); i >= 0; i--) {
    const age = t - ix.snare[i].t;
    if (age > SNARE_LIFE) break;
    snare.push({ age, amp: ix.snare[i].amp });
  }
  const snareGlow = sumRecent(ix.snare, t, SNARE_LIFE, (a, amp) => amp * flash(a, 0.14));

  // ---- hi-hat: a closed hit brings the top hat down onto the bottom one; an open one lets it up
  let hatGap = HAT_REST;
  const hp = lastAt(ix.hats, t);
  if (hp >= 0) hatGap = hatAfter(ix.hats, hp, t - ix.hats[hp].t);
  const hn = hp + 1;
  if (hn < ix.hats.length && !ix.hats[hn].open) {
    const lead = ix.hats[hn].t - t;
    if (lead < HAT_CLOSE) hatGap *= (lead / HAT_CLOSE) ** 1.5;
  }
  const hats = ix.hats;
  let hx = 0, hz = 0, hatGlow = 0;
  for (let i = hp; i >= 0; i--) {
    const a = t - hats[i].t;
    if (a > 1.2) break;
    const tau = hats[i].open ? 0.45 : 0.1;
    hx += 0.05 * hats[i].amp * swing(a, 4.5, tau);
    hz += 0.025 * hats[i].amp * swing(a, 6.1, tau);
    hatGlow += hats[i].amp * flash(a, hats[i].open ? 0.35 : 0.06);
  }

  // ---- crash: it rocks on its felt, the rocking turning round as it dies away
  let cx = 0, cz = 0;
  const crashGlow = sumRecent(ix.crash, t, 3, (a, amp) => {
    cx += 0.15 * amp * swing(a, 2.1, 0.9);
    cz += 0.09 * amp * swing(a, 2.9, 0.75);
    return amp * flash(a, 0.6);
  });

  const c1 = (x: number) => Math.min(1, x);
  return {
    beater,
    kickFlex,
    snare,
    hatGap: Math.max(0, Math.min(1, hatGap)),
    hatTilt: [hx, hz],
    crashTilt: [cx, cz],
    glow: { kick: c1(kickGlow), snare: c1(snareGlow), hats: c1(hatGlow), crash: c1(crashGlow) },
  };
}
