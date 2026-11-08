"""How much of a performance a listener (faster-whisper small.en) understands, line by line.

usage: song_wer.py <score.json> <audio> [<audio> ...]

Each caption line of the score (tools/performance format) is cut from each audio file (from
0.1 s before its first word to 0.25 s after its last), transcribed at three start offsets (the
transcriber's score moves with the offset alone; see tools/asr/speech_wer.py) and compared with
the line's words. Prints each file's word error rate (%) over the whole song, and the lines
heard worst. The audio must be time-aligned with the score (a render of it, or the video it
was rendered into). Lyrics stay with the score; this script holds none.
"""
import json
import re
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

SHIFTS = (0.0, 0.07, 0.15)


def words(text):
    text = re.sub(r"[^a-z' ]+", " ", text.lower().replace("’", "'").replace("-", " "))
    return [w.strip("'") for w in text.split() if w.strip("'")]


def edits(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, d[0] = d[0], i
        for j, h in enumerate(hyp, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (r != h))
    return d[len(hyp)]


def load16k(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def main():
    score_path, files = sys.argv[1], sys.argv[2:]
    if not files:
        sys.exit(__doc__)
    lines = json.load(open(score_path))["lines"]
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    for path in files:
        x = load16k(path)
        errs = total = 0
        worst = []
        for line in lines:
            ref = words(" ".join(w["text"] for w in line["words"]))
            a, b = line["words"][0]["start"] - 0.1, line["words"][-1]["end"] + 0.25
            clip = x[max(0, int(a * 16000)):int(b * 16000)]
            e = []
            for s in SHIFTS:
                segs, _ = model.transcribe(np.concatenate([np.zeros(int(s * 16000), np.float32), clip]), language="en", beam_size=5, condition_on_previous_text=False, vad_filter=False)
                heard = " ".join(seg.text for seg in segs)
                e.append(edits(ref, words(heard)))
            errs += sum(e) / len(e)
            total += len(ref)
            worst.append((sum(e) / len(e) / len(ref), " ".join(ref), heard.strip()))
        print(f"{path}: word error rate {100 * errs / total:.1f}% over {total} words")
        for r, ref, heard in sorted(worst, reverse=True)[:3]:
            print(f"   {100 * r:5.0f}%  {ref}  →  {heard}")


if __name__ == "__main__":
    main()
