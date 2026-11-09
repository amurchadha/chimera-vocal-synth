import { useEffect, useRef } from "react";
import { Screen } from "./Screen.tsx";
import { TEXT, V, heat } from "../colors.ts";
import { Glow, beam, beamPts, label, pathOf, ring, seg, type Pt } from "../render/vector.ts";

/** The track written by tools/performance/808.mjs (100 frames per second; see its header). */
export interface Track808 {
  rate: number;
  note: number[];
  disp: number[];
  hz: number[];
  energy: number[];
  hit: number[];
  amp?: number[];
  acc?: number[];
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** nearest note name of a frequency, e.g. 65.4 -> "C2" */
export function noteName(hz: number): string {
  if (!(hz > 0)) return "--";
  const m = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

const RIPPLE_LIFE = 0.9; // s

/** frame value at time t, linearly interpolated (index = t * rate) */
function at(a: number[], f: number): number {
  const i = Math.max(0, Math.min(a.length - 1, Math.floor(f)));
  const j = Math.min(a.length - 1, i + 1);
  const u = Math.max(0, Math.min(1, f - i));
  return a[i] * (1 - u) + a[j] * u;
}

/**
 * The 808's panel: a side view of the drum, its head bowed by the modeled displacement, a ripple
 * for every hit, the pitch in Hz and as a note, and an energy bar. Everything is a pure function
 * of time() + offset (no wall-clock deltas), so frame-by-frame video capture gets exact frames.
 */
export function Instrument808(props: { name: string; track: Track808; time: () => number; offset?: number }) {
  const { name } = props;
  const propsRef = useRef(props);
  propsRef.current = props;
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const glow = new Glow();
    let w = 0, h = 0, dpr = 1;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    let raf = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (Math.min(1.5, window.devicePixelRatio || 1) !== dpr) fit();
      if (w <= 0 || h <= 0) return;
      const { track: tr, time, offset = 0 } = propsRef.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, w, h, tr, time() + offset);
      glow.apply(canvas, ctx, dpr);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <Screen className="duet-808" title={name} sub="modeled drum head" label={`${name}, a modeled drum head`}>
      <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />
    </Screen>
  );
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, tr: Track808, t: number) {
  const n = tr.disp.length;
  if (n === 0) return;
  const f = t * tr.rate - 0.5; // frame k is sampled at (k + 0.5) / rate
  const live = t >= 0;
  const k = Math.max(0, Math.min(n - 1, Math.round(f)));
  const disp = live ? at(tr.disp, f) : 0;
  const amp = live && tr.amp ? at(tr.amp, f) : Math.abs(disp);
  const energy = live ? at(tr.energy, f) : 0;
  const hz = live ? tr.hz[k] : 0;
  const note = live ? tr.note[k] : 0;

  const pad = 14;
  const barW = Math.max(10, Math.min(18, w * 0.04));
  const cx = (w - barW - pad) / 2 + pad * 0.5;
  const readH = Math.min(46, h * 0.28);
  const dw = Math.min((w - barW - pad * 3) * 0.86, (h - readH - pad * 2) * 1.5);
  const dh = dw * 0.55;
  const topY = pad + readH + (h - readH - pad * 2 - dh) * 0.45;
  const left = cx - dw / 2, right = cx + dw / 2;
  const headY = topY + dh * 0.12;

  // ripples: every hit in the last RIPPLE_LIFE s, expanding rings out from the head's centre
  const recent = Math.ceil(RIPPLE_LIFE * tr.rate);
  const k0 = Math.max(0, Math.floor(f) - recent);
  for (let i = k0; i <= Math.min(n - 1, Math.floor(f)); i++) {
    if (!tr.hit[i]) continue;
    const age = t - i / tr.rate;
    if (age < 0 || age > RIPPLE_LIFE) continue;
    const u = age / RIPPLE_LIFE;
    const a = (tr.acc?.[i] || 1) > 1 ? 1 : 0.8;
    for (let r = 0; r < 3; r++) {
      const uu = u - r * 0.09;
      if (uu <= 0) continue;
      const rad = uu * dw * 0.62;
      const e = new Path2D();
      e.ellipse(cx, headY, rad, rad * 0.16, 0, 0, Math.PI * 2);
      beam(ctx, e, V.amber, 1.2, { alpha: a * (1 - uu) * (1 - uu) * (1 - r * 0.25) });
    }
  }

  // shell: a drum from the side, the head across the top
  const shellB = topY + dh;
  const shell = pathOf(
    [[left, headY], [left + dw * 0.04, shellB], [right - dw * 0.04, shellB], [right, headY]] as Pt[],
  );
  beam(ctx, shell, V.blue, 1.4);
  const base = new Path2D();
  base.ellipse(cx, shellB, dw * 0.46, dh * 0.07, 0, 0, Math.PI);
  beam(ctx, base, V.blueMid, 1.1);
  for (let i = 1; i < 6; i++) {
    const x = left + (dw * i) / 6;
    seg(ctx, x, headY + dh * 0.14, x, shellB - dh * 0.06, V.blueDim, 0.8, { alpha: 0.5 });
  }
  // the lugs (tension rods) at the rim
  for (const sx of [left, right]) {
    ring(ctx, sx, headY, 3, V.blueMid, 1);
  }

  // the head: a curve bowed by disp (up positive); the faint envelope outline shows the ringing
  const bulge = dh * 0.5;
  const N = 40;
  const head: Pt[] = [], env: Pt[] = [], envLo: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, s = 1 - (2 * u - 1) ** 2; // fundamental mode shape
    const x = left + dw * u;
    head.push([x, headY - disp * bulge * s]);
    env.push([x, headY - amp * bulge * s]);
    envLo.push([x, headY + amp * bulge * s]);
  }
  beamPts(ctx, env, V.amber, 0.8, { alpha: 0.35, dash: [3, 4] });
  beamPts(ctx, envLo, V.amber, 0.8, { alpha: 0.35, dash: [3, 4] });
  beamPts(ctx, head, V.white, 1.9, { hot: true });
  seg(ctx, left - 6, headY, right + 6, headY, V.blueDim, 0.8, { alpha: 0.6, dash: [2, 5] });

  // readouts
  const size = Math.max(9, Math.min(13, w / 24));
  label(ctx, "PITCH", pad, pad + size, { size: size * 0.8, color: TEXT.secondary, ls: 0.18 });
  label(ctx, hz > 0 ? `${hz.toFixed(0)} HZ` : "-- HZ", pad, pad + size * 2.6, { size: size * 1.7, color: V.amber, weight: "m", ls: 0.08 });
  label(ctx, hz > 0 ? noteName(hz) : "--", w - barW - pad * 2, pad + size * 2.6, { size: size * 1.7, color: V.white, weight: "m", align: "right", ls: 0.08 });
  if (note > 0) {
    label(ctx, `TUNED ${noteName(440 * 2 ** ((note - 69) / 12))}`, w - barW - pad * 2, pad + size, { size: size * 0.8, color: TEXT.secondary, align: "right", ls: 0.18 });
  }

  // energy bar, right edge, with a tick scale
  const bx = w - pad - barW, by0 = pad + readH * 0.2, by1 = h - pad - 12;
  const frame = pathOf([[bx, by0], [bx + barW, by0], [bx + barW, by1], [bx, by1]] as Pt[], true);
  beam(ctx, frame, V.blueMid, 1.1);
  const lvl = Math.max(0, Math.min(1, energy));
  if (lvl > 0.003) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, by1, 0, by0);
    g.addColorStop(0, heat(0.15));
    g.addColorStop(0.6, heat(0.6));
    g.addColorStop(1, heat(1));
    ctx.fillStyle = g;
    const hh = (by1 - by0 - 4) * lvl;
    ctx.fillRect(bx + 2, by1 - 2 - hh, barW - 4, hh);
    ctx.restore();
  }
  label(ctx, "LEVEL", bx + barW / 2, h - pad, { size: Math.max(7, size * 0.7), color: TEXT.secondary, align: "center", ls: 0.12 });
}
