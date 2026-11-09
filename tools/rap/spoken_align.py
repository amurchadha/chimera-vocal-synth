"""Choose each word's as-spoken form by aligning a recording against all of them.

usage: spoken_align.py <chimera> <vocal.f32> <workdir> <score.json>:<choice.json> [...]
       [--no-offset] [--jobs n] [--beam b] [--retry-beam b] [--max-shift s] [--collect] [--decoys]

For each score (tools/performance format, timed to the recording: a word is at song_offset +
start seconds, or at start with --no-offset), `chimera rap spoken` lists every word's forms
(the dictionary's and the rules' variants of phonetics::spoken). Lines are cut from the vocal
(16 kHz mono float32) in chunks at the score's gaps, every word gets a dictionary entry of its
own holding exactly its forms (so a form that depends on the neighbours is offered only there),
and the Montreal Forced Aligner (english_us_arpa, tools/tsp/mfa.yaml's settings) picks the form
that fits each word. A word MFA places more than --max-shift seconds (default 0.3) from where
the score has it is left out: one of the two timings is wrong there, so the word may be aligned
to another word's sound. --collect reads an earlier run's alignment in <workdir> again (no MFA).
--decoys (a test of the method, not for renders): forms nobody says are offered too, and how often
the aligner takes them is how often it picks a shorter form for no reason: `decoy`, a word of three
or more sounds without its first consonant (not /h/; "cat" as [æt]), and `decoy-end`, one without
its last consonant where no rule drops it (not /t d ŋ/; "cap" as [kæ]), a weak place like the
rules' own.
Writes <choice.json>: {"rules", "words", "choice": {index: form id}} for the words that
aligned, indices and ids only (no word text), the input of `render rap --spoken`;
and <choice>.stats.json: how many words aligned and chose what, per rule (chosen / offered). Only
the forms are taken from the recording; the timing of a render stays its score's own. MFA's
phones last at least 30 ms (3 frames of 10 ms), so a word said faster than that per sound is
stretched there and counted "at MFA's shortest".

One aligner process (MFA's own -j workers); its files stay in <workdir>.
"""
import json
import os
import re
import subprocess
import sys
import wave
from collections import Counter

import numpy as np

SR = 16000
MFA_HOME = os.path.expanduser("~/.cache/chimera-mfa")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# a chunk ends at a gap between lines of at least this much, or before passing MAX_CHUNK seconds
SPLIT_GAP = 0.12
MAX_CHUNK = 9.0
EDGE = 0.2


def token(k, i):
    """A dictionary key of letters only for word i of score k (MFA's text normalisation keeps it)."""
    s = ""
    for _ in range(4):
        s = chr(97 + i % 26) + s
        i //= 26
    return "q" + chr(97 + k) + s


def chunks(lines, offset):
    """Groups of consecutive lines [(first line, last line + 1, t0, t1)], cut mid-gap."""
    spans = [(offset + l["words"][0]["start"], offset + l["words"][-1]["end"]) for l in lines]
    out, a = [], 0
    for b in range(1, len(lines) + 1):
        gap = spans[b][0] - spans[b - 1][1] if b < len(lines) else 9.0
        nxt = spans[b][1] - spans[a][0] if b < len(lines) else 0.0
        if gap >= SPLIT_GAP or nxt > MAX_CHUNK or b == len(lines):
            out.append([a, b])
            a = b
    res = []
    for k, (a, b) in enumerate(out):
        t0 = spans[a][0] - EDGE
        t1 = spans[b - 1][1] + EDGE
        if k > 0:
            t0 = max(t0, (spans[a - 1][1] + spans[a][0]) / 2)
        if k + 1 < len(out):
            t1 = min(t1, (spans[b - 1][1] + spans[b][0]) / 2)
        res.append((a, b, max(0.0, t0), t1))
    return res


def write_wav(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def main(argv):
    opts = {"--jobs": "4", "--beam": "10", "--retry-beam": "40", "--max-shift": "0.3"}
    no_offset = "--no-offset" in argv
    collect = "--collect" in argv
    decoys = "--decoys" in argv
    argv = [a for a in argv if a not in ("--no-offset", "--collect", "--decoys")]
    for k in list(opts):
        if k in argv:
            i = argv.index(k)
            opts[k] = argv[i + 1]
            del argv[i:i + 2]
    if len(argv) < 4:
        sys.exit(__doc__)
    chimera, vocal, work = argv[0], argv[1], os.path.abspath(argv[2])
    pairs = [a.rsplit(":", 1) for a in argv[3:]]
    x = np.fromfile(vocal, np.float32)
    corpus, aligned = f"{work}/corpus", f"{work}/aligned"
    os.makedirs(corpus, exist_ok=True)
    for d in (aligned, f"{work}/root"):
        if os.path.exists(d) and not collect:
            # never delete: an earlier run's output is moved aside
            n = 1
            while os.path.exists(f"{d}.{n}"):
                n += 1
            os.rename(d, f"{d}.{n}")
    dict_lines, scores = [], []
    for k, (score_path, choice_path) in enumerate(pairs):
        forms_path = f"{work}/forms-{k}.json"
        subprocess.run([chimera, "rap", "spoken", score_path, forms_path], check=True, stdout=subprocess.DEVNULL)
        forms = json.load(open(forms_path))
        score = json.load(open(score_path))
        lines = score["lines"]
        offset = 0.0 if no_offset else float(score.get("song_offset", 0.0))
        first = []
        n = 0
        for l in lines:
            first.append(n)
            n += len(l["words"])
        assert n == forms["words"] == len(forms["tokens"]), "the forms don't match the score"
        for i, t in enumerate(forms["tokens"]):
            if decoys:
                d = t["forms"][0]["arpa"].split()
                have = {f["arpa"] for f in t["forms"]}
                if len(d) >= 3 and not d[0][-1].isdigit() and d[0] != "HH" and " ".join(d[1:]) not in have:
                    t["forms"].append(dict(id="decoy", arpa=" ".join(d[1:])))
                if len(d) >= 3 and not d[-1][-1].isdigit() and d[-1] not in ("T", "D", "NG") and " ".join(d[:-1]) not in have:
                    t["forms"].append(dict(id="decoy-end", arpa=" ".join(d[:-1])))
            for f in t["forms"]:
                dict_lines.append(f"{token(k, i)}\t{f['arpa']}")
        cs = chunks(lines, offset)
        for c, (a, b, t0, t1) in enumerate(cs):
            stem = f"s{k}c{c:03d}"
            os.makedirs(f"{corpus}/{stem}", exist_ok=True)
            write_wav(f"{corpus}/{stem}/{stem}.wav", x[int(t0 * SR):int(t1 * SR)])
            toks = [token(k, first[li] + j) for li in range(a, b) for j in range(len(lines[li]["words"]))]
            open(f"{corpus}/{stem}/{stem}.lab", "w").write(" ".join(toks) + "\n")
        starts = [offset + w["start"] for l in lines for w in l["words"]]
        scores.append(dict(k=k, choice=choice_path, forms=forms, chunks=cs, first=first, words=n, starts=starts))
    dict_path = f"{work}/spoken.dict"
    open(dict_path, "w").write("\n".join(dict_lines) + "\n")
    env = dict(os.environ, MAMBA_ROOT_PREFIX=f"{MFA_HOME}/root", MFA_ROOT_DIR=f"{work}/root",
               PATH=f"{MFA_HOME}/env/bin:" + os.environ.get("PATH", ""))
    model = f"{MFA_HOME}/mfa/pretrained_models/acoustic/english_us_arpa.zip"
    # tools/tsp/mfa.yaml's settings (no dither, no speaker adaptation) and the beams
    config = f"{work}/mfa.yaml"
    open(config, "w").write(open(f"{REPO}/tools/tsp/mfa.yaml").read() + f"beam: {opts['--beam']}\nretry_beam: {opts['--retry-beam']}\n")
    cmd = [f"{MFA_HOME}/env/bin/mfa", "align", "-q", "--clean", "-c", config, "-j", opts["--jobs"],
           "--output_format", "json", corpus, dict_path, model, aligned]
    if not collect:
        subprocess.run(cmd, check=True, env=env)
    max_shift = float(opts["--max-shift"])
    for s in scores:
        k, forms = s["k"], s["forms"]
        by_arpa = [{f["arpa"]: f["id"] for f in t["forms"]} for t in forms["tokens"]]
        choice = {}
        failed_chunks, far, floor = 0, 0, 0
        for c, (a, b, t0, t1) in enumerate(s["chunks"]):
            stem = f"s{k}c{c:03d}"
            path = f"{aligned}/{stem}/{stem}.json"
            if not os.path.exists(path):
                failed_chunks += 1
                continue
            tiers = json.load(open(path))["tiers"]
            phones = [p for p in tiers["phones"]["entries"] if p[2] not in ("", "sil", "sp", "spn", "<eps>")]
            for w0, w1, label in tiers["words"]["entries"]:
                m = re.fullmatch(r"q([a-z])([a-z]{4})", label)
                if not m or ord(m.group(1)) - 97 != k:
                    continue
                i = 0
                for ch in m.group(2):
                    i = i * 26 + ord(ch) - 97
                ps = [p for p in phones if p[0] >= w0 - 1e-6 and p[1] <= w1 + 1e-6]
                arpa = " ".join(p[2] for p in ps)
                if abs(t0 + w0 - s["starts"][i]) > max_shift:
                    far += 1
                    continue
                # every phone at MFA's shortest (3 frames): the word had no room, its choice is weak
                floor += int(bool(ps) and all(p[1] - p[0] < 0.0305 for p in ps))
                if arpa in by_arpa[i]:
                    choice[str(i)] = by_arpa[i][arpa]
        ids = Counter(choice.values())
        per_rule, offered = Counter(), Counter()
        for i, t in enumerate(forms["tokens"]):
            rules = {r for f in t["forms"][1:] for r in f["id"].split("+")}
            for r in rules:
                offered[r] += 1
            if str(i) in choice and choice[str(i)] != "dict":
                for r in choice[str(i)].split("+"):
                    per_rule[r] += 1
        with_variants = sum(1 for t in forms["tokens"] if len(t["forms"]) > 1)
        aligned_with_variants = sum(1 for i, t in enumerate(forms["tokens"]) if len(t["forms"]) > 1 and str(i) in choice)
        stats = dict(words=s["words"], chunks=len(s["chunks"]), failed_chunks=failed_chunks, aligned=len(choice),
                     left_out_far=far, at_floor=floor,
                     with_variants=with_variants, aligned_with_variants=aligned_with_variants,
                     chose_variant=sum(v for k2, v in ids.items() if k2 != "dict"),
                     by_id=dict(ids.most_common()), by_rule={r: [per_rule[r], offered[r]] for r in sorted(offered)})
        json.dump(dict(rules=forms["rules"], words=s["words"], choice=choice), open(s["choice"], "w"), indent=0)
        json.dump(stats, open(s["choice"].removesuffix(".json") + ".stats.json", "w"), indent=1)
        print(f"{s['choice']}: {len(choice)}/{s['words']} words aligned ({failed_chunks}/{len(s['chunks'])} chunks failed, "
              f"{far} left out > {max_shift} s from the score's time, {floor} at MFA's shortest); "
              f"{stats['chose_variant']} chose a variant of {aligned_with_variants} aligned words that had one")
        print("  per rule (chosen / offered): " + ", ".join(f"{r} {a}/{b}" for r, (a, b) in stats["by_rule"].items()))


if __name__ == "__main__":
    main(sys.argv[1:])
