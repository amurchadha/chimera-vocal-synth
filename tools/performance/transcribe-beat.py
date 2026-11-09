"""A song's beat as notes, for the heads to play: from its separated stems (demucs: drums.wav,
bass.wav, other.wav) to a notes file that beat-heads.mjs --beat reads, on the song's own 16th grid.

  python -I tools/performance/transcribe-beat.py <stems dir> out.json [--bpm 148]

- The grid: the tempo (searched near --bpm, or 70-180) and the phase that line the drum onsets up
  with the 16th grid best; step 0 is at `origin` seconds of the recording.
- Drums: every step whose spectrum rises by over 6 dB on average is a hit; the hits are grouped by
  the shape of their rise (k-means, 5 groups) and each group named by where its energy is: strong
  and low = kick, strong and high = snare, weak and topmost = hats, weak and mid = ghost snare.
  Weak low hits (the bass bleeding into the drums) are dropped. A hit well over its group's
  median rise is accented.
- Bass: pitch per frame (YIN on the bass stem, 27-275 Hz); a note per attack (a 6 dB jump) or per
  pitch that settles a semitone away, held while it sounds, its pitch the median after its first
  40 ms (an 808 starts sharp and falls).
- Chords: per half bar, the other stem's pitch classes (110-2000 Hz) against the 24 major and minor
  triads; the best, if it sounds, as three notes.

Output: { bpm, origin, song: true, notes: [{ midi, time, length, part, accent? }] } with time and
length in 16ths from step 0, part kick | snare | ghost | hats | bass | chord. Needs numpy and
soundfile (the demucs env has both). The stems and the output are the song's: keep them private.
"""
import json
import sys

import numpy as np
import soundfile as sf


def mono(path):
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    return x.mean(1), sr


def spectrogram(x, sr, n, hop):
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n).astype(np.float32)
    S = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    return S, np.fft.rfftfreq(n, 1 / sr), (np.arange(len(S)) * hop + n / 2) / sr


def grid(x, sr, near):
    S, f, t = spectrogram(x, sr, 2048, 256)
    L = np.log1p(np.sqrt(S) * 10)
    env = np.maximum(0, np.diff(L, axis=0))[:, (f >= 30) & (f < 12000)].sum(1)
    t = t[1:]
    lo, hi = (near - 4, near + 4) if near else (70, 180)
    best = None
    for bpm in np.arange(lo, hi, 0.01):
        z = (env * np.exp(2j * np.pi * t / (15 / bpm))).sum()
        if best is None or abs(z) > best[0]:
            best = (abs(z), bpm, z)
    _, bpm, z = best
    step = 15 / bpm
    return float(round(bpm, 2)), float((np.angle(z) / (2 * np.pi) * step) % step)


def drums(x, sr, origin, step, count):
    S, f, t = spectrogram(x, sr, 4096, 128)
    edges = np.geomspace(35, 16000, 19)
    D = 10 * np.log10(np.stack([S[:, (f >= a) & (f < b)].sum(1) for a, b in zip(edges[:-1], edges[1:])], 1) + 1e-10)
    rise = np.zeros((count, 18))
    for k in range(count):
        c = origin + k * step
        before, after = (t >= c - 0.06) & (t < c - 0.015), (t >= c - 0.01) & (t < c + 0.05)
        if before.any() and after.any():
            rise[k] = np.maximum(0, D[after].max(0) - D[before].min(0))
    on = np.where(rise.mean(1) > 6)[0]
    X = rise[on] / (np.linalg.norm(rise[on], axis=1, keepdims=True) + 1e-9)
    rng = np.random.default_rng(0)
    best = None
    for _ in range(8):
        C = X[rng.choice(len(X), 5, replace=False)]
        for _ in range(60):
            lab = np.argmin(((X[:, None] - C[None]) ** 2).sum(2), 1)
            C = np.stack([X[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(5)])
        inertia = ((X - C[lab]) ** 2).sum()
        if best is None or inertia < best[0]:
            best = (inertia, lab)
    lab = best[1]
    prof = [rise[on][lab == j].mean(0) for j in range(5)]
    strength = [p.mean() for p in prof]
    names = []
    for p, s in zip(prof, strength):
        low, mid, high, top = p[:4].mean(), p[4:10].mean(), p[10:14].mean(), p[14:].mean()
        if s >= 0.5 * max(strength):
            names.append("kick" if low > top else "snare")
        else:
            names.append("hats" if top >= max(low, mid, high) else "ghost" if mid >= low else None)
    notes = []
    for j, name in enumerate(names):
        if not name:
            continue
        hits = on[lab == j]
        level = rise[hits].mean(1)
        loud = np.median(level) * 1.15
        for k, v in zip(hits, level):
            notes.append({"midi": {"kick": 36, "snare": 38, "ghost": 37, "hats": 42}[name], "time": int(k), "length": 1, "part": name, **({"accent": True} if v > loud else {})})
    summary = {n: int((lab == j).sum()) for j, n in enumerate(names) if n}
    return notes, summary


def yin(x, sr, fmin=27.0, fmax=275.0):
    """f0 per frame (0 = unvoiced) and level, on a copy band-limited to 1 kHz and decimated by 8"""
    X = np.fft.rfft(x)
    X[np.fft.rfftfreq(len(x), 1 / sr) > 1000] = 0
    y = np.fft.irfft(X, len(x))[::8].astype(np.float32)
    r = sr / 8
    W, hop = 512, 64
    fr = np.lib.stride_tricks.sliding_window_view(y, W)[::hop]
    ac = np.fft.irfft(np.abs(np.fft.rfft(fr, 2 * W, axis=1)) ** 2, axis=1)[:, :W]
    d = 2 * (ac[:, :1] - ac)
    d[:, 0] = 0
    cm = d[:, 1:] * np.arange(1, W) / np.maximum(1e-12, np.cumsum(d[:, 1:], axis=1))
    lo, hi = int(r / fmax), int(r / fmin)
    seg = cm[:, lo - 1:hi]
    tau = np.argmin(seg, 1) + lo
    good = seg.min(1) < 0.25
    f0 = np.where(good, r / tau, 0.0)
    rms = np.sqrt((fr ** 2).mean(1))
    t = (np.arange(len(fr)) * hop + W / 2) / r
    return f0, rms, t


def bass(x, sr, origin, step, count):
    """notes start at an attack (a 6 dB jump) or where the pitch settles a semitone away for two
    steps; each note's pitch is the median after its first 40 ms (an 808 starts sharp and falls)"""
    f0, rms, t = yin(x, sr)
    db = 20 * np.log10(rms + 1e-9)
    floor = np.percentile(db, 99) - 30
    midi = np.where(f0 > 0, 69 + 12 * np.log2(np.maximum(f0, 1) / 440), 0)
    pitch = np.zeros(count)
    level = np.full(count, -120.0)
    for k in range(count):
        c = origin + k * step
        m = (t >= c + 0.01) & (t < c + step)
        if not m.any():
            continue
        level[k] = db[m].max()
        v = midi[(t >= c + 0.03) & (t < c + step) & (midi > 0) & (db > floor)]
        if len(v) >= 2:
            pitch[k] = np.median(v)
    starts, k = [], 0
    while k < count:
        if level[k] > floor and pitch[k] > 0:
            a = k
            k += 1
            while k < count and level[k] > floor:
                attack = level[k] - level[k - 1] > 6
                moved = pitch[k] > 0 and abs(pitch[k] - pitch[a]) >= 1 and k + 1 < count and abs(pitch[k + 1] - pitch[k]) < 0.6
                if attack or moved:
                    break
                k += 1
            starts.append((a, k))
        else:
            k += 1
    notes = []
    for a, b in starts:
        c0, c1 = origin + a * step + 0.04, origin + b * step
        v = midi[(t >= c0) & (t < c1) & (midi > 0) & (db > floor)]
        if len(v) < 2:
            v = np.array([pitch[a]])
        notes.append({"midi": int(round(float(np.median(v)))), "time": a, "length": b - a, "part": "bass"})
    return notes


def chords(x, sr, origin, step, count, span=8):
    S, f, t = spectrogram(x, sr, 8192, 1024)
    keep = (f >= 110) & (f < 2000)
    pc = np.round(69 + 12 * np.log2(f[keep] / 440)).astype(int) % 12
    chroma = np.zeros((len(S), 12))
    for c in range(12):
        chroma[:, c] = np.sqrt(S[:, keep][:, pc == c]).sum(1)
    total = chroma.sum(1)
    floor = np.percentile(total, 95) * 0.1
    templates = []
    for root in range(12):
        for third in (4, 3):
            v = np.zeros(12)
            v[[root, (root + third) % 12, (root + 7) % 12]] = 1
            templates.append((root, third, v / np.linalg.norm(v)))
    notes = []
    for k in range(0, count, span):
        a, b = origin + k * step, origin + (k + span) * step
        m = (t >= a) & (t < b)
        if not m.any() or total[m].mean() < floor:
            continue
        c = chroma[m].sum(0)
        c = c / (np.linalg.norm(c) + 1e-9)
        root, third, _ = max(templates, key=lambda tp: float(c @ tp[2]))
        for iv in (0, third, 7):
            notes.append({"midi": 60 + root + iv, "time": k, "length": span, "part": "chord"})
    return notes


def main():
    args = sys.argv[1:]
    near = None
    if "--bpm" in args:
        i = args.index("--bpm")
        near = float(args[i + 1])
        del args[i:i + 2]
    if len(args) != 2:
        sys.exit("usage: transcribe-beat.py <stems dir> out.json [--bpm 148]")
    stems, out = args
    xd, sr = mono(f"{stems}/drums.wav")
    bpm, origin = grid(xd, sr, near)
    step = 15 / bpm
    count = int((len(xd) / sr - origin) / step)
    hits, kinds = drums(xd, sr, origin, step, count)
    xb, srb = mono(f"{stems}/bass.wav")
    line = bass(xb, srb, origin, step, count)
    xo, sro = mono(f"{stems}/other.wav")
    harmony = chords(xo, sro, origin, step, count)
    notes = sorted(hits + line + harmony, key=lambda n: (n["time"], n["midi"]))
    with open(out, "w") as fh:
        json.dump({"bpm": bpm, "origin": round(origin, 4), "song": True, "notes": notes}, fh)
    print(f"{bpm} BPM, step 0 at {origin:.3f} s, {count} steps; drum hits {kinds}; bass notes {len(line)}; chords {len(harmony) // 3}")


if __name__ == "__main__":
    main()
