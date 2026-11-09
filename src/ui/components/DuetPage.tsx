/**
 * The duet page (`?show=<id>`): a pre-rendered song with two (or more) voices, each on its own 3D
 * head, side by side, moving exactly as the engine did when it sang. Nothing is synthesized here:
 * the page plays the mixed track and replays each voice's recorded telemetry at the playhead.
 *
 * A show is a folder `public/shows/<id>/` (gitignored: shows are made locally, often of songs that
 * mustn't be published) holding `show.json`, the mix and one `.tele` per voice from
 * `chimera render notes … --tele`. The voices' renders and the mix must share sample 0.
 *
 *   { "title": "…", "audio": "mix.mp3", "bpm": 103, "downbeat": 0,
 *     "voices": [{ "name": "Lower", "tele": "male.tele" }, { "name": "Upper", "tele": "female.tele" }] }
 *
 * Optional: `bpm` and `downbeat` (s, a bar's first beat) nod the heads on the beat; a voice's
 * `melody` (the melody file it was rendered from) writes its words at its mouth, and the show's
 * `spell` ({"owr": "our"}) writes a syllable spelled for the dictionary as it should read.
 *
 * A voice can be an instrument instead of a head, its data a .json in `tele`:
 *   { "name": "Drums", "tele": "kit.json", "kind": "kit" }  a drum kit's hit list (src/show/kit.ts):
 *       { "hits": [{ "t": 0.0, "part": "kick", "accent": true }, { "t": 0.4, "part": "snare" }, …] },
 *       part one of kick, snare, ghost, hats, open, crash
 *   { "name": "808", "tele": "808.json", "kind": "808", "kit": "kit.json" }  a step-sequencer drum
 *       machine running the modeled 808's track (tools/performance/808.mjs) on its own step clock:
 *       its bass row from the track, its kick, snare and hats rows from the optional `kit` (a hit
 *       list as above; without it only the bass row lights)
 * Both are drawn as wireframes in 3D and share one WebGL context (render/wire3d.ts); each head has its own.
 */
import { useEffect, useRef, useState } from "react";
import { AnatomyView3D, type HeadFeed } from "./AnatomyView3D.tsx";
import { Instrument808, type Track808 } from "./Instrument808.tsx";
import { DrumKit3D, type KitTrack } from "./DrumKit3D.tsx";
import { Screen } from "./Screen.tsx";
import { TeleTrack } from "../../show/tele.ts";
import { Transport } from "../../show/transport.ts";
import { getModel } from "../useModel.ts";
import { VoiceModel } from "../analysis.ts";
import { bodyLabel } from "../body.ts";
import type { ViewFlags } from "../render/anatomy.ts";
import { mouthWords } from "../mouthWords.ts";
import { V } from "../colors.ts";
import { g2p } from "../speech.ts";
import { lyricsToSyllables } from "../../wasm/engine.ts";
import { sungWords, timedWords, wordAt, type Melody, type SungWords, type TimedWord } from "../../show/words.ts";
import type { OverlayFn } from "./AnatomyView.tsx";

interface ShowFile {
  title: string;
  audio: string;
  bpm?: number;
  downbeat?: number;
  spell?: Record<string, string>;
  /** "lead": the first voice large on the left, facing the others in a grid on the right */
  layout?: "row" | "lead";
  /** words: timed words (`[{"text","start","end"}]`) for a voice not sung from a melody;
   *  offset: seconds of the voice's own recording to skip, so a late first hit lands on the show's time */
  /*  kind "808": not a head but a drum machine running the modeled 808 (tools/performance/808.mjs), its
   *  track in `tele` (the .json), and `kit` an optional hit list for its kick, snare and hats rows;
   *  kind "kit": a drum kit, its hit list in `tele` (the .json, see src/show/kit.ts) */
  voices: { name: string; tele: string; kind?: "808" | "kit"; kit?: string; melody?: string; words?: string; offset?: number }[];
}

type LoadedVoice =
  | { name: string; offset: number; track: TeleTrack; words: SungWords | null; drum?: undefined; kit?: undefined }
  | { name: string; offset: number; drum: Track808; hits?: KitTrack; track?: undefined; kit?: undefined }
  | { name: string; offset: number; kit: KitTrack; track?: undefined; drum?: undefined };

interface Loaded {
  show: ShowFile;
  voices: LoadedVoice[];
}

/** the heads as the face screen shows them by default, less the measurement labels */
const VIEW: ViewFlags = { pressure: true, particles: true, grid: false, calipers: false };

async function fetchOk(url: string): Promise<Response> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  return r;
}

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function DuetPage(props: { id: string }) {
  const base = `${import.meta.env.BASE_URL}shows/${props.id}/`;
  // one transport per mount (its context closes on unmount)
  const [transport, setTransport] = useState<Transport | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = new Transport();
    setTransport(t);
    // tools/duet-video.ts drives the playhead from outside, frame by frame
    (window as unknown as { __duetTransport?: Transport }).__duetTransport = t;
    return () => t.dispose();
  }, []);

  useEffect(() => {
    if (!transport) return;
    let live = true;
    setLoaded(null);
    (async () => {
      const show = (await (await fetchOk(base + "show.json")).json()) as ShowFile;
      if (!show.voices?.length || !show.audio) throw new Error("show.json needs audio and voices");
      const [audio, ...teles] = await Promise.all([fetchOk(base + show.audio).then((r) => r.arrayBuffer()), ...show.voices.map((v) => fetchOk(base + v.tele).then((r) => (v.kind === "808" || v.kind === "kit" ? r.json() : r.arrayBuffer())))]);
      // the words: syllables as the CLI splits them (the pronouncing dictionary first, as it does)
      const melodies = await Promise.all(show.voices.map((v) => (v.melody ? fetchOk(base + v.melody).then((r) => r.json() as Promise<Melody>) : null)));
      if (melodies.some(Boolean)) await g2p.load().catch(() => {});
      const timed = await Promise.all(show.voices.map((v) => (v.words ? fetchOk(base + v.words).then((r) => r.json() as Promise<TimedWord[]>) : null)));
      // a drum machine's kick, snare and hats rows
      const machineKits = await Promise.all(show.voices.map((v) => (v.kind === "808" && v.kit ? fetchOk(base + v.kit).then((r) => r.json() as Promise<KitTrack>) : null)));
      const words = melodies.map((m, i) => {
        const own = timed[i];
        if (own) return timedWords(own);
        if (!m) return null;
        try {
          return sungWords(m, lyricsToSyllables(m.lyrics), show.spell);
        } catch (e) {
          console.warn("duet: no words for a voice:", e);
          return null;
        }
      });
      const voices: LoadedVoice[] = show.voices.map((v, i) => {
        const offset = v.offset ?? 0;
        const hitList = (kit: KitTrack | null, file: string) => {
          if (!Array.isArray(kit?.hits)) throw new Error(`${file}: a kit needs "hits"`);
          return kit;
        };
        if (v.kind === "808") return { name: v.name, drum: teles[i] as Track808, hits: machineKits[i] ? hitList(machineKits[i], v.kit!) : undefined, offset };
        if (v.kind === "kit") return { name: v.name, kit: hitList(teles[i] as KitTrack, v.tele), offset };
        return { name: v.name, track: new TeleTrack(teles[i] as ArrayBuffer), words: words[i], offset };
      });
      await transport.load(audio);
      if (live) setLoaded({ show, voices });
    })().catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [base, transport]);

  // the readouts follow the transport: at once on a change, and a few times a second while it plays
  useEffect(() => {
    if (!transport) return;
    const off = transport.subscribe(() => setTick((n) => n + 1));
    const id = setInterval(() => transport.isPlaying && setTick((n) => n + 1), 250);
    return () => {
      off();
      clearInterval(id);
    };
  }, [transport]);

  if (error)
    return (
      <div className="duet">
        <p className="duet-msg error">This show could not load: {error}</p>
      </div>
    );
  const st = transport?.state ?? { playing: false, time: 0, duration: 0, epoch: 0 };
  const title = loaded?.show.title ?? "Loading…";
  // in a row the last of several turns to face the others; with a lead, the lead faces the band and the band faces back
  const lead = loaded?.show.layout === "lead";
  const facing = (i: number, n: number): 1 | -1 => (lead ? (i === 0 ? 1 : -1) : i > 0 && i === n - 1 ? -1 : 1);
  return (
    <div className="duet">
      <header className="duet-top">
        <span className="wordmark">Chimera</span>
        <span className="duet-title">{title}</span>
      </header>
      <main className={lead ? "duet-heads lead" : "duet-heads"} style={{ "--voices": loaded?.voices.length ?? 2, "--band": Math.min(4, Math.max(1, Math.ceil(((loaded?.voices.length ?? 2) - 1) / 2))) } as React.CSSProperties}>
        {loaded && transport ? (
          loaded.voices.map((v, i) =>
            v.kit ? (
              <DrumKit3D key={i} name={v.name} kit={v.kit} offset={v.offset} time={() => transport.time()} />
            ) : v.drum ? (
              <Instrument808 key={i} name={v.name} track={v.drum} kit={v.hits} offset={v.offset} time={() => transport.time()} />
            ) : (
              <Head key={i} name={v.name} track={v.track} words={v.words} offset={v.offset} show={loaded.show} transport={transport} facing={facing(i, loaded.voices.length)} />
            ),
          )
        ) : (
          <p className="duet-msg">Loading the song…</p>
        )}
      </main>
      <footer className="duet-bar">
        <button className="primary large" disabled={!loaded} onClick={() => (st.playing ? transport?.pause() : transport?.play())}>
          {st.playing ? "Pause" : st.duration > 0 && st.time >= st.duration - 0.05 ? "Again" : "Play"}
        </button>
        <span className="duet-time">
          {clock(st.time)} / {clock(st.duration)}
        </span>
        <input
          type="range"
          aria-label="Position in the song"
          min={0}
          max={st.duration || 1}
          step={0.1}
          value={st.time}
          disabled={!loaded}
          onChange={(e) => transport?.seek(Number(e.target.value))}
          style={{ "--pos": `${st.duration ? (100 * st.time) / st.duration : 0}%` } as React.CSSProperties}
        />
      </footer>
    </div>
  );
}

/** one voice's head; the last of several turns to face the others */
function Head(props: { name: string; track: TeleTrack; words: SungWords | null; offset: number; show: ShowFile; transport: Transport; facing: 1 | -1 }) {
  const { track, show, transport, words, offset } = props;
  const feedRef = useRef<HeadFeed | null>(null);
  // the syllable at the mouth, written on the side the face looks to
  const overlayRef = useRef<OverlayFn | undefined>(undefined);
  if (words && !overlayRef.current) overlayRef.current = mouthWords(() => wordAt(words, transport.time()), V.green, props.facing);
  if (!feedRef.current) {
    const model = getModel(track.body, track.sampleRate);
    const beatStep = (t: number) => {
      if (!show.bpm) return -1;
      const s = Math.floor(((t - (show.downbeat ?? 0)) * show.bpm * 4) / 60);
      return s < 0 ? -1 : s % 16;
    };
    feedRef.current = {
      model,
      view: VIEW,
      maxDpr: 1.5,
      facing: props.facing,
      frame: () => {
        const t = transport.time();
        const i = track.indexAt(Math.max(0, t + offset));
        const msg = track.message(i, beatStep(t));
        // paused: the head keeps its shape, the voice and the face come to rest
        if (!transport.isPlaying) return { tele: null, artic: VoiceModel.articFromArray(msg.t.artic), epoch: transport.epoch };
        return { tele: msg, artic: VoiceModel.articFromArray(msg.t.artic), epoch: transport.epoch };
      },
    };
  }
  return (
    <Screen className="duet-head" focus title={props.name} sub={bodyLabel(track.body)} label={`${props.name} voice, ${bodyLabel(track.body)}, in 3D`}>
      <AnatomyView3D feed={feedRef.current} readouts={false} overlay={overlayRef.current} />
    </Screen>
  );
}
