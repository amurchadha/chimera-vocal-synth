"""Does a rendered performance sound like what it was meant to? It's listened to the way the song
was: split into stems (demucs) and each stem turned into notes (transcribe-beat.py), then compared.

  python -I tools/performance/compare-beat.py <mix audio> <intended.json> <work dir>
         [--song <the song's audio> --map <song-map.json> [--history grades.jsonl --build name] [--words pct]]

Against intended.json (beat-heads.mjs --beat writes it): did the render come out as the notes it
was meant to play? With --song and --map (beat-heads writes song-map.json for a song transcription):
the song itself, cut to the performance's timeline (each stretch from where the map says it comes
from), goes through the same split and transcription, and the two are compared side by side,
section by section. The cut is written to <work dir>/song-cut.wav (it's the song: keep it private).

What it reports:
- where the sound went: each stem's share of the energy (drums the splitter puts in the vocals
  stem don't sound like drums to it);
- drums: per part, recall (how many of the reference's hits it found) and precision (how many of
  its hits the reference has), within one 16th;
- bass: on the steps the reference's bass sounds, how often the pitch class is right;
- chords: per half bar, how often the root is right;
- riff: at the reference's riff notes, how often the render has a riff note of the same pitch
  class within one 16th.
With --song, a grade per instrument (see grades()); --history appends them to a JSON-lines file
and shows each against the previous build's; --words adds the words-heard percentage
(words-heard.py) as the vocal's grade.
Needs the demucs env (numpy, soundfile, demucs).
"""
import importlib.util
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("transcribe", os.path.join(HERE, "transcribe-beat.py"))
tb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tb)
PARTS = ("kick", "snare", "hats")


def separate(audio, work, name):
    wav = os.path.join(work, name + ".wav")
    if audio != wav:
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", audio, "-ar", "44100", "-ac", "2", wav], check=True)
    subprocess.run([sys.executable, "-m", "demucs", "-n", "htdemucs", "-o", work, wav], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return os.path.join(work, "htdemucs", name)


EDGES = np.geomspace(40, 16000, 25)


def band_shape(path):
    """a stem's tone: its average power in third-octave-ish bands, in dB relative to its loudest"""
    x, sr = tb.mono(path)
    S, f, _ = tb.spectrogram(x[: sr * 120], sr, 4096, 2048)
    p = S.mean(0)
    b = np.array([p[(f >= a) & (f < c)].sum() for a, c in zip(EDGES[:-1], EDGES[1:])])
    db = 10 * np.log10(b + 1e-20)
    return np.maximum(db - db.max(), -60)


def listen(stems, step, origin=0.0):
    """a render or a song cut as notes, on the performance's grid"""
    out = {"share": {}}
    total = 0
    for name in ("drums", "bass", "other", "vocals"):
        x, _ = tb.mono(os.path.join(stems, name + ".wav"))
        out["share"][name] = float((x.astype(np.float64) ** 2).sum())
        total += out["share"][name]
    out["share"] = {k: round(100 * v / max(total, 1e-12), 1) for k, v in out["share"].items()}
    out["shape"] = {name: band_shape(os.path.join(stems, name + ".wav")) for name in ("drums", "bass", "other", "vocals")}
    xd, sr = tb.mono(os.path.join(stems, "drums.wav"))
    count = int((len(xd) / sr - origin) / step)
    out["count"] = count
    hits, out["kinds"] = tb.drums(xd, sr, origin, step, count)
    xb, srb = tb.mono(os.path.join(stems, "bass.wav"))
    xo, sro = tb.mono(os.path.join(stems, "other.wav"))
    out["notes"] = hits + tb.bass(xb, srb, origin, step, count) + tb.chords(xo, sro, origin, step, count) + tb.melody(xo, sro, origin, step, count)
    return out


def compare(ref, got, lo=0, hi=None, label=""):
    """got against ref, on steps lo..hi; one line per part"""
    hi = hi if hi is not None else 10 ** 9
    inside = lambda notes, part: [n for n in notes if n["part"] == part and lo <= n["time"] < hi]
    rows = []
    nums = {}
    for part in PARTS:
        w = sorted(n["time"] for n in inside(ref, part))
        g = sorted(n["time"] for n in inside(got, part))
        if not w and not g:
            continue
        near = lambda a, b: sum(1 for t in a if any(abs(t - u) <= 1 for u in b))
        rec = f"{100 * near(w, g) / len(w):3.0f}%" if w else "  - "
        prec = f"{100 * near(g, w) / len(g):3.0f}%" if g else "  - "
        rows.append(f"{part} {len(w)}/{len(g)} found {rec} true {prec}")
        r = near(w, g) / len(w) if w else 0
        q = near(g, w) / len(g) if g else 0
        nums[part] = round(100 * 2 * r * q / (r + q), 1) if r + q else 0.0

    def per_step(notes):
        pc = {}
        for n in notes:
            for k in range(n["time"], n["time"] + max(1, int(n["length"]))):
                pc[k] = n["midi"] % 12
        return pc
    rb, gb = per_step(inside(ref, "bass")), per_step(inside(got, "bass"))
    if rb:
        nums["bass notes"] = round(100 * sum(gb.get(k) == p for k, p in rb.items()) / len(rb), 1)
        rows.append(f"bass {len(rb)} steps: sounds {100 * sum(k in gb for k in rb) / len(rb):3.0f}% right {100 * sum(gb.get(k) == p for k, p in rb.items()) / len(rb):3.0f}%")
    roots = lambda notes: {n["time"] - n["time"] % 8: min(m["midi"] for m in notes if m["time"] == n["time"]) % 12 for n in notes}
    rc, gc = roots(inside(ref, "chord")), roots(inside(got, "chord"))
    if rc:
        nums["chords"] = round(100 * sum(gc.get(k) == p for k, p in rc.items()) / len(rc), 1)
        rows.append(f"chords {len(rc)}: right {100 * sum(gc.get(k) == p for k, p in rc.items()) / len(rc):3.0f}%")
    rm, gm = inside(ref, "melody"), inside(got, "melody")
    if rm:
        gset = {(n["time"], n["midi"] % 12) for n in gm}
        ok = sum(1 for n in rm if any((n["time"] + d, n["midi"] % 12) in gset for d in (-1, 0, 1)))
        rows.append(f"riff {len(rm)}/{len(gm)} right {100 * ok / len(rm):3.0f}%")
        nums["riff"] = round(100 * ok / len(rm), 1)
    if label is not None:
        print(f"  {label}" + ("; ".join(rows) if rows else "nothing"))
    return nums


def grades(song, ours, notes, words=None):
    """one grade per instrument, 0-100, how much it sounds like the song: the notes (hits found and
    true, F1; bass notes, chord roots, riff notes right) and the sound (the stem's tone against the
    song's: 100 - 4 x the mean dB gap over 24 bands; its share of the mix against the song's:
    100 - 3 x the gap in points)"""
    tone = {k: round(max(0.0, 100 - 4 * float(np.abs(song["shape"][k] - ours["shape"][k]).mean())), 1) for k in song["shape"]}
    level = {k: round(max(0.0, 100 - 3 * abs(song["share"][k] - ours["share"][k])), 1) for k in song["share"]}
    g = {
        "kick": notes.get("kick", 0.0),
        "snare": notes.get("snare", 0.0),
        "hats": notes.get("hats", 0.0),
        "drum sound": round((tone["drums"] + level["drums"]) / 2, 1),
        "bass": round((notes.get("bass notes", 0.0) + tone["bass"] + level["bass"]) / 3, 1),
        "chords": round((notes.get("chords", 0.0) + tone["other"]) / 2, 1),
        "riff": notes.get("riff", 0.0),
        "mix balance": round(sum(level.values()) / len(level), 1),
    }
    if words:
        g["words"] = words
    g["overall"] = round(sum(g.values()) / len(g), 1)
    return g


def song_cut(song, mapping, length, out):
    """the song cut to the performance's timeline: each span from its place in the song"""
    x, sr = sf.read(song, always_2d=True)
    step, origin = mapping["step"], mapping["origin"]
    n = int(length * sr)
    y = np.zeros((n, x.shape[1]), np.float32)
    spans = mapping["spans"]
    fade = int(0.01 * sr)
    for i, sp in enumerate(spans):
        a = 0 if i == 0 else int(round(sp["from"] * step * sr))
        b = n if i + 1 == len(spans) else int(round(spans[i + 1]["from"] * step * sr))
        src = int(round((origin + (sp["songStep"] - sp["from"]) * step) * sr)) + a
        seg = np.zeros((b - a, x.shape[1]), np.float32)
        lo, hi = max(0, src), min(len(x), src + (b - a))
        if hi > lo:
            seg[lo - src:hi - src] = x[lo:hi]
        ramp = np.linspace(0, 1, min(fade, len(seg)))[:, None]
        seg[:len(ramp)] *= ramp
        seg[len(seg) - len(ramp):] *= ramp[::-1]
        y[a:b] += seg
    sf.write(out, y, sr)


def main():
    args = sys.argv[1:]
    opt = {}
    for flag in ("--song", "--map", "--history", "--build", "--words"):
        if flag in args:
            i = args.index(flag)
            opt[flag] = args[i + 1]
            del args[i:i + 2]
    if len(args) != 3:
        sys.exit(__doc__)
    mix, intended_path, work = args
    os.makedirs(work, exist_ok=True)
    intended = json.load(open(intended_path))
    step = 15 / intended["bpm"]
    ours = listen(separate(mix, work, "mix"), step, intended.get("origin", 0))
    print("where the sound went (% of energy), ours:", ours["share"])
    print("against the notes it was meant to play:")
    compare(intended["notes"], ours["notes"])
    if "--song" in opt:
        mapping = json.load(open(opt["--map"]))
        cut = os.path.join(work, "song-cut.wav")
        song_cut(opt["--song"], mapping, ours["count"] * step + 1, cut)
        song = listen(separate(cut, work, "song-cut"), step)
        print("where the sound went, the song cut to the same timeline:", song["share"])
        print("against the song itself (song hits/ours; found = the song's we have, true = ours the song has):")
        spans = mapping["spans"]
        overall = compare(song["notes"], ours["notes"], label="all: ")
        for i, sp in enumerate(spans):
            hi = spans[i + 1]["from"] if i + 1 < len(spans) else None
            compare(song["notes"], ours["notes"], sp["from"], hi, label=f"{sp['section']}: ")
        words = float(opt["--words"]) if "--words" in opt else None
        g = grades(song, ours, overall, words)
        prev = None
        hist = opt.get("--history")
        if hist and os.path.exists(hist):
            lines = [json.loads(l) for l in open(hist) if l.strip()]
            prev = lines[-1] if lines else None
        print("grades (how much each sounds like the song, 0-100)" + (f", against {prev['build']}:" if prev else ":"))
        for k, v in g.items():
            was = prev["grades"].get(k) if prev else None
            delta = "" if was is None else f"  ({'+' if v >= was else ''}{v - was:.1f} from {was:.0f})"
            print(f"  {k:12s} {v:5.1f}{delta}")
        if hist:
            with open(hist, "a") as fh:
                fh.write(json.dumps({"build": opt.get("--build", os.path.basename(mix)), "grades": g}) + "\n")


if __name__ == "__main__":
    main()
