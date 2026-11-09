import { useEffect, useRef } from "react";
import { Screen } from "./Screen.tsx";
import { TEXT, V } from "../colors.ts";
import { label, labelBlock, labelWidth, type LabelOpts } from "../render/vector.ts";
import { BD_BOUNDS, draw808, type Drum808 } from "../render/drums3d.ts";
import { Pen, Stage, runPanel } from "../render/wire3d.ts";

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
/** the view: from the audience's left, a little above */
const AZ = -0.72, EL = 0.2;

/** frame value at time t, linearly interpolated (index = t * rate) */
function at(a: number[], f: number): number {
  const i = Math.max(0, Math.min(a.length - 1, Math.floor(f)));
  const j = Math.min(a.length - 1, i + 1);
  const u = Math.max(0, Math.min(1, f - i));
  return a[i] * (1 - u) + a[j] * u;
}

/**
 * The 808's panel: a wireframe bass drum in 3D whose played head the model moves. The head bows
 * with the modeled displacement (its ringing envelope either side), a ripple runs out from every
 * hit, the output level warms the drum's glow, and the pitch reads out in Hz and as a note.
 * Everything is a pure function of time() + offset (no wall-clock deltas), so frame-by-frame video
 * capture gets exact frames.
 */
export function Instrument808(props: { name: string; track: Track808; time: () => number; offset?: number }) {
  const { name } = props;
  const propsRef = useRef(props);
  propsRef.current = props;
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stage = new Stage();
    const pen = new Pen(stage.beams);
    return runPanel(ref.current!, [stage], {
      key: () => propsRef.current.time() + (propsRef.current.offset ?? 0),
      draw: (ctx, w, h, t, render) => draw(ctx, w, h, propsRef.current.track, t, stage, pen, render),
    });
  }, []);

  return (
    <Screen className="duet-808" title={name} sub="modeled drum head" label={`${name}, a modeled drum head`}>
      <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />
    </Screen>
  );
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, tr: Track808, t: number, stage: Stage, pen: Pen, render: ((s: Stage, x: number, y: number, w: number, h: number) => void) | null) {
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

  // ripples: every hit in the last RIPPLE_LIFE s
  const ripples: Drum808["ripples"] = [];
  const k0 = Math.max(0, Math.floor(f) - Math.ceil(RIPPLE_LIFE * tr.rate));
  for (let i = Math.min(n - 1, Math.floor(f)); i >= k0; i--) {
    if (!tr.hit[i]) continue;
    const age = t - i / tr.rate;
    if (age < 0 || age > RIPPLE_LIFE) continue;
    ripples.push({ u: age / RIPPLE_LIFE, a: (tr.acc?.[i] || 1) > 1 ? 1 : 0.8 });
  }

  // the readouts across the top, as many as fit: the pitch and its note, then their captions
  const pad = 12;
  const size = Math.max(8.75, Math.min(13, w / 22));
  const cap: LabelOpts = { size: size * 0.8, color: TEXT.secondary, ls: 0.18 };
  const big: LabelOpts = { size: size * 1.7, color: V.amber, weight: "m", ls: 0.08 };
  const hzText = hz > 0 ? `${hz.toFixed(0)} HZ` : "-- HZ", noteText = hz > 0 ? noteName(hz) : "--";
  const tuned = note > 0 ? `TUNED ${noteName(440 * 2 ** ((note - 69) / 12))}` : "";
  const room = w - 2 * pad;
  const showNote = labelWidth(ctx, "000 HZ", big) + labelWidth(ctx, "C#0", big) + 12 <= room;
  const showCaps = showNote && labelWidth(ctx, "PITCH", cap) + labelWidth(ctx, "TUNED C#0", cap) + 12 <= room;
  const capY = pad + size, bigY = showCaps ? pad + size * 2.6 : pad + size * 1.6;
  const top = bigY + size * 0.7;

  // the drum, below the readouts, turning slowly so its depth shows
  const sh = h - top;
  if (render && sh > 24) {
    stage.frame(BD_BOUNDS, w, sh, AZ, EL, 0.1);
    stage.look(live ? 0.07 * Math.sin((2 * Math.PI * t) / 19) : 0);
    stage.beams.begin();
    draw808(pen, { disp, amp, energy, ripples });
    stage.beams.end();
    render(stage, 0, top, w, sh);
  } else if (!render && sh > 24) {
    labelBlock(ctx, "3D NEEDS WEBGL", w / 2, top + sh / 2, w - 2 * pad, { size: cap.size, color: TEXT.secondary, align: "center" });
  }

  if (showCaps) {
    label(ctx, "PITCH", pad, capY, cap);
    if (tuned) label(ctx, tuned, w - pad, capY, { ...cap, align: "right" });
  }
  label(ctx, hzText, pad, bigY, big);
  if (showNote) label(ctx, noteText, w - pad, bigY, { ...big, color: V.white, align: "right" });
}
