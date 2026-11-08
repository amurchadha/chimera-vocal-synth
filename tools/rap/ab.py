"""Old voice vs new voice on one performance score, line by line.

usage: python3 tools/rap/ab.py <score.json> <outdir> [backing.wav]

Renders the score with the performance renderer's TypeScript voice (tools/performance/
voice-only.mjs; set CHIMERA_TS_ENGINE as its README says) and with `chimera render rap`, then
writes <outdir>/ab.m4a: each caption line twice, old then new, with a short gap between, and
old.wav / new.wav whole. With a backing track (aligned to time zero) both are mixed over it as
render.mjs mixes it (the bed at 0.27).

Keep scores of songs we have no rights to out of git (public/shows/ is gitignored).
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))


def run(cmd):
    subprocess.run(cmd, check=True)


def main():
    score_path, out = sys.argv[1], sys.argv[2]
    backing = sys.argv[3] if len(sys.argv) > 3 else None
    os.makedirs(out, exist_ok=True)
    old, new = os.path.join(out, "old.wav"), os.path.join(out, "new.wav")
    run(["bun", os.path.join(REPO, "tools/performance/voice-only.mjs"), score_path, old])
    run([os.path.join(REPO, "target/release/chimera"), "render", "rap", new[:-4], score_path])
    if backing:
        for f in (old, new):
            mixed = f[:-4] + "-mix.wav"
            run(["ffmpeg", "-v", "error", "-y", "-i", f, "-i", backing, "-filter_complex",
                 "[1:a]volume=0.27[bed];[0:a][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false[a]",
                 "-map", "[a]", mixed])
        old, new = old[:-4] + "-mix.wav", new[:-4] + "-mix.wav"
    lines = json.load(open(score_path))["lines"]
    parts = []
    for i, line in enumerate(lines):
        t0 = max(0.0, line["words"][0]["start"] - 0.3)
        t1 = line["words"][-1]["end"] + 0.4
        for tag, src in (("old", old), ("new", new)):
            clip = os.path.join(out, f"line{i + 1:02d}-{tag}.wav")
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t0:.3f}", "-to", f"{t1:.3f}", "-i", src, "-ac", "1", "-ar", "48000", clip])
            parts.append(clip)
    gap = os.path.join(out, "gap.wav")
    run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "0.7", gap])
    listing = os.path.join(out, "list.txt")
    with open(listing, "w") as f:
        for p in parts:
            f.write(f"file '{p}'\nfile '{gap}'\n")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c:a", "aac", "-b:a", "128k",
         os.path.join(out, "ab.m4a")])
    print("wrote", os.path.join(out, "ab.m4a"), f"({len(lines)} lines, old then new)")


main()
