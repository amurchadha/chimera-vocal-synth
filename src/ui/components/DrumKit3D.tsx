import { useEffect, useRef } from "react";
import { Screen } from "./Screen.tsx";
import { TEXT } from "../colors.ts";
import { labelBlock } from "../render/vector.ts";
import { KIT_BOUNDS, drawKit } from "../render/drums3d.ts";
import { Pen, Stage, runPanel } from "../render/wire3d.ts";
import { kitPose, type KitTrack } from "../../show/kit.ts";

export type { KitTrack } from "../../show/kit.ts";

/** the view: from the audience's left, above the kit, so the snare's head and the hats' gap show */
const AZ = -0.35, EL = 0.6;

/**
 * A drum kit in 3D, as a wireframe, playing a show's hit list (src/show/kit.ts): the kick's beater
 * swings into its head and the head gives, a wave runs across the snare (a ghost note's barely),
 * the top hi-hat comes down onto the bottom one for a closed hit and stays up for an open one, the
 * crash rocks. Every frame is a pure function of time() + offset, so frame-by-frame video capture
 * gets exact frames.
 */
export function DrumKit3D(props: { name: string; kit: KitTrack; time: () => number; offset?: number }) {
  const { name } = props;
  const propsRef = useRef(props);
  propsRef.current = props;
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stage = new Stage();
    const pen = new Pen(stage.beams);
    return runPanel(ref.current!, [stage], {
      key: () => propsRef.current.time() + (propsRef.current.offset ?? 0),
      draw: (ctx, w, h, t, render) => {
        if (!render) {
          labelBlock(ctx, "3D NEEDS WEBGL", w / 2, h / 2, w - 24, { size: 9, color: TEXT.secondary, align: "center" });
          return;
        }
        stage.frame(KIT_BOUNDS, w, h, AZ, EL, 0.05);
        stage.look(t >= 0 ? 0.06 * Math.sin((2 * Math.PI * t) / 23) : 0);
        stage.beams.begin();
        drawKit(pen, kitPose(propsRef.current.kit, t));
        stage.beams.end();
        render(stage, 0, 0, w, h);
      },
    });
  }, []);

  return (
    <Screen className="duet-kit" title={name} sub="drum kit" label={`${name}, a drum kit in 3D`}>
      <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />
    </Screen>
  );
}
