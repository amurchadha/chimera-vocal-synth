import { useEffect, useRef } from "react";
import { Screen } from "./Screen.tsx";
import { TEXT, mix } from "../colors.ts";
import { label, labelBlock, labelWidth, type LabelOpts } from "../render/vector.ts";
import { KEYS_BOUNDS, KEYS_COLOR, drawKeys } from "../render/keys3d.ts";
import { Pen, Stage, runPanel } from "../render/wire3d.ts";
import { keysState, type KeysTrack } from "../../show/keys.ts";

export type { KeysTrack } from "../../show/keys.ts";

/** the view: from the player's seat, a little to the left, looking down onto the keys */
const AZ = -0.1, EL = 0.8;

/**
 * A synth keyboard in 3D, as a wireframe, playing a show's notes (src/show/keys.ts).
 * - A key goes down while its note sounds and glows in its part's colour, one for the chords
 *   and one for the riff. It comes back up over 0.1 s after the note ends.
 * - A knob drifts with how much is sounding, and the mod wheel rolls with the riff.
 * - The screen traces a waveform of what's sounding. Above the keys, the chord sounding is
 *   named (e.g. "Gm") and the riff's note read out.
 * Everything is a pure function of time() + offset, so frame-by-frame video capture gets exact
 * frames.
 */
export function Keys3D(props: { name: string; keys: KeysTrack; time: () => number; offset?: number }) {
  const { name } = props;
  const propsRef = useRef(props);
  propsRef.current = props;
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stage = new Stage();
    const pen = new Pen(stage.beams);
    return runPanel(ref.current!, [stage], {
      key: () => propsRef.current.time() + (propsRef.current.offset ?? 0),
      draw: (ctx, w, h, t, render) => draw(ctx, w, h, propsRef.current.keys, t, stage, pen, render),
    });
  }, []);

  return (
    <Screen className="duet-keys" title={name} sub="synth" label={`${name}, a synth keyboard in 3D`}>
      <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />
    </Screen>
  );
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, keys: KeysTrack, t: number, stage: Stage, pen: Pen, render: ((s: Stage, x: number, y: number, w: number, h: number) => void) | null) {
  const s = keysState(keys, t);

  // the chord and the riff's note across the top, as much as fits; a name stays, dimmed, until the next
  const pad = 12;
  const size = Math.max(9.5, Math.min(16, w / 24)); // large enough to read when the video is watched on a phone; the captions (0.8) stay over 7 px
  const cap: LabelOpts = { size: size * 0.8, color: TEXT.secondary, ls: 0.18 };
  const big: LabelOpts = { size: size * 1.7, weight: "m", ls: 0.08 };
  const room = w - 2 * pad;
  const showRiff = labelWidth(ctx, "C#m7b5/Bb", big) + labelWidth(ctx, "Bb4", big) + 12 <= room;
  const showCaps = labelWidth(ctx, "CHORD", cap) + labelWidth(ctx, "RIFF", cap) + 12 <= room;
  const capY = pad + size, bigY = showCaps ? pad + size * 2.6 : pad + size * 1.6;
  const top = bigY + size * 0.7;
  const shade = (c: string, live: boolean) => (live ? c : mix(c, "#000000", 0.45));

  // the keyboard below, in the middle of the room (it is wide: about w / 2.2 of height)
  const sh = Math.min(h - top, w / 2.2);
  const y0 = top + Math.max(0, (h - top - sh) / 2);
  if (render && sh > 24) {
    stage.frame(KEYS_BOUNDS, w, sh, AZ, EL, 0.05);
    stage.look(t >= 0 ? 0.05 * Math.sin((2 * Math.PI * t) / 19) : 0);
    stage.beams.begin();
    drawKeys(pen, s);
    stage.beams.end();
    render(stage, 0, y0, w, sh);
  } else if (!render && sh > 24) {
    labelBlock(ctx, "3D NEEDS WEBGL", w / 2, y0 + sh / 2, room, { size: cap.size, color: TEXT.secondary, align: "center" });
  }

  if (showCaps) {
    label(ctx, "CHORD", pad, capY, cap);
    if (showRiff) label(ctx, "RIFF", w - pad, capY, { ...cap, align: "right" });
  }
  label(ctx, s.chordName || "--", pad, bigY, { ...big, color: shade(KEYS_COLOR.chord, s.chordLive) });
  if (showRiff) label(ctx, s.riffNote || "--", w - pad, bigY, { ...big, color: shade(KEYS_COLOR.riff, s.riffLive), align: "right" });
}
