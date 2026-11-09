"""Which lines of a performance come out as words? Whisper (faster-whisper small.en, word times)
listens to the rendered voice, one line at a time; each score word counts as heard when Whisper wrote the same word
within 0.6 s of where the score puts it. Prints the lines worst first, by time and section and
never by their words (scores may be of songs that can't be published).

  python -I tools/performance/words-heard.py <voice.wav> <score.json> [out.json]

score.json: the score the voice was rendered from, at its rendered times (beat-heads.mjs writes it
to <out>.parts/score.json). out.json gets every line's numbers, with the missed words' indexes.
Needs the Whisper env (tools/asr/setup.sh, or any env with faster-whisper); the model is looked up
in HF_HOME.
"""
import json
import re
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel


def norm(t):
    return re.sub(r"[^a-z0-9]", "", str(t).lower())


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    wav, score_path = sys.argv[1:3]
    out = sys.argv[3] if len(sys.argv) > 3 else None
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", wav, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], check=True, capture_output=True).stdout
    x = np.frombuffer(raw, np.float32)
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    score = json.load(open(score_path))
    # line by line (each line's span and 0.4 s either side): over a whole song, Whisper's long-form
    # decoding drops tens of seconds at a time once it loses the thread, which reads as silence
    heard = []
    for line in score["lines"]:
        a = max(0.0, line["words"][0]["start"] - 0.4)
        b = max(w["end"] for w in line["words"]) + 0.4
        clip = x[int(a * 16000):int(b * 16000)]
        segs, _ = model.transcribe(clip, language="en", beam_size=1, temperature=0, word_timestamps=True, condition_on_previous_text=False, vad_filter=False)
        heard += [(norm(w.word), a + w.start, a + w.end) for s in segs for w in (s.words or [])]
    lines = []
    total = got = 0
    for i, line in enumerate(score["lines"]):
        ws = line["words"]
        missed = []
        for j, w in enumerate(ws):
            t = norm(w.get("text", ""))
            if not t:
                continue
            ok = any(h == t and abs(s - w["start"]) < 0.6 for h, s, _ in heard)
            if not ok:
                missed.append(j)
        n = sum(1 for w in ws if norm(w.get("text", "")))
        total += n
        got += n - len(missed)
        lines.append({"line": i, "section": line.get("section", ""), "start": round(ws[0]["start"], 2), "end": round(max(w["end"] for w in ws), 2), "words": n, "heard": n - len(missed), "missed": missed})
    by_sec = {}
    for l in lines:
        a = by_sec.setdefault(l["section"], [0, 0])
        a[0] += l["heard"]
        a[1] += l["words"]
    print(f"heard {got} of {total} words ({100 * got / max(1, total):.0f}%); Whisper wrote {len(heard)} words")
    for sec, (h, n) in by_sec.items():
        print(f"  {sec or 'section'}: {100 * h / max(1, n):.0f}% ({h}/{n})")
    print("worst lines (time in the render, section, words heard):")
    for l in sorted(lines, key=lambda l: (l["heard"] / max(1, l["words"]), l["start"]))[:12]:
        print(f"  {int(l['start'] // 60)}:{l['start'] % 60:05.2f}  line {l['line']:2d}  {l['section'][:16]:16s} {l['heard']:2d}/{l['words']:2d}")
    if out:
        json.dump({"heard": got, "words": total, "lines": lines}, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
