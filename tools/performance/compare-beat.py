"""Does a rendered performance's beat come out as the notes it was meant to play? The render is
listened to the way the song was: split into stems (demucs) and each stem turned into notes
(transcribe-beat.py), then compared with intended.json (written by beat-heads.mjs --beat).

  python -I tools/performance/compare-beat.py <mix audio> <intended.json> <work dir> [--reference <stems dir>]

- Where the sound went: each stem's share of the render's energy. Drums the splitter puts in the
  vocals stem don't sound like drums to it.
- Drums: per part, how many intended hits it found (recall) and how many of its hits were
  intended (precision), within one 16th.
- Bass: on the steps the bass should sound, how often the bass stem's pitch class is right.
- Chords: per half bar, how often its chord root is right.
--reference: the song's own stems, to report the same energy shares for the song.
Needs the demucs env (numpy, soundfile, demucs).
"""
import importlib.util
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("transcribe", os.path.join(HERE, "transcribe-beat.py"))
tb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tb)


def shares(stems):
    e = {}
    for name in ("drums", "bass", "other", "vocals"):
        path = os.path.join(stems, name + ".wav")
        if os.path.exists(path):
            x, _ = tb.mono(path)
            e[name] = float((x.astype(np.float64) ** 2).sum())
    total = sum(e.values()) or 1
    return {k: round(100 * v / total, 1) for k, v in e.items()}


def main():
    args = sys.argv[1:]
    ref = None
    if "--reference" in args:
        i = args.index("--reference")
        ref = args[i + 1]
        del args[i:i + 2]
    if len(args) != 3:
        sys.exit(__doc__)
    mix, intended_path, work = args
    os.makedirs(work, exist_ok=True)
    wav = os.path.join(work, "mix.wav")
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", mix, "-ar", "44100", "-ac", "2", wav], check=True)
    subprocess.run([sys.executable, "-m", "demucs", "-n", "htdemucs", "-o", work, wav], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    stems = os.path.join(work, "htdemucs", "mix")
    intended = json.load(open(intended_path))
    bpm, origin = intended["bpm"], intended.get("origin", 0)
    step = 15 / bpm
    want = intended["notes"]

    print("where the sound went (% of energy):", shares(stems))
    if ref:
        print("the song, for comparison:          ", shares(ref))

    xd, sr = tb.mono(os.path.join(stems, "drums.wav"))
    count = int((len(xd) / sr - origin) / step)
    got, kinds = tb.drums(xd, sr, origin, step, count)
    print("drum hits found by kind:", kinds)
    for part in ("kick", "snare", "hats"):
        w = sorted(n["time"] for n in want if n["part"] == part)
        g = sorted(n["time"] for n in got if n["part"] == part)
        if not w and not g:
            continue
        hit = lambda a, b: sum(1 for t in a if any(abs(t - u) <= 1 for u in b))
        rec = hit(w, g) / len(w) if w else float("nan")
        prec = hit(g, w) / len(g) if g else float("nan")
        print(f"  {part:5s}: meant {len(w):4d}, heard {len(g):4d}; found {100 * rec:5.1f}% of the meant hits, {100 * prec:5.1f}% of the heard hits were meant")

    xb, srb = tb.mono(os.path.join(stems, "bass.wav"))
    heard = tb.bass(xb, srb, origin, step, count)
    pc = {}
    for n in heard:
        for k in range(n["time"], n["time"] + n["length"]):
            pc[k] = n["midi"] % 12
    steps_meant = [(k, n["midi"] % 12) for n in want if n["part"] == "bass" for k in range(n["time"], n["time"] + max(1, int(n["length"])))]
    if steps_meant:
        right = sum(1 for k, p in steps_meant if pc.get(k) == p)
        sounding = sum(1 for k, _ in steps_meant if k in pc)
        print(f"  bass : meant on {len(steps_meant)} steps; heard a pitch on {100 * sounding / len(steps_meant):.0f}% of them, the right note on {100 * right / len(steps_meant):.0f}%")

    xo, sro = tb.mono(os.path.join(stems, "other.wav"))
    chords = tb.chords(xo, sro, origin, step, count)
    root = {n["time"]: n["midi"] % 12 for n in chords[::3]}
    meant_roots = {}
    for n in want:
        if n["part"] == "chord":
            meant_roots.setdefault(n["time"] - n["time"] % 8, []).append(n["midi"])
    if meant_roots:
        right = sum(1 for k, ms in meant_roots.items() if root.get(k) == min(ms) % 12)
        heard_any = sum(1 for k in meant_roots if k in root)
        print(f"  chords: meant in {len(meant_roots)} half bars; heard a chord in {100 * heard_any / len(meant_roots):.0f}%, the right root in {100 * right / len(meant_roots):.0f}%")


if __name__ == "__main__":
    main()
