import { useEffect, useRef } from "react";
import { Screen } from "./Screen.tsx";
import { TEXT, V, mix } from "../colors.ts";
import { label, labelBlock, labelWidth, type LabelOpts } from "../render/vector.ts";
import { MACHINE_BOUNDS, PART_COLOR, drawMachine } from "../render/machine3d.ts";
import { Pen, Stage, runPanel } from "../render/wire3d.ts";
import { PARTS, machineState, type Track808 } from "../../show/sequencer.ts";
import type { KitTrack } from "../../show/kit.ts";

export type { Track808 } from "../../show/sequencer.ts";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** nearest note name of a frequency, e.g. 65.4 -> "C2" */
export function noteName(hz: number): string {
  if (!(hz > 0)) return "--";
  const m = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** the view: from the front, a little to the left, looking down onto the sloped top */
const AZ = -0.07, EL = 1.0;

/**
 * The 808's panel: a step-sequencer drum machine in 3D, as a wireframe, running the bar on the
 * track's step clock (src/show/sequencer.ts).
 * - The key of the step now playing lights white. A key flashes in the colour of the part that
 *   fires on it.
 * - The grid in front of the keys shows the bar for kick, snare, hats and bass.
 * - Each part's level knob turns gently with its level.
 * - The screen traces the bass's ringing, and the bass's pitch reads out above in Hz and as a note.
 * The kick, snare and hats rows come from `kit` (a hit list, as the drum kit panel reads), on the
 * same clock as the track. Without it only the bass row lights. Everything is a pure function of
 * time() + offset, so frame-by-frame video capture gets exact frames.
 */
export function Instrument808(props: { name: string; track: Track808; time: () => number; offset?: number; kit?: KitTrack }) {
  const { name } = props;
  const propsRef = useRef(props);
  propsRef.current = props;
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stage = new Stage();
    const pen = new Pen(stage.beams);
    return runPanel(ref.current!, [stage], {
      key: () => propsRef.current.time() + (propsRef.current.offset ?? 0),
      draw: (ctx, w, h, t, render) => draw(ctx, w, h, propsRef.current.track, propsRef.current.kit, t, stage, pen, render),
    });
  }, []);

  return (
    <Screen className="duet-808" title={name} sub="drum machine" label={`${name}, a step-sequencer drum machine`}>
      <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />
    </Screen>
  );
}

const LEGEND: Record<(typeof PARTS)[number], string> = { kick: "KICK", snare: "SNARE", hats: "HATS", bass: "BASS" };

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, tr: Track808, kit: KitTrack | undefined, t: number, stage: Stage, pen: Pen, render: ((s: Stage, x: number, y: number, w: number, h: number) => void) | null) {
  const n = tr.hz.length;
  if (n === 0) return;
  const live = t >= 0;
  const k = Math.max(0, Math.min(n - 1, Math.round(t * tr.rate - 0.5))); // frame k is sampled at (k + 0.5) / rate
  const hz = live ? tr.hz[k] : 0;
  const note = live ? tr.note[k] : 0;

  // the bass's pitch across the top, as much as fits: the pitch and its note, then their captions
  const pad = 12;
  const size = Math.max(8.75, Math.min(13, w / 22));
  const cap: LabelOpts = { size: size * 0.8, color: TEXT.secondary, ls: 0.18 };
  const big: LabelOpts = { size: size * 1.7, color: V.amber, weight: "m", ls: 0.08 };
  const hzText = hz > 0 ? `${hz.toFixed(0)} HZ` : "-- HZ", noteText = hz > 0 ? noteName(hz) : "--";
  const tuned = note > 0 ? `TUNED ${noteName(440 * 2 ** ((note - 69) / 12))}` : "";
  const room = w - 2 * pad;
  const showNote = labelWidth(ctx, "000 HZ", big) + labelWidth(ctx, "C#0", big) + 12 <= room;
  const showCaps = showNote && labelWidth(ctx, "BASS PITCH", cap) + labelWidth(ctx, "TUNED C#0", cap) + 12 <= room;
  const capY = pad + size, bigY = showCaps ? pad + size * 2.6 : pad + size * 1.6;
  const top = bigY + size * 0.7;

  // the machine, and the rows' names under it in their colours when they fit, together in the
  // middle of the room below the readouts (the machine is wide: it needs about w / 1.5 of height)
  const leg: LabelOpts = { size: cap.size, ls: 0.16, weight: "m" };
  const widths = PARTS.map((p) => labelWidth(ctx, LEGEND[p], leg));
  const gap = size * 1.2;
  const legW = widths.reduce((a, b) => a + b, 0) + gap * (PARTS.length - 1);
  const legend = legW <= room && h - top > 120;
  const legH = legend ? cap.size! * 2.2 : 0;
  const sh = Math.min(h - top - legH - (legend ? pad * 0.5 : 0), w / 1.5);
  const y0 = top + Math.max(0, (h - top - legH - sh) / 2);
  if (render && sh > 24) {
    stage.frame(MACHINE_BOUNDS, w, sh, AZ, EL, 0.05);
    stage.look(live ? 0.05 * Math.sin((2 * Math.PI * t) / 21) : 0);
    stage.beams.begin();
    drawMachine(pen, machineState(tr, kit, t));
    stage.beams.end();
    render(stage, 0, y0, w, sh);
  } else if (!render && sh > 24) {
    labelBlock(ctx, "3D NEEDS WEBGL", w / 2, y0 + sh / 2, w - 2 * pad, { size: cap.size, color: TEXT.secondary, align: "center" });
  }

  if (showCaps) {
    label(ctx, "BASS PITCH", pad, capY, cap);
    if (tuned) label(ctx, tuned, w - pad, capY, { ...cap, align: "right" });
  }
  label(ctx, hzText, pad, bigY, big);
  if (showNote) label(ctx, noteText, w - pad, bigY, { ...big, color: V.white, align: "right" });
  if (legend) {
    let x = (w - legW) / 2;
    PARTS.forEach((p, i) => {
      label(ctx, LEGEND[p], x, y0 + sh + legH * 0.6, { ...leg, color: mix(PART_COLOR[p], "#ffffff", 0.25) });
      x += widths[i] + gap;
    });
  }
}
