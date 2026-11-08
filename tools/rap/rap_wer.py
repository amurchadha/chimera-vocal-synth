"""Rap intelligibility, scored by Whisper: each verse in tools/rap/verses.tsv is put on a 148 BPM
grid at 2, 3 and 4 syllables per beat (eighths, triplets, sixteenths: about 4.9, 7.4 and 9.9
syllables a second), rendered with `chimera render rap` and transcribed with faster-whisper
(small.en, greedy, as tools/asr/speech_wer.py) at five start offsets, and the word errors are
averaged.

usage: rap_wer.py <outdir> [--engine new|old] [--timing even|klatt] [--speedup x] [--body male]
                  [--against earlier/rap.json]
--engine old renders with tools/performance/voice-only.mjs: the TypeScript voice the performance
renderer uses (set CHIMERA_TS_ENGINE as its README says; male only, its own timing).
RAP_RATES=natural,eighths,... picks the rates ("natural": Klatt speech timing, a control).

The verses are our own and not in any song, so Whisper can't fill words in from memory.
"""

import json
import os
import re
import subprocess
import sys
import wave
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
RATES = {"eighths": 2, "triplets": 3, "sixteenths": 4}
if os.environ.get("RAP_RATES"):
    RATES = {k: v for k, v in {"natural": 0, **RATES}.items() if k in os.environ["RAP_RATES"].split(",")}
BPM = 148
SHIFTS = (0.0, 0.07, 0.15, 0.23, 0.31)


def words(text):
    text = re.sub(r"[^a-z' ]+", " ", text.lower().replace("’", "'"))
    return [w.strip("'") for w in text.split() if w.strip("'")]


def edits(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, d[0] = d[0], i
        for j, h in enumerate(hyp, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (r != h))
    return d[len(hyp)]


def load16k(path):
    with wave.open(path) as w:
        ch, rate = w.getnchannels(), w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768.0
    x = x.reshape(-1, ch).mean(axis=1)
    n = int(round(len(x) * 16000 / rate))
    return (np.fft.irfft(np.fft.rfft(x)[: n // 2 + 1], n) * (n / len(x))).astype(np.float32)


def opt(args, name, default):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i : i + 2]
        return v
    return default


def main():
    args = sys.argv[1:]
    timing = opt(args, "--timing", "even")
    speedup = opt(args, "--speedup", None)
    engine = opt(args, "--engine", "new")
    body = opt(args, "--body", "male")
    against = opt(args, "--against", None)
    out = args[0]
    os.makedirs(out, exist_ok=True)
    verses = [(l.rstrip("\n").split("\t") + ["train"])[:2] for l in open(os.path.join(HERE, "verses.tsv")) if l.strip()]
    chimera = os.path.join(REPO, "target/release/chimera")
    jobs = [(rate, i, text, part, os.path.join(out, f"{rate}-{i + 1:02d}")) for rate in RATES for i, (text, part) in enumerate(verses)]

    def render(job):
        rate, _, text, _, stem = job
        subprocess.run([chimera, "rap", "score", stem + ".json", str(BPM), str(RATES[rate]), "110", text], check=True, capture_output=True)
        if engine == "old":
            cmd = ["bun", os.path.join(REPO, "tools/performance/voice-only.mjs"), stem + ".json", stem + ".wav"]
        else:
            cmd = [chimera, "render", "rap", stem, stem + ".json", body, "--timing", timing] + (["--speedup", speedup] if speedup else [])
        r = subprocess.run(cmd, check=True, capture_output=True, text=True)
        return [l.split(": ", 1)[1] for l in r.stdout.splitlines() if l.startswith("too fast")]

    with ThreadPoolExecutor(max_workers=4 if engine == "old" else os.cpu_count()) as ex:
        overfull = list(ex.map(render, jobs))
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    rows = []
    for (rate, i, text, part, stem), over in zip(jobs, overfull):
        x = load16k(stem + ".wav")
        x = x[max(0, int(np.argmax(np.abs(x) > 0.01)) - 1600):]  # 0.1 s of silence before the voice
        ref = words(text)
        heard, errs = [], []
        # the same audio shifted by a few hundredths of a second can go from 0 to 6 errors in 12
        # words (Whisper's frames fall differently), so every take is heard at several offsets
        for shift in SHIFTS:
            segs, _ = model.transcribe(np.concatenate([np.zeros(int(shift * 16000), np.float32), x]), language="en",
                                       beam_size=1, temperature=0.0, condition_on_previous_text=False, vad_filter=False)
            heard.append(" ".join(s.text.strip() for s in segs))
            errs.append(edits(ref, words(heard[-1])))
        rows.append({"rate": rate, "verse": i + 1, "set": part, "text": text, "heard": heard,
                     "errors": sum(errs) / len(errs), "words": len(ref), "overfull": over[0] if over else ""})
    summary = {}
    for rate in RATES:
        for part in ("train", "held"):
            r = [x for x in rows if x["rate"] == rate and x["set"] == part]
            summary[f"{rate}/{part}"] = round(100.0 * sum(x["errors"] for x in r) / max(1, sum(x["words"] for x in r)), 1)
    result = {"engine": engine, "timing": timing, "speedup": speedup, "body": body, "wer": summary, "rows": rows}
    json.dump(result, open(os.path.join(out, "rap.json"), "w"), indent=1)
    base = json.load(open(against))["wer"] if against else {}
    print(f"engine {engine}" + ("" if engine == "old" else f", timing {timing}, speedup {speedup or 'off'}") + f", {body}: word error rate %")
    for k, v in summary.items():
        print(f"  {k:18s} {v:5.1f}" + (f"   (was {base[k]:5.1f})" if k in base else ""))


if __name__ == "__main__":
    main()
