# Hill-climb log

The rules are in [README.md](README.md). Entries are in order, newest last.

## Baseline (2026-11-07)

- **Singer:** training score 1.433, held-out 1.590. 0 means every term is within her own
  variation; lower is better.
- **Speech:** word error rate 38.7 %. Harvard sentences 32.5 % (male) and 37.5 % (female);
  nonsense sentences 47.9 % and 38.0 %.
- **Speed:** the voice takes 18.3 % of one core in real time (`os=2`).

## Leads

The largest costs at the baseline, and what they point at. When an experiment closes a lead or
opens a new one, update this list and give the experiment's number.

1. **Spectral tilt and the fundamental.** Costs: level 4–8 kHz 5.4, H1−H2 2.1, level 2–4 kHz
   1.4, level 0–0.5 kHz 1.4.
   - Too much energy above 2 kHz and too little below 500 Hz, on every vowel.
   - H1−H2 is too low on low notes (−5.8 dB, she has +4.0) and too high on high ones (+8.2 dB,
     she has +0.1).
   - Together they sound like a source that is too pressed. Look at the open quotient, skew and
     closure sharpness, and at how they vary with pitch and effort
     (`crates/chimera/src/sources/glottis.rs`, and how `voice/human_voice.rs` drives it).
   - Experiment 2 softened the closure: the 2–4 and 4–8 kHz costs fell to 0.13 and 0.68, so the
     high bands are about done. H1−H2 (2.21) and level 0–0.5 kHz (1.32) did not move: they are
     not the closure. They point at the open quotient and how it follows pitch: the synth's
     H1−H2 rises with pitch where hers falls.
   - Experiment 3 opened a small posterior chink: level 0–0.5 kHz 1.32 → 1.14, H1−H2 only
     2.21 → 2.14. What is left of H1−H2 is how it follows pitch and vowel, not its level. By
     vowel class and pitch, the synth's H1−H2 swings two to three times as far as hers as the
     harmonics cross F1: close vowels −9 → +23 dB from MIDI 56 to 68 (hers 1 → 11), mid vowels
     −10 → +14 from 60 to 72 (hers 5 → −3). The tract's closed-glottis F1 bandwidths are 35–70 Hz
     (female body). Two candidates: a wider F1 bandwidth (wall resistance: doubling
     `WALL_SOFT.resistance` raises B1 by about half but lowers F1 by 10–20 Hz, so the vowel tables
     need `chimera calibrate`), or F1 that follows pitch (singers open the jaw on high notes).
2. **Aperiodicity.** Cost 2.9: the synth's is about twice hers. Look at jitter, shimmer, drift
   and aspiration noise in the source. She is a clean, trained voice.
   - Experiment 1 lowered the jitter: cost 1.74. Most of what is left comes from a few songs with
     voicing trouble (en043a 0.05, en018a 0.03), not from the source's median: with jitter and
     shimmer at zero the cost stays at 1.30. Lowering shimmer raises note MCD past its guard.
3. **Phrase onsets.** Costs: vowel-initial 1.4, voiceless-initial 1.1.
   - Voicing starts about 20 ms early before a vowel.
   - Before /s/, /f/ and /h/ the synth voices 100–130 ms before the note, so the voicing runs
     into the fricative or comes before it.
   - Look at how a phrase starts: the 60 ms lead in `plan_song`, and the glottal abduction of a
     voiceless onset.
   - Experiment 4 held the folds open from the in-breath to the first voiced segment: WORSE. With
     the glottis open, the breath (which reaches full pressure 20 ms before the first segment)
     blows a loud [h] before the vowel or the onset consonant, and the detector reads it as voicing
     100–150 ms early. The cause is upstream: the breath arrives before the first articulation is
     in place. Next angle: start the breath ramp with the first segment's closure or constriction
     (`breath` gesture in `plan_utterance`), not 60 ms ahead of it, and leave the folds alone.
   - Experiment 10 timed a sung phrase's breath to reach full drive as its first segment starts
     (20 ms later than before): vowel-initial cost 1.49 → 0.97 (median −0.016 → +0.004 s, hers
     +0.005), voiceless-initial 1.08 → 0.52 (−0.020 → +0.037 s, hers +0.018). The medians are
     about right now; what is left is the mean gap, so a few phrases far off (the /s/, /f/, /h/
     onsets voiced well before the note, and the phrase-initial stops that never phonate, lead 5).
4. **Vibrato.** Costs: rate 0.67, share 0.62. The synth puts 35-cent vibrato on every long note
   at 5.5 Hz. She uses it on about two thirds of her long notes, at about 6.1 Hz
   (`vibrato_gesture` in `crates/chimera/src/phonetics/sing.rs`).
   - Experiment 5 raised the rate to 5.9–6.1 Hz: rate cost 0.66 → 0, score −0.044, but WORSE on
     the fewer-notes guard (barely voiced short notes, lead 5). Retry it once lead 5 is fixed.
   - The like-for-like judge (after experiment 6) and experiment 8 have both cleared the way: retry
     it as it was. Rate cost is 0.64 at experiment 8.
   - Experiment 9 kept 6.0 Hz: rate cost 0.64 → 0. What is left is the share (0.65): the synth puts
     vibrato on every long note, she on about two thirds. That is a planner choice
     (`vibrato_gesture`), not the source's.
5. **Voicing in held notes.** Cost 0.26. Gaps mid-note, worst in en018a, en041a and en043a
   (0.65–0.70 voiced).
   - The same fault blocks other experiments (1, 3, 5): short notes on a stop coda that the synth
     voices 0–12 % of the time, so one stray voiced frame decides whether H1−H2 and pitch are
     measured. Any change to the sound flips a few of them either way, and the fewer-notes guard
     calls a loss WORSE. Fixing these notes is the most useful next step.
   - Experiment 6 found the main cause: 315 of the 368 notes the synth voices under 30 % (she
     voices them over 70 %) are a phrase's last note. `plan_song` ends a phrase's last vowel up to
     120 ms (30 % of the note) before the note's end to leave a breath, though callers already
     split phrases at rests. Holding the note to 50 ms before its end: score 0.889 → 0.747, voiced
     share and aperiodicity costs to about 0. WORSE only on the fewer-notes guard, through two
     phrase-initial notes the synth never voices (below). Retry it once those voice.
   - The note that blocks it, en044a no. 145 "pæ" at 63.77 s (phrase-initial, 0.18 s, then
     "dwi"): the /p/ burst and aspiration are there (63.76–63.84 s), then 50 ms at −55 dB, about
     25 dB below the aspiration, where the vowel should be, and voicing starts only with the next
     note's /d/. The vowel never phonates after a phrase-initial voiceless stop. Its old "onset"
     was a stray frame 80 ms before the note. en036a no. 71 "ki" is the same shape. Look at why the
     folds don't start after the stop's abduction at a phrase start (lead 3's breath timing, or the
     abduction gesture's release).
   - Experiment 7 retried experiment 6 at r = 0.05 under the like-for-like judge: BETTER (0.889 →
     0.747), speech and speed OK, but reverted on a test. `songs_match_typescript` in
     `crates/chimera/tests/golden_planning.rs` checks `plan_song` against TypeScript-era plans in
     `tests/golden/planning.json`, which `CHIMERA_BLESS` doesn't regenerate, so it fails on any
     change to how songs are planned. The change is ready to keep once the owner decides how that
     fixture may be updated (a bless path for the song plans, or an exception in the rules like the
     airway one). Until then, no `plan_song` change can be kept.
   - Experiment 8 kept it, once the planners' snapshots were blessed: voiced share cost 0.26 →
     0.04, aperiodicity 0.90 → 0.03. This lead is about closed. What is left is the phrase-initial
     notes that never phonate after a voiceless stop (en044a no. 145, en036a no. 71), which is
     lead 3's.
6. **Speech consonants.** Not scored, only guarded. Whisper mishears /tʃ/, /dʒ/, /ʃ/ and /s/:
   "sheet" as "feet", "chicken leg" as "quickly like", "juice" as "roost". This is for a later
   loop on speech.
   - Experiment 11 found why /ʃ/ is heard as /f/: the chamber in front of the raised tongue tip
     (under the alveolar ridge, and the sublingual space) took the mid-oral area law, ~5.5 cm²,
     so the front-cavity resonance that the teeth source excites sat at 1.7 kHz (male) and
     2.1 kHz (female). A narrower law for the rays ahead of the tip: speech 40.73 → 35.76 %
     (BETTER), singer guards pass, but reverted on `geometry_continuity` (an existing jump at
     the top of the pharynx that the recalibrated child /ə/ lands on). Fix that jump, then keep
     experiment 11 as it was. The /ʃ/ is still about 21 dB below the vowel (female), as loud as
     /f/: its level is the next thing to look at.
   - Experiment 12 kept it (α = 1.6), together with the fix for that jump: the roof-contact
     model's shortcut ignored how far a ray ends off the roof (the velopharyngeal port window).
     Speech 40.73 → 36.09 %. "Sheet" is now heard in the male voice. Still failing: the female
     "sheet", chair, chain, birch and chopped. Next: the /ʃ/'s level (teeth source gain, or
     `w_dist` near 2.5 cm), then α = 1.2.
   - Experiment 13 found `w_dist` is not the cause (both bodies' /ʃ/ get full weight), and that
     in both voices /ʃ/ is no louder than /f/, where real sibilants are about 10 dB louder.
     Doubling the teeth (obstacle) source makes the female "sheet" heard right, but the louder
     sibilants in the songs push note MCD 0.008 dB past its guard, and the speech total doesn't
     move (36.09 → 36.75 %). The female's fricatives are about 10 dB lower re her vowel than
     the male's: about 5 dB from her glottal source (vowels too loud for her fold size), about
     5 dB from the body scale.
   - Experiment 15 fixed the affricates' timing in the renders: a voiceless affricate's /ʃ/
     constriction now held until the folds close, so the 50 ms [h] after a 35–40 ms frication
     became 70–80 ms of /ʃ/ at the /ʃ/'s own level. "Chain" (male) was heard right, "chicken"
     (female) too once the vowel after /tʃ/ got the stop's aspiration allowance, but the total
     didn't move (36.09 → 37.09 %): the male "chicken" lost its short /ɪ/, and the female /tʃ/,
     though well formed, is still about 20 dB below her vowel. The affricates are now limited by
     the same thing as /ʃ/: the female fricative level. The patch is logged in experiment 15, so
     it can be retried with a fix for that level.
   - Experiment 20 found why /ʃ/ is 2–3 dB below /s/: not the teeth source's level or weights
     (its Re² term is about 1 dB higher for /ʃ/, and `w_jet` and `w_dist` are 1 except for one
     case), but its spectrum. The source is white to 5 kHz, and the radiation's +6 dB/octave
     favours /s/'s higher peak. The one weight case is the female /ʃ/ before /ɑ/: `w_dist` 0.78,
     because the jet's distance was measured from the channel's narrowest section rather than its
     exit. Fixing that lifts it 2.4 dB but misses "sheet" (already at full weight), and speech
     reads NO CLEAR CHANGE. Next angle: a teeth-source band that follows the jet's v/D (see its
     "Next"). It also found the judge is chaotic: renders 50–100 dB below the signal apart flip
     Whisper's words, so about ±2 points of any small change's total is noise.
   - Batch 3. Experiment 21 aspirated voiceless stops in onset clusters (/pl kw tɹ/): "quiet"
     heard in both voices, but NO CLEAR CHANGE; the patch waits as a passenger. Experiment 22
     kept a narrower, backed /w/ (male F2 about 990 → 700 Hz): speech 39.74 → 38.08 %. Open: the
     dark /l/ of "cold" (F2 1320, F3 about 1930 Hz in a probe), heard as "coated" in both voices.
   - Batch 3 under the real-speaker judge (TSP). Experiment 23 (experiment 15's affricate patch)
     helps every male affricate term but breaks the female centroid tʃ: her /ʃ/ resonance is
     about 1 kHz low (experiment 24's band table). Experiment 24 (teeth gain 3.5–4.0e-6) lowers
     the score but breaks θ, the /d/ burst or alignment terms. Experiment 25 kept the female
     pulse at her fold size (0.64 of the male's): every female obstruent about 1.8 dB louder
     against her vowels, TSP 1.584 → 1.517.
   - Experiment 28 kept the teeth source's band following the jet's 1/√A (5 kHz at the male
     /ʃ/'s 0.2 cm², bounded at the body's /s/) with experiment 23's affricate patch: TSP 1.517 →
     1.342, male 0.974 → 0.833 (level tʃ 4.27 → 2.14, centroids s 2.71 → 2.15, z 3.14 → 2.49).
     Each part alone broke a term (26: the male tʃ and dʒ centroids; 23: the female tʃ centroid;
     27, both with a 10 kHz cap: the male dʒ centroid). The male /s z/ centroids that remain
     (4424 and 4059 Hz against 5725 and 5117) are the front cavity's: see experiment 28's "Next".

7. **Stressed vowels in running speech (target 2).** The planned durations are not what
   crushes them. Experiment 14 printed `plan_phrases`' segments: the stressed /ʊ/ of "pushes" is
   planned at 121 ms, "eats" /i/ 93, "sweet" /i/ 110, "paints" /eɪ/ 158, "steady" /ɛ/ 123,
   "reads" /i/ 119, in line with Klatt's rules for connected speech. The loss is in how
   the gestures realise the plan:
   - after an aspirated stop, about 50 ms of the vowel is aspiration (the "pu" of "pushes" voices
     from 0.90 s, planned 0.847);
   - before a voiceless fricative, the abduction is complete 15 ms before the fricative's onset,
     so voicing stops 30–35 ms early;
   - before a stop, the closure lands about 17 ms early ("eats", "sweet"), and the vowel's
     energy falls over the 30 ms before it.
   Experiment 14 retimed the fricative abduction later: WORSE, since the fricative onsets get
   weaker. Leave that timing alone. What's left to try: lengthen the stressed vowel in the plan
   itself (the aspiration allowance is 20 ms against a 50 ms VOT), or the stop-closure lead (it
   moves every stop and the sung consonants, so watch the singer's timing guard).
   - Experiment 17 measured both. The closure lead varies by vowel (/t/ lands 7 ms early after
     /i/, 23 ms late after /ɑ/), but aiming it later doesn't save the /i/. The /i/ of "sweet" and
     "eats" undershoots: the /w/ and /ɝ/ before it hold the tongue body to their ends. Length is
     the lever: an aspiration allowance of 50 ms (the VOT), given only where the stop is
     aspirated, fixes "paints" in both voices, but the total stays at 36.09 %. See its "Next".

8. **The pop on "sharp" (target 3).** Closed by experiment 16: the /t/, its tip already raised
   by the /ɹ/, sealed 19 ms early behind the closed lips and the tongue and jaw pumped the
   trapped air to 10.5x the lungs'. Aimed 25 ms later, it seals as the lips open (1.3x,
   −6.8 dB). Other front-to-back clusters after a vowel (/pk/, /bd/, /tk/) still reach 3–6x;
   see experiment 16's "Next".

9. **How a spoken utterance begins, and a click on every /f/ and /v/.** Experiment 18. Speech's
   breath lead (full drive 20 ms before the first segment) is not what loses the first word:
   timed like a sung phrase's it moves the first vowel's voicing 20 ms later and no first-word
   error changes. What it found instead is a geometry click on every /f/ and /v/ (−15 dB at a
   phrase start, −10 dB mid-word, louder than the vowels) from two steps in the labiodental
   geometry (`anatomy/human.rs`). The fix removes it and keeps the held /f/ within 1 dB, but
   Whisper's total doesn't move (36.09 → 37.09 %). The click is closed by experiment 19, which
   kept experiment 18's patch under the artifact keep rule (`an_f_does_not_click` passes, +0.3
   to +4.6 dB). The first-word errors stay open; see experiment 18's "Next".
10. **Rap contrast at speed (experiments 29–32).** The consonants of a rap at 9 syllables a
    second measure as loud against the vowels as the vowels themselves, but their own level is
    the same fast and slow: the loss is the vowels'. They lose voicing to fixed-length glottal
    gestures (29, 30) and their ends to the consonants' strength-40 ramps (32). None was kept;
    see "Rap contrast (2026-11-08)" at the end.

## Experiments

### 1. A trained singer's jitter, not a clinical one (kept)

- Hypothesis: at the default roughness (0.1), which the comparison sings with, the source
  jittered 0.65 % and shimmered 4.2 % per cycle. Those values are near the clinical thresholds
  (MDVP: 1.04 % and 3.81 %), and the synth's YIN aperiodicity was twice hers (0.010 against
  0.005). A healthy trained voice has about 0.3–0.5 % jitter. Less jitter should lower
  aperiodicity and leave the spectrum alone.
- Change: `apply_source` in `crates/chimera/src/voice/human_voice.rs`: jitter
  `0.003 + 0.035·roughness` → `0.0021 + 0.0245·roughness` (0.45 % at 0.1, 2.7 % at 1).
  Shimmer unchanged. Tried, against the baseline:
  - jitter and shimmer both 0 (diagnostic only): 1.173, aperiodicity cost 1.30; WORSE, note MCD
    +0.86 dB. The averaged log-mel spectra need some perturbation between the harmonics.
  - jitter 0.35 %, shimmer 2.3 %: 1.157; WORSE, note MCD +0.24 dB, and one note fewer for en016a's
    voiceless onsets.
  - jitter 0.35 %, shimmer unchanged: 1.201, MCD +0.06; WORSE on the en016a note alone.
  - jitter 0.45 %, shimmer unchanged: 1.245; BETTER. Kept.
  - The en016a note (no. 100, "tak" at 58.59 s) is a note the synth never voices (0 % voiced in
    the baseline too). Its onset was one stray voiced frame 70 ms before the note, and any change
    to the random sequence can drop it. The guard decided; the gap is a voicing fault (lead 5).
- Singer: training score 1.433 → 1.245 (−0.188 like for like), held-out 1.590 → 1.402.
  Aperiodicity cost 2.88 → 1.74 (synth median 0.010 → 0.008; held-out cost 2.09 → 0.96). Note MCD
  9.243 → 9.288 dB. No other term moved by more than 0.02.
- Speech: word error rate 38.74 → 39.07 % (OK).
- Speed: `os=2` 18.4 % → 18.5 %.
- Tests: pass. Two things for the batch PR:
  - `CHIMERA_BLESS=1 cargo test --workspace` stops at the first failing test binary. `engine.rs`
    reads `beatbox-bar.f32` and fails before `golden_planning` can bless it, so bless with
    `--no-fail-fast`.
  - `golden_analysis` checks the power spectrum of `voice-sustain-male.f32` against TypeScript-era
    numbers in `analysis.json`. Once the voice fixtures are re-blessed it fails on any change to
    the sound. The PR has to update that expectation or analyse a fixed signal instead.
- Commit: 2c41618.
- Next: don't lower shimmer again: the note MCD guard is close. The rest of the aperiodicity cost
  is in songs with voicing gaps (en043a, en018a), which is lead 5, and the largest single cost is
  still level 4–8 kHz (lead 1).

### 2. The folds close over a return phase, not at a corner (kept)

- Hypothesis: at tension 0.55, which the comparison sings with, the glottal area pulse closed
  with sharpness 0.635: close to a hard corner, as if the folds met all at once. Real folds close
  along their length and depth over a return phase, so the source spectrum falls faster above
  about 1 kHz. The synth had 7.5 dB too much at 4–8 kHz and 4.4 dB too much at 2–4 kHz, on every
  vowel. A softer closure should lower both bands and leave the low bands and H1−H2 roughly
  alone.
- Change: `apply_source` in `crates/chimera/src/voice/human_voice.rs`: closure sharpness
  `0.25 + 0.7·tension` → `0.4·tension` (0.22 at tension 0.55; speech, at 0.5, gets 0.2). Tried,
  against experiment 1:
  - `0.1 + 0.55·tension` (0.40): 1.047; BETTER. 4–8 kHz cost 2.91, 2–4 kHz 0.60.
  - `0.4·tension` (0.22): 0.930; BETTER. Kept.
  - `0.2·tension` (0.11): 0.915; BETTER, but the synth's 4–8 kHz median (−25.6 dB) passes hers
    (−24.8), MCD is flat (8.628) and it leaves tension almost no say in the closure. The extra
    0.015 is not worth that.
- Singer: training score 1.245 → 0.930 (−0.314 like for like), held-out 1.402 → 1.045.
  - Level 4–8 kHz cost 5.37 → 0.68 (synth median −17.3 → −23.7 dB, hers −24.8).
  - Level 2–4 kHz 1.43 → 0.13 (−14.0 → −17.1, hers −18.4).
  - Aperiodicity 1.74 → 0.97 (held out 0.96 → 0.05): YIN reads less high-frequency energy
    between the harmonics.
  - H1−H2 2.09 → 2.21: within the 0.25 a term may rise.
  - Level 0–0.5 kHz 1.41 → 1.32. Note MCD 9.288 → 8.624 dB. Nothing else moved by more than
    0.07.
- Speech: word error rate 39.07 → 39.07 % (OK).
- Speed: `os=2` 18.5 % → 19.1 % (3 %).
- Tests: pass, including `golden_analysis`.
- Commit: 8c04752.
- Next: the high bands are close to her now. The largest costs are H1−H2 (2.21), the onsets
  (1.39 and 1.10), level 0–0.5 kHz (1.32) and aperiodicity (0.97). H1−H2 and the low band point
  at the open quotient and how it follows pitch (lead 1), not at the closure.

### 3. A posterior glottal chink that stays open through closure (kept)

- Hypothesis: H1−H2 (cost 2.21) and level 0–0.5 kHz (1.32) were too low. At the default
  breathiness the folds sealed almost completely (chink 0.007 cm² on the female body). Most voices,
  women's and trained singers' included, keep a small posterior gap through the closed phase
  (Södersten & Lindestad 1990). Its leak lifts H1 and damps the tract, so H1−H2 and the low band
  should rise and H1−H2 should swing less as the harmonics cross F1.
- Change: `apply_source` in `crates/chimera/src/voice/human_voice.rs`: chink base 0.004 → 0.008
  (`0.008 + 0.03·breathiness`, times k²). Tried, against experiment 2:
  - 0.02: 0.896; WORSE, seven notes fewer measured (H1−H2 and pitch on en008a, en009a, en018a and
    more). Every lost note is one the synth hardly voices (5–10 % voiced: short notes on a stop
    coda like "dɑk", "ɹaɪt", "ɪt"); one stray voiced frame decides whether they are measured.
  - 0.016: 0.883; WORSE, the same kind of notes.
  - 0.012: 0.878; WORSE: one note fewer for H1−H2 (en048a "lʊk", 10 % voiced) and one fewer long
    enough for vibrato (en033a no. 96, a 0.6 s /ə/ whose voiced run fell under 0.4 s).
  - 0.008: 0.889; BETTER. Kept.
  - The larger chinks scored better but lose more of these notes. That is lead 5 again: notes
    the synth barely voices.
- Singer: training score 0.930 → 0.889 (−0.041 like for like), held-out 1.045 → 1.018.
  - Level 0–0.5 kHz 1.32 → 1.14 (synth median −7.31 → −7.04 dB, hers −4.02).
  - H1−H2 2.21 → 2.14 (−1.21 → −0.96 dB, hers +3.20). The swing with pitch is unchanged: by
    pitch the synth's medians still run −5 dB at MIDI 54 to +12 at 72, hers +2 to 0.
  - Level 4–8 kHz 0.68 → 0.44, level 2–4 kHz 0.13 → 0.00, aperiodicity 0.97 → 0.90.
  - Note MCD 8.624 → 8.573 dB. Nothing else moved by more than 0.02.
- Speech: word error rate 39.07 → 39.40 % (OK).
- Speed: `os=2` 19.1 % → 18.2 %.
- Tests: pass, including `golden_analysis`.
- Commit: f5cc671.
- Next: a larger chink doesn't flatten H1−H2's swing with pitch, and it costs notes the synth
  barely voices. Try a wider F1 bandwidth or F1 that follows pitch (lead 1). Lead 5 is worth
  a run of its own: those barely voiced short notes before a stop make every guard noisy.

### 4. The folds stay apart from the in-breath until the first voiced segment (reverted)

- Hypothesis: a phrase starts with the folds adducted (abduction 0) while the breath gesture
  ramps the pressure up from 60 ms before the first segment. So the voice starts as soon as the
  pressure crosses threshold: 15–20 ms before a vowel-initial note (hers +5 ms), and as a voiced
  blip before a voiceless onset (/s/, /f/, /h/ voiced 100–130 ms early). A real breath group
  starts from the open glottis of the in-breath, and the folds close only into the first voiced
  sound. Holding them open until then should move both onset terms later and leave the rest
  alone.
- Change: `plan_utterance` in `crates/chimera/src/phonetics/planner.rs`: an "inhale" abduction
  gesture (0.3, strength 6, like the voiceless one) from 50 ms before the plan start to 30 ms
  before the first voiced segment, ramping out over 30 ms. Tried, against experiment 3:
  - on every phrase: 1.378; WORSE. Vowel-initial onset −0.015 → −0.040 s, voiceless-initial
    −0.024 → −0.095 s, voiced share 0.260 → 0.634 cost, aperiodicity 0.90 → 2.50, 28 song
    measures on fewer notes. In the render (en001a at 2.40 s) the vowel now voices on time, but
    a 54 dB [h] (the vowel is 78 dB) runs for 55 ms before it: full breath through an open
    glottis. YIN counts that as the voice starting.
  - only on phrases that open on a voiceless consonant: 1.134; WORSE. Vowel-initial unchanged,
    voiceless-initial still −0.095 s: the breath blows through the open glottis before the
    onset's oral closure is made, an [h] before /k/, /t/, /p/. The gesture also reached back into
    the previous phrase when the gap was short (en002a "dh_eo" at 9.41 s, 135 ms before
    "p_l_ei_n_z": voiced 1.0 → 0.0), which cost voiced share and aperiodicity.
- Singer: training score 0.889 → 1.378 / 1.134 (not kept); held-out 1.018 → 1.314 (first try).
- Speech: not measured (the singer verdict was WORSE).
- Verdict: WORSE on both tries: onset terms rose instead of falling, voiced share and
  aperiodicity rose, songs measured on fewer notes.
- Next: don't open the glottis at the phrase start while the breath leads the articulation.
  The breath's 60 ms lead over the first segment is the real fault. Time the breath ramp to the
  first segment's oral closure (or, for a vowel, end it at the vowel's start), so that pressure
  builds behind a closure or into adducted folds, not into the open air (lead 3).

### 5. A trained singer's vibrato rate, 6 Hz rather than 5.5 (reverted)

- Hypothesis: the synth puts every vibrato at 5.5 Hz (measured 5.49), and hers runs at 6.1
  (6.0 over all her notes). Trained singers' vibrato is 5.5–6.5 Hz, about 6 Hz on average
  (Prame 1994, Sundberg). Raising the source's default rate should close the vibrato-rate gap
  (cost 0.66) and leave everything else alone, since only the pitch modulation's speed changes.
- Change: the default `vibrato_rate` 5.5 → 6.0 Hz in `DEFAULT_SOURCE`
  (`crates/chimera/src/voice/human_voice.rs`) and in the glottis default
  (`crates/chimera/src/sources/glottis.rs`). Speech has no vibrato, so it is untouched. Tried,
  against experiment 4's best (experiment 3, 0.889):
  - 6.0 Hz: 0.845 (−0.044 like for like); WORSE, en009a and en048a lose one H1−H2 and pitch note
    each.
  - 5.9 Hz: 0.843 (−0.046); WORSE, en019a, en033a (one note fewer long enough for vibrato), en034a,
    en048a and one more each lose a note.
  - 6.1 Hz: 0.846 (−0.044); WORSE, en019a loses one H1−H2 and pitch note.
- Singer: training 0.889 → 0.845 at 6.0 Hz (not kept), held out 1.018 → 1.007–1.008 at 5.9 and
  6.1 Hz. Vibrato rate cost 0.66 → 0.00 at every rate (synth 5.49 → 5.87 / 5.98 / 6.08 Hz, hers
  6.08); vibrato share 0.59 → 0.60–0.64; nothing else moved by more than 0.03.
- Speech: not measured (the singer verdict was WORSE).
- Verdict: WORSE on the fewer-notes guard at every rate. Every note that flips is a short note
  (0.08–0.34 s, mostly a stop coda: "aʊt", "lʊk", "ɹis", "mʌst") that the synth voices 0–12 % of
  its length, so one stray voiced frame decides whether it is measured. Notes were also gained
  ("dɑk" en015a, "ɪt" en045a, "noʊt" en011a): the flips go both ways, as noise. The vibrato
  oscillator runs through these notes even where the gesture gives them no depth, so its phase
  is enough to move a frame. I stopped at three rates rather than search for a rate that happens
  to pass the guard.
- Next: fix lead 5 first. These barely voiced short notes have now blocked or limited three
  experiments (1, 3, 5). Once they voice reliably, retry 6 Hz: it is worth about −0.04.


### 6. A phrase holds its last note to the end; the breath comes from the rest (reverted)

- Hypothesis: lead 5's barely voiced notes are mostly phrase-final. Of the 368 notes the synth
  voices under 30 % of their steady part while she voices them over 70 %, 315 end a phrase.
  `plan_song` ends a phrase's last vowel and its coda `min(0.12, 0.3·note)` before the note's end
  "to leave a breath before the next phrase". But both callers (`compare csd` and `render notes`)
  split phrases at rests and call `plan_song` once per phrase, so the breath has the rest after
  the note. A 0.12 s "aʊt" gave its vowel and /t/ 0.08 s, and the steady window (30–80 % of the
  note) caught the /t/. A singer holds the note to its notated end and puts the coda on the
  release. Holding the last phrase of a `plan_song` call to the note's end should raise voiced
  share and lower aperiodicity, and leave a mid-call phrase end (no rest) as it was.
- Change: `plan_song` in `crates/chimera/src/phonetics/sing.rs`: the reserve stays
  `min(0.12, 0.3·note)` for a phrase that runs straight into another in the same call, and
  becomes `min(r, 0.3·note)` for the call's last phrase. Tried, against experiment 3:
  - r = 0: 0.939 (+0.050); WORSE. Voiced share cost 0.26 → 0.00, aperiodicity 0.90 → 0.00, but the
    voice decays for about 50 ms after the plan ends (the breath's 50 ms ramp-out; the folds part
    45 ms after a sonorant), so it runs past the note into the next phrase's onset search, which
    starts 30 ms after the previous note. Vowel-initial onset −0.015 → −0.040 s (cost 1.39 → 3.44),
    voiceless-initial cost 1.11 → 1.40, level 0–0.5 kHz 1.14 → 1.44.
  - r = 0.05 (the breath's release, so the sound stops at the note's end): 0.747 (−0.142 like for
    like); WORSE, en036a and en044a lose one voiceless-initial onset each.
  - r = 0.04: 0.733 (−0.156); WORSE, the same two onsets and one H1−H2 and pitch note in en048a.
  - r = 0.06: 0.762 (−0.127); WORSE, the en044a onset.
- Singer at r = 0.05: training 0.889 → 0.747, held-out 1.018 → 0.98 (from the held-out costs).
  Voiced share cost 0.26 → 0.04 (synth 0.876 → 0.896, hers 0.927), aperiodicity 0.90 → 0.03,
  H1−H2 2.14 → 2.29, level 0–0.5 kHz 1.14 → 1.28, onsets 1.39 → 1.47 and 1.11 → 1.14. Note MCD
  8.573 → 8.537 dB, envelope correlation 0.797 → 0.810. Nothing else moved by more than 0.05.
- Speech: not measured (the singer verdict was WORSE). Speech doesn't use `plan_song`.
- Verdict: WORSE on the fewer-notes guard at every value. The lost onsets are two phrase-initial
  notes the synth never voices, before or after (en044a no. 145 "pæ", en036a no. 71 "ki"). Their
  onset was a stray voiced frame 80–100 ms before the note, which the change removed. The
  rules' answer is revert; the gain is real but waits on those notes.
- Next: fix the vowel that never phonates after a phrase-initial voiceless stop (lead 5's second
  note: aspiration, then 50 ms at −55 dB where the vowel should be). Then retry this change at
  r = 0.05: it is worth about −0.14, the largest single gain so far. H1−H2 and the low band rose
  a little with it, as more of the short notes' vowels are now measured.

### Judge change after experiment 6: like for like, note by note

Experiments 1, 3, 5 and 6 were blocked or held back by the per-song coverage guard. It flipped
on notes the synth barely voices (0–12 %), where one stray voiced frame decides whether a note
has an onset, H1−H2 or pitch reading. Per-note voicing has no gap to put a threshold in.

The verdict now recomputes each song's value of each term for both runs, over the notes on
which both runs give it. `score.json` keeps every note for this. A note that stops or starts
being measured leaves both runs alike. Not voicing a note still costs, through the voiced share.
The coverage counts are gone, and the score itself is unchanged: 0.889 at the current best,
and a rerun is NO CLEAR CHANGE.

Checked on experiment 5's change (vibrato 5.5 → 6.0 Hz): BETTER, −0.043 like for like. It
was not kept: that is for an experiment to do. Experiments 5 and 6 are worth retrying as they
were.

### 7. Experiment 6 again under the like-for-like judge: the last note held to the end (reverted)

- Hypothesis: as in experiment 6. `plan_song` ends a phrase's last vowel and coda
  `min(0.12, 0.3·note)` before the note's end to leave a breath, but the call's last phrase is
  followed by a rest (both callers split phrases at rests), so the breath comes from the rest. The
  steady window of short phrase-final notes caught the coda instead of the vowel. Holding the
  call's last note to 50 ms before its end (the breath's release) should raise voiced share and
  lower aperiodicity. Experiment 6 measured this at −0.142 and failed only the coverage guard,
  which the judge change after it removed.
- Change: `plan_song` in `crates/chimera/src/phonetics/sing.rs`: the reserve is
  `min(0.12, 0.3·note)` for a phrase that runs straight into another in the same call, and
  `min(0.05, 0.3·note)` for the call's last phrase. One value, the one experiment 6 settled on.
- Singer: training score 0.889 → 0.747 (−0.145 like for like, BETTER), held-out 1.018 → 0.983.
  - Voiced share cost 0.26 → 0.04 (synth 0.876 → 0.896, hers 0.927).
  - Aperiodicity 0.90 → 0.03.
  - H1−H2 2.14 → 2.29 and level 0–0.5 kHz 1.14 → 1.28: more of the short notes' vowels are now
    measured, and they have the pitch-dependent H1−H2 of lead 1.
  - Vowel-initial onset 1.39 → 1.47; voiceless-initial 1.11 → 1.14.
  - Note MCD 8.573 → 8.537 dB, envelope correlation 0.797 → 0.810. Nothing else moved by more than
    0.05.
- Speech: word error rate 39.4 → 39.4 % (OK; speech doesn't use `plan_song`).
- Speed: `os=2` 18.2 % → 18.4 %.
- Tests: `bun test tests` passes (18). After blessing twice, `cargo test --workspace` fails one
  test: `songs_match_typescript` (`golden_planning.rs`), "Made of air (male)" gestures[138].t1
  11.6066 vs 11.6766. That is the last note's vowel ending 70 ms later (0.12 → 0.05 s), the change
  itself. The baseline passes it. The test compares `plan_song` against TypeScript-era plans in
  `tests/golden/planning.json`, and `CHIMERA_BLESS` doesn't regenerate them (the TypeScript engine
  is gone), so it isn't a blessed fixture. The rules' only exception is the airway checks in
  `golden_analysis`.
- Verdict: reverted on a failing test, as the rules require, though every judge passed. Editing or
  re-baselining the test to let the change through is not this experiment's to do.
- Next: the owner should decide whether the song plans in `planning.json` may be re-blessed after
  an intended planner change (as the sound fixtures are), or add a rules exception for
  `songs_match_typescript` like the airway one. Then keep this change as it is: it is worth −0.145
  and takes voiced share and aperiodicity to about 0. Until then no `plan_song` change can be kept,
  so the next run should pick a lead outside `plan_song`: the vibrato rate (lead 4, about −0.04,
  in the source), or F1 bandwidth for H1−H2 (lead 1).

### Decision after experiment 7: the planners' snapshots are blessed too

`golden_planning` compared the planners against TypeScript-era plans in `planning.json`. Blessing
didn't regenerate those, so no change to `plan_song` (or any planner) could pass the tests.
Like the audio fixtures, these are snapshots of a retired engine. `CHIMERA_BLESS=1` now
rewrites the utterance, duration, phrase, song and live-note plans in `planning.json`, keeping
its inputs. Blessing an unchanged planner rewrites the same values (worst difference 2e-16).
The beat sequencer's expectations stay fixed.

Experiment 7's change (a phrase's last note held to 0.05 s before its end, −0.145 like for
like, speech and bench OK) can now be retried as it was.

### 8. Experiment 7 again, now that the planners' snapshots bless: the last note held to the end (kept)

- Hypothesis: as in experiments 6 and 7. `plan_song` ends a phrase's last vowel and coda
  `min(0.12, 0.3·note)` before the note's end to leave a breath, but the call's last phrase is
  followed by a rest (both callers split phrases at rests), so the breath comes from the rest. On
  short phrase-final notes the steady window caught the coda, not the vowel. Holding the call's
  last note to 50 ms before its end (the breath's release) should raise voiced share and lower
  aperiodicity. Experiment 7 was BETTER on every judge and reverted only on
  `songs_match_typescript`, which the decision after it turned into a blessed snapshot.
- Change: `plan_song` in `crates/chimera/src/phonetics/sing.rs`: the reserve is
  `min(0.05, 0.3·note)` for the call's last phrase and stays `min(0.12, 0.3·note)` for a phrase
  that runs straight into another in the same call. One value, experiment 7's.
- Singer: training score 0.889 → 0.747 (−0.145 like for like, BETTER), held-out 1.018 → 0.983.
  The same numbers as experiment 7:
  - Voiced share cost 0.26 → 0.04 (synth 0.876 → 0.896, hers 0.927); aperiodicity 0.90 → 0.03.
  - H1−H2 2.14 → 2.29 and level 0–0.5 kHz 1.14 → 1.28: more short notes' vowels are measured, with
    lead 1's pitch-dependent H1−H2.
  - Vowel-initial onset 1.39 → 1.47; voiceless-initial 1.11 → 1.14.
  - Note MCD 8.573 → 8.537 dB, envelope correlation 0.797 → 0.810. Nothing else moved by more than
    0.05.
- Speech: word error rate 39.4 → 39.4 % (OK; speech doesn't use `plan_song`).
- Speed: `os=2` 18.2 % → 18.4 %.
- Tests: after blessing twice (the first run fails `engine.rs` on the beatbox fixture, as
  expected), `cargo test --workspace` passes, `golden_planning` and `golden_analysis` included, and
  `bun test tests` passes (18).
- Commit: 31643bb.
- Next: the largest costs are now H1−H2 (2.29), the onsets (1.47 and 1.14) and level 0–0.5 kHz
  (1.28). The cheapest next gain is experiment 5's vibrato rate (5.5 → 6.0 Hz, about −0.04, lead
  4), which the like-for-like judge already called BETTER. For H1−H2, try a wider F1 bandwidth or
  F1 that follows pitch (lead 1).

### 9. Experiment 5 again under the like-for-like judge: a trained singer's vibrato rate, 6 Hz (kept)

- Hypothesis: as in experiment 5. Every vibrato ran at 5.5 Hz (measured 5.50), and hers runs at
  6.1. Trained singers' vibrato is 5.5–6.5 Hz, about 6 Hz on average (Prame 1994, Sundberg).
  Raising the source's default rate should close the vibrato-rate gap (cost 0.64) and leave the
  rest alone. Experiment 5 measured −0.044 and failed only the coverage guard, which the judge
  change after experiment 6 replaced; that judge already called it BETTER.
- Change: the default `vibrato_rate` 5.5 → 6.0 Hz in `DEFAULT_SOURCE`
  (`crates/chimera/src/voice/human_voice.rs`) and in the glottis default
  (`crates/chimera/src/sources/glottis.rs`). One value, experiment 5's first.
- Singer: training score 0.747 → 0.714 (−0.034 like for like, BETTER), held-out 0.983 → 0.978.
  - Vibrato rate cost 0.64 → 0.00 (synth 5.50 → 5.98 Hz, hers 6.08); held-out 0.09 → 0.00.
  - Vibrato share 0.59 → 0.65 and depth 0.04 → 0.02: the detector reads a few notes differently
    at the new rate.
  - Aperiodicity 0.03 → 0.06, voiceless-initial onset 1.14 → 1.08, vowel-initial 1.47 → 1.49,
    H1−H2 2.29 → 2.27. Note MCD 8.537 → 8.535 dB, envelope correlation 0.810 → 0.810, pitch error
    4.81 → 4.86 cents. Nothing else moved by more than 0.01.
- Speech: word error rate 39.4 → 39.4 % (OK; speech has no vibrato).
- Speed: `os=2` 18.4 % → 19.4 %, then 18.4 % on the rerun.
- Tests: after blessing twice (the first run fails `engine.rs`, as expected), `cargo test
  --workspace` passes, `golden_analysis` and `golden_planning` included, and `bun test tests`
  passes (18). The blessed `planning.json` changed too (the live-note plans carry the rate).
- Commit: ec79db0.
- Next: the vibrato group's last cost is the share (0.65): the synth vibratos every long note,
  she about two thirds. The largest costs are still H1−H2 (2.27), the onsets (1.49 and 1.08) and
  level 0–0.5 kHz (1.28). For H1−H2, try a wider F1 bandwidth or F1 that follows pitch (lead 1);
  for the onsets, time the breath ramp to the first segment (lead 3).

### 10. A sung phrase's breath reaches full drive at its first segment (kept)

- Hypothesis: every phrase's breath gesture ramped up over the 40 ms ending 20 ms before its first
  segment, so the lung pressure crossed the phonation threshold early and a sung phrase voiced
  ahead of its note: 16 ms early before a vowel (hers 5 ms late) and 20 ms early before a voiceless
  onset (hers 18 ms late). A sung onset is planned (`plan_song` puts the first vowel on the beat),
  so a singer times the breath to it: the pressure builds into the adducted folds, or behind the
  first constriction, as the first segment starts. The two onset terms should move later and
  nothing else should move much.
- Change: `plan_utterance` in `crates/chimera/src/phonetics/planner.rs`: for a sung phrase
  (`sung`, set only by `plan_song`), the breath gesture reaches full drive at the first segment
  (`BREATH_SUNG_AT` = 0.06 s after the plan start, which is where the first segment starts)
  instead of 0.04 s. Speech and live notes keep the old lead, so speech is untouched and live
  notes get no added latency. Tried, against experiment 9:
  - 0.05: 0.661 (−0.048 like for like); BETTER. Onsets −0.005 / +0.020 s, costs 1.18 / 0.77.
  - 0.06: 0.623 (−0.085); BETTER. Kept: the breath peaks just as the first segment starts.
  - 0.07: 0.647 (−0.063); BETTER. Onsets +0.015 / +0.006 s, costs 1.10 / 0.68.
- Singer: training score 0.714 → 0.623 (−0.085 like for like, BETTER), held-out 0.978 → 0.791.
  - Onset, vowel-initial cost 1.49 → 0.97 (synth median −0.016 → +0.004 s, hers +0.005); held-out
    1.16 → 0.00.
  - Onset, voiceless-initial 1.08 → 0.52 (−0.020 → +0.037 s, hers +0.018); held-out 1.14 → 0.05.
  - Envelope correlation 0.810 → 0.814, note MCD 8.535 → 8.535 dB, pitch error 4.86 → 4.85 cents.
    No other term moved by more than 0.01.
- Speech: word error rate 39.4 → 39.4 % (OK; speech isn't `sung`).
- Speed: the bench doesn't run the planner, so its render path is unchanged. The machine was
  loaded (load average 30 on 16 cores, from other sessions): `os=2` read 34.0 % and 33.6 %, and the
  previous commit read 33.1 % against this one's 33.2 % in back-to-back runs. `out/hill/best/bench.txt`
  keeps the last quiet-machine figure (19.4 %).
- Tests: after blessing twice (the first run fails `engine.rs`, as expected), `cargo test
  --workspace` passes, `golden_planning` and `golden_analysis` included, and `bun test tests`
  passes (18).
- Commit: 3747f99.
- Next: the largest cost by far is H1−H2 (2.27, a sixth of the score on its own), then level
  0–0.5 kHz (1.28), the onsets' remaining mean gap (0.97 and 0.52) and the vibrato share (0.65).
  For H1−H2, try a wider F1 bandwidth or F1 that follows pitch (lead 1). For the onsets, look at the
  phrases still far off rather than the medians, which are now about right.

### Batch review (Codex), and what changed after it

The review found no engine defect and called all six changes plausible. Three things changed:

- **Speech and speed are judged against the batch's baseline** (`out/hill/baseline/`), not
  the best run. With a 3-point or 10 % allowance per step measured against the best run,
  small losses could add up over a batch: 38 → 41 → 44 → 47 % would pass every step.
- **Fixtures are written atomically** (a temporary file, then a rename). While one planning
  test blessed `planning.json`, another could start and read half of it.
- **The pressed end of the tension control is back.** Experiment 2's `0.4·tension` capped the
  closure at 0.4 even at full "Pressed", where it had been 0.95. That is a sound no judge
  measures, since everything is rendered at tension 0.5–0.55. Above 0.6 the closure now
  sharpens again, to 0.95 at full tension. Every judged render is byte-identical, so no score
  moves. A test (`tests/voice_source.rs`) keeps the closure rising with tension all the way.


### Listening result (2026-11-07): the pilot's answer is yes

Blind A/B, singer first, every clip at the same loudness (5 song excerpts, 4 sentences):
**now 7, before 0, can't tell 2** (en006a and harvard-male-07). Every held-out excerpt went to
"now". So the score's direction matches the user's ears.

What they heard, in their words, and what the renders show:

- **"Mostly a brightness change; the darker one sounds better as a default."** "Now" is the darker
  one. Its spectral centroid is about 150 Hz lower in every song clip (White Christmas
  1110 → 943 Hz; hers is 807), and 2–8 kHz is 3–8 dB down. The user wants a control for it.
- **The gains feel incremental.** The user is more interested in pronunciation, which the singer
  score doesn't measure.
- **"Sheet" heard as "feet".** In a fresh render of "sheet" the /ʃ/ is 23 dB below its vowel, the
  same as /f/ in "feet". Whisper hears "feet" in both voices too, and "fire" for "sharp"
  (female). Every word with ch or j fails in Whisper as well: juice → "roost", chair →
  "coloring", chain → "pin", birch → "bird", chopped → "hopped", chicken dropped.
- **J sounds very muted.** The /dʒ/ of "juice" is about 25 dB below its vowel, and mostly
  low-frequency voicing.
- **A huge pop on the p of "sharp".** The /p/ release peaks 7 dB above the loudest point of the
  vowel, and its energy is all below 4 kHz: a pressure thump, not a burst.
- **A tinny noise at syllable ends (after "truck").** It is a 750 Hz buzz, with lines at exact
  multiples of 750 Hz about 25 Hz wide. 750 Hz is the control rate: 48 kHz ÷ 64, one update
  every 64 samples. The /k/ release of "truck" is mostly this buzz, and it is in the decay after
  every word checked (sheet, feet, juice, pushes). Steady fricatives are clean noise.
- **"Pu" of "pushes" inaudible.** The stressed /ʊ/ lasts about 40 ms; the unstressed "-es"
  gets about 100 ms. The text front end marks the stress correctly (pˈʊʃəz).

Whisper agrees with the user on the word errors (sheet → feet, and the j and ch words), which
supports using it as the pronunciation judge. It disagrees on one: it heard "pushes" correctly in
the female voice after the batch (before it heard "puffs"). It can't judge the pop or the buzz,
since neither changes the words, so those need checks of their own.

## Batch 2: pronunciation (from 2026-11-07)

Batch 1 is merged (PR #16). The owner's listening (above) asked for pronunciation, so batch 2's
judge is Whisper. See the README's "current batch" section for the rules.

### Before the batch: the fixes and the Bright control (PR #19, not a hill-climb step)

- **The tinny ring: fixed.** It was a 750 Hz buzz from the lung pressure stepping once per
  control block. It now ramps across the block. Block-periodic share of a word's tail ~20 % →
  under 1 %.
- **The pop on "sharp": not fixed.** The tongue squeezes the air between the closed lips and its
  /t/ seal to 11x the lungs' pressure (88 cmH2O). The /p/ releases at +7 dB re the sentence's
  loudest vowel (male). Absorbing a sealed pocket's wall motion halved it but broke the engine's
  adiabatic-compression test and the creatures' parity; reverted. The ignored test
  `the_p_of_sharp_does_not_pop` in `tests/consonant_artifacts.rs` measures it.
- **Bright control** (`VoiceSource.brightness`, default 0.25 = the current sound).
- Against batch 1's best: singer 0.623 → 0.582 (BETTER, onsets), held-out 0.791 → 0.789; speech
  39.4 → 40.7 %; speed 18.2 % of one core.

### The judge for batch 2

- `tools/asr/sentences.tsv` gained 20 held-out sentences (set column "held"): Harvard list 2, and
  ten unpredictable sentences dense in sh, ch and j. They never decide.
- `speech_wer.py --against` now says BETTER (training word error rate down by at least 1.5
  points), WORSE (up by more than 3) or NO CLEAR CHANGE, and reports the held-out rate.
- The old batch-1 directories are kept as `out/hill/batch1-baseline` and `out/hill/batch1-best`.

### Batch 2 baseline (commit 4980e3b, `out/hill/baseline`)

- Speech, training: **40.73 %** (harvard female 37.5, male 37.5; nonsense female 42.25, male
  46.48). Held-out: **50.67 %** (harvard female 35.44, male 39.24; nonsense female 70.42, male
  60.56).
- Singer: training 0.582, held-out 0.789.
- Speed: 18.2 % of one core (`os=2`).
- The /p/ of "sharp": +7.0 dB re the loudest vowel, oral pressure 11.1x the lungs' (male).

### 11. The space in front of the raised tongue tip is narrow: /ʃ/'s front cavity (reverted)

- Hypothesis: the /ʃ/ of "sheet" peaked at 2.06 kHz (female) and 1.73 kHz (male), against
  2.5–3.5 kHz in real speech, and Whisper heard "feet". A probe of the noise sources showed the
  teeth (obstacle) source makes the /ʃ/: with it off the fricative falls 10 dB, while the
  aspiration source changes nothing. The peak is the resonance of the front cavity between the
  postalveolar constriction and the lips, which it excites. In the area function that cavity
  holds a chamber of 4.7–5.5 cm² over about 1 cm (male, ~10 cm³ in all). It is the space under the
  alveolar ridge and below the raised tip, down to the floor of the mouth (midsagittal depth
  ≈ 1.7 cm). Those rays took the oral law, 2.6·d^1.4, which describes the mid-oral cavity
  between the molars. In front of the tip the airway lies inside the anterior dental arch and the
  sublingual space, far narrower. Lips and jaw were checked first and are not the cause:
  - lip width 0.2 → 0.6: peak +100–200 Hz
  - lip protrusion 0.75 → 0.4: +240 Hz
  - jaw 0.35 → 0.1: nothing
  - tongue tip forward (ttX 5.7 → 6.05): about +100–200 Hz
- Change: `crates/chimera/src/anatomy/human.rs`: a fourth area law, `AreaLaw.ahead`, for the oral
  rays whose midpoint lies in front of the tongue tip, faded in by
  `smoothstep(0, 0.4·k, mid.x − tip.x)`. Vowel and consonant tables regenerated with `chimera
  calibrate`: the vowels' formants moved up to 4–5 % (the open vowels' F1 down, /ɝ/ F2 up).
  After recalibration the mean F1 error is 1.33 → 1.59 % (male) and 2.01 → 2.53 % (female); F2
  and F3 are about the same. Values tried (/ʃ/ of "sheet", peak female / male):
  - α = 2.0 (the dental arch's front law), no recalibration: 2.16 / 1.78 kHz. Too little.
  - α = 1.2, with an uncalibrated sensitivity check of α = 0.7 (3.0 / 2.5 kHz):
    - "Sheet": 2.81 / 2.06 kHz, 1–2 kHz band −5 → −18 dB (female).
    - Speech NO CLEAR CHANGE: 40.73 → 39.40 %. Harvard male 37.5 → 27.5, Harvard female
      37.5 → 46.25.
    - Singer WORSE: 0.582 → 0.590, note MCD 8.536 → 8.648 dB, over its 0.1 dB guard.
  - α = 1.6: "sheet" 2.34 / 1.92 kHz. The numbers below are for this value.
  - /s/ and /f/ barely move at any value: "seat" 4.0–4.1 kHz, "feet" 4.3–4.5 kHz (female).
- Speech: word error rate 40.73 → 35.76 % (training, **BETTER**), 50.67 → 45.33 % (held-out).
  - Moved right: "chicken leg" (male, 5 → 1 errors), "juice" (male), "sharp" and "the thin road"
    (female), "soft hill" (female), "some bright doors" (male).
  - "Sheet" is now heard in the male voice ("screw the sheet": the error moved to "glue"). The
    female still hears "feet": her /ʃ/ is still 21–22 dB below the vowel, as quiet as her /f/.
  - Chair, chain, birch and chopped still fail.
- Singer: training 0.582 → 0.584 (NO CLEAR CHANGE, every guard holds; note MCD 8.536 → 8.628
  dB), held-out 0.789 → 0.810. Level 0–0.5 kHz cost 1.22.
- Speed: `os=2`, back to back with the baseline commit: 18.2 / 19.1 % (baseline) against
  18.4 / 19.7 % (change), so 1–3 %. A first run read 22.2 %, while other sessions loaded the
  machine (load average 13).
- Tests (fixtures blessed twice, then `cargo test --workspace`):
  - `golden_analysis` fails at its first "human |H|" check: the README's airway exception. Its
    later checks (tube networks, FFT, LPC, YIN, Nelder–Mead) don't touch the human tract.
  - `golden_geometry` (the TypeScript-era area function) fails: it has to move with any
    deliberate geometry change. It is the same kind of check as the airway one; the batch PR
    would regenerate it.
  - `golden_planning`'s beat sequencer checks fail by 1e-3 in tongue targets, which come from the
    regenerated vowel table.
  - **`geometry_continuity::no_area_jumps_anywhere_in_the_articulators_speech_ranges` fails:**
    "child ə velum=1.117: 0.32 cm²". The new law doesn't cause it:
    - new law, old tables: passes.
    - old law (α = 2.6), new tables: fails the same way.
    - The recalibrated child /ə/ posture lands on a jump that was already in the geometry. It is
      at the top of the pharynx (the velopharyngeal rays), with the velum raised to about 1.117
      (posture jaw 0.80, tbX 2.70, tbY 7.38, root −0.50).
  - `bun test` was not run.
- Verdict: reverted. The speech is BETTER, the singer guards hold and the speed is fine, but a
  non-fixture test fails, so the rules revert it. This is the same position as experiment 7.
- Commit: none (log only). The patch: in `AreaLaw` add `pub ahead: (f64, f64)`, default
  `(1.6, 1.4)`. In the region-2 branch of the area loop, replace `a_o·d^b_o` with
  `lerp(a_o·d^b_o, a_h·d^b_h, smoothstep(0, 0.4·k, g.mid.x − tip.x))`. Then run `chimera calibrate
  vowels all` and `chimera calibrate consonants`.
- Next:
  - Fix the velopharyngeal jump that `geometry_continuity` finds for the recalibrated child /ə/
    (velum ≈ 1.117) as its own step, then retry this change as it was.
  - Retry α = 1.2 too: it moved /ʃ/ further (2.8 kHz female), and its speech result (−1.33)
    was within Whisper's run-to-run noise of α = 1.6's.
  - After that, the /ʃ/'s level: the female /ʃ/ is 21 dB below its vowel and the male 11 dB.
    The teeth source's gain, or how its weight depends on the distance behind the teeth (2.5 cm
    for /ʃ/, just short of where `w_dist` starts to fade, at 2.6), is the place to look.

### Decision after experiment 11: the geometry and beat-sequencer snapshots are blessable

Experiment 11 changed the mouth's area rule in front of the tongue tip and recalibrated the vowel
tables, as the rules ask. Two TypeScript-era snapshots then failed by design: `golden_geometry`
(the area functions) and the beat sounds' and beat player's gestures in `planning.json` (their
vowel targets moved by 0.001). Like the audio and planner fixtures in batch 1, they are now
blessed with `CHIMERA_BLESS=1` (`golden_geometry.rs`, `golden_planning.rs`). On the current engine
blessing them changes no value (geometry within 7e-14; planning only in number formatting and
two last-digit floats). The beat notation stays fixed.

`geometry_continuity` is a real check, not a snapshot, so experiment 11's failure there stands: its
recalibrated child /ə/ posture lands on a jump in the area function at the top of the pharynx,
near the raised velum. That jump was already there; experiment 12 fixes it together with
experiment 11's change.

### 12. Experiment 11 again, with the velopharyngeal area jump fixed (kept)

- Hypothesis: as in experiment 11. The /ʃ/'s front cavity, in front of the raised tongue tip,
  took the mid-oral area law, so its resonance sat at 1.7–2.1 kHz and Whisper heard "feet" for
  "sheet". Experiment 11's narrower law (`AreaLaw.ahead`) fixed that. It was reverted only
  because the recalibrated child /ə/ landed on an area jump that was already in the geometry.
  That jump is a fault in how the area function is computed, so fixing it belongs to this change.
- The jump's cause: a probe of the child /ə/ posture (jaw 0.80, tbX 2.70, tbY 7.38, root −0.50)
  found it at velum 1.11470 → 1.11471, on the second oral-fan ray (175°, still region 1, behind
  the velum). The ray's raw gap is continuous (0.602 cm). Its gap after the soft-tissue roof
  contact falls 0.602 → 0.439, so its area falls 0.98 → 0.63 cm². The ray ends on the
  velopharyngeal port window, 1.4 mm (child) behind the roof's first point, the uvula's tip. So
  `on_roof` still fades the contact model in, at 0.65. The model takes the narrowest tongue gap
  among roof points ±`half` along the roof, but skips that search when `dc − half > 0.6k`. The
  shortcut assumes a neighbour can be closer only by `half`, which holds only for a ray ending on
  the roof. For a ray ending off it, a neighbour can be closer by `half + pr.dist`. Here the search
  switched on with a neighbour at 0.35 cm, inside the contact range: `cap` 0 → 0.60 in one step.
- Change: `crates/chimera/src/anatomy/human.rs`.
  - Experiment 11's patch as logged: `AreaLaw.ahead = (1.6, 1.4)`, faded in by
    `smoothstep(0, 0.4·k, mid.x − tip.x)`.
  - The roof-contact search's bound is now `dc − half − pr.dist ≤ 0.6k`. With it, a ray whose
    search is skipped has every neighbour farther than 0.6k, so `cap` and `w` are 0 either way
    and the contact fades in continuously. The fix leaves the calibrated vowel table
    byte-identical: no calibrated posture sits in the band it changes.
  - Tables regenerated with `chimera calibrate vowels all` and `chimera calibrate consonants`,
    the same postures as experiment 11's (child /ə/ identical).
  - Values: α = 1.6 only. α = 1.2 was not retried. In experiment 11 it put note MCD at
    8.648 dB, over the 8.636 dB guard, and the jump fix doesn't move the tables. It needs its own
    run, with something to offset the MCD.
- Speech: word error rate 40.73 → 36.09 % (training, **BETTER**), 50.67 → 45.67 % (held-out).
  Experiment 11 read 35.76 %; the difference is within Whisper's run-to-run spread.
  - Moved right: "chicken leg" (male, 5 → 1 errors), "juice" (male), "sharp" and "the thin road"
    (female, also male 3 → 2), "soft hill" (female), "some bright doors" (male), "birch canoe"
    (female, 7 → 6), "rice … round bowls" (male, 2 → 1).
  - "Sheet" is heard in the male voice ("screw the sheet": the error moved to "glue"). The
    female still hears "feet".
  - One got worse: "her round table sings the dark rope" (female, 3 → 4, "the" dropped).
  - Chair, chain, chopped and the female birch still fail.
- Singer: training 0.582 → 0.584 (NO CLEAR CHANGE). Every guard holds: 0 notes off time, 0
  dropped gestures, note MCD 8.536 → 8.628 dB, envelope correlation 0.811, pitch error 4.85
  cents. Held-out 0.789 → 0.810. Level 0–0.5 kHz cost 1.22; nothing else moved by more than
  0.02. The same as experiment 11.
- Speed: `os=2` 18.2 % (baseline) → 18.4 %, at load average 10.
- Tests: fixtures blessed twice, then `cargo test --workspace`. Everything passes, including
  `geometry_continuity`, `golden_geometry` and `golden_planning`, except one:
  - `golden_analysis` fails at its first "human |H|" check ("male neutral", 9 %): the README's
    airway exception, since the tract geometry changed on purpose.
  - With the human checks skipped in a local, uncommitted edit, the rest of `golden_analysis`
    passes (tube networks, FFT, LPC, YIN, Nelder–Mead).
  - `bun run wasm && bun test tests`: 30 pass.
  - Fixtures restored.
- Commit: 68f6274.
- Next:
  - The /ʃ/'s level: the female /ʃ/ is about 21 dB below its vowel, as quiet as her /f/, so she
    still says "feet". Look at the teeth (obstacle) source's gain, and at how its weight
    falls with the distance behind the teeth: /ʃ/ is at 2.5 cm, just short of where `w_dist`
    starts to fade, at 2.6.
  - Then α = 1.2, which moved /ʃ/ further in experiment 11.
  - The affricates (chair, chain, chopped, birch) still fail: their /ʃ/ release is presumably as
    weak.

### 13. The teeth (obstacle) source makes sibilants louder than /f/ (reverted)

- Hypothesis: the female /ʃ/ of "sheet" is 22 dB below its vowel, and Whisper hears "feet". A
  probe of `update_noise` and of the levels (frication 0.12–0.22 s against vowel 0.25–0.31 s, by
  RMS) found:
  - **`w_dist` is not the cause.** The female /ʃ/'s jet sits 2.49 body-cm behind the teeth and
    the male's 2.6. Both get full weight (`w_dist` 1.00 and 0.99–1.00), and so does `w_jet`.
    Moving the teeth injection point by −2 to +1 sections changes the level by less than 1 dB.
  - **In both voices /ʃ/ is no louder than /f/.** Male: /ʃ/ −11.5, /f/ −12.4, /s/ −9.3 dB re
    the vowel. Female: −22.2, −23.1 and −20.2. In real speech the sibilants are about 10 dB
    more intense than /f/ and /θ/ (Behrens & Blumstein 1988; Jongman et al. 2000), because the
    jet hits the incisors (an obstacle source, Shadle 1985). The obstacle source adds only
    9–10 dB over the jet source alone, in both voices (teeth source off: male −20.7, female
    −32.1).
  - **Why the female is about 10 dB worse than the male, relative to her vowel.** The female
    voice's output gain (0.55, `HumanVoice::new`) explains most of the 8 dB her frication is
    below the male's in absolute terms. It is a level match, so it doesn't change the
    fricative-to-vowel ratio. The ratio's gap splits about evenly:
    - The source: the female voice rendered in the male body gives /ʃ/ −17.1 dB. Her vowels
      come out 5.4 dB louder than the male voice's in the same body. Her glottal pulse is
      0.17·k² cm² (0.81 of the male's) at twice the f0. Real female peak flow is about 0.64 of
      the male's (Holmberg et al. 1988), with folds about 0.67 of his length (Hirano), so her
      vowels are too loud.
    - The body: the scale alone (0.9, other female body parameters set to the male's) puts the
      female frication 8 dB lower in absolute terms. After the 5.2 dB output gain, about 3 dB of
      that is the turbulence source itself. The source scales with Re² ∝ v²A, and the series
      pressure source's flow scales with A. Her vowel rises about 2 dB.
  - The cheapest step that separates /ʃ/ from /f/ is the obstacle source's gain. It raises every
    sibilant (and tongue-tip releases) in both voices and leaves /f/ alone, since /f/'s jet is
    at the lips (`w_dist` 0).
- Change: `NoiseGains.teeth` 3.0e-6 → 6.0e-6 in `crates/chimera/src/voice/human_airway.rs`.
  Values tried, by level re the vowel:
  - 6e-6: /ʃ/ male −5.8, female −16.4 dB (6–7 dB above /f/); /s/ male −3.4, female −14.4.
    Female "chair": the /tʃ/ peaks about 20 dB below the vowel.
  - 9e-6: /ʃ/ −2.3 and −12.9 dB, /s/ male +0.1 dB, as loud as the vowel. Too loud. Not judged.
  - The judges ran on 6e-6.
- Speech: word error rate 36.09 → 36.75 % (training, NO CLEAR CHANGE), 45.67 → 44.67 %
  (held-out).
  - Moved right:
    - **"Glue the sheet" (female, 1 → 0: "feet" → "sheet")**
    - "chopped" (male, 3 → 1)
    - "pushes" (male, 3 → 0)
    - "thrown" (female, 1 → 0)
    - "faced us" (male, 7 → 5)
    - "rice … served" (female, 3 → 1)
    - "the quiet fish" (female, 3 → 2)
  - Moved wrong:
    - "chicken leg" (male 1 → 5, female 2 → 4)
    - "some bright doors sell" (male, 3 → 6)
    - birch, "depth of a well", "late song", "sharp tree" and "loud milk", each by one word
  - Chair, chain and the female juice still fail.
- Singer: training 0.582 → 0.601 (+0.019 like for like), but **WORSE**: note MCD 8.536 →
  8.644 dB, over its 8.636 guard. The best run's 8.628 left 0.008 dB of headroom. The songs'
  sibilants are louder: level 4–8 kHz gap/spread 1.52 → 1.63, 2–4 kHz 0.96 → 1.00. Every
  other guard holds (0 notes off time, 0 dropped gestures, envelope correlation 0.811, pitch
  error 4.85 cents). Held-out 0.810 → 0.827.
- Speed: `os=2` read 27.8 and 28.3 % at load average 15–16. Back to back on the same loaded
  machine: 24.3 % without the change, 24.2 % with it. The change is a constant, so the speed
  is unchanged.
- Tests: fixtures blessed twice, then `cargo test --workspace`.
  - Everything passes except `golden_analysis` at "male neutral" (9 %). It is the same failure
    experiment 12 logged: that change altered the tract geometry, which the README's airway
    exception covers. This change doesn't cause it.
  - `bun run wasm && bun test tests`: 30 pass.
  - Fixtures restored.
- Verdict: reverted. The speech isn't BETTER (+0.66 points), and the singer breaks the note-MCD
  guard.
- Commit: none (log only).
- Next:
  - The sibilant level is still the right target. The female "sheet" is heard as soon as /ʃ/
    stands 6 dB above /f/. But a flat gain also makes the songs' sibilants louder, and note MCD
    has no headroom left (8.628 against 8.636).
  - Take the female's 10 dB first. Her vowels are about 5 dB too loud for her folds: the glottal
    pulse area scales with k² (0.81), where real female folds are about 0.67 of the male's
    length and her peak flow about 0.64 of his. A fold-length body parameter for the pulse
    amplitude, with the output gain re-levelled, would lift every female consonant against
    her vowels without touching the male. It does change her source, so watch H1−H2 and MCD in
    the singer.
  - If the gain is retried, try a smaller step (4–4.5e-6) together with something that buys back
    note MCD. Or tie the obstacle source to Stevens' scaling (source ∝ ΔP^1.5·A^0.5 rather than
    Re² ∝ ΔP·A), which lifts narrow jets and small bodies more than wide ones.
  - "Chicken leg" and "some bright doors" got worse with louder /tʃ/ and /s/: check the /tʃ/
    release, which may now mask the /k/ after it.

### 14. A voiceless fricative's glottal opening ends voicing at its onset, not 35 ms before (reverted)

- Hypothesis: target 2 (stressed vowels too short). Printing the planned segments
  (`plan_phrases`, as `render text` plans them) showed the duration rules are not the cause:
  - Stressed vowels are planned at Klatt-like values in connected speech: the /ʊ/ of "pushes"
    121 ms (against 66 ms for the "-es"), "eats" /i/ 93, "sweet" /i/ 110, "paints" /eɪ/ 158,
    "steady" /ɛ/ 123, "reads" /i/ 119.
  - The loss is in the realisation. In the male "pushes" the /ʊ/ is planned 0.847–0.968 s but
    voices only from 0.90 to 0.93 s. The /p/'s aspiration takes the first 50 ms, and voicing
    stops 35 ms before the /ʃ/.
  - The voiceless-fricative abduction gesture (`plan_utterance`, `Gesture::new(t0 − 0.015, …,
    ramp 0.03)`) starts opening the folds 45 ms before the fricative and is fully open 15 ms
    before it.
  - The same costs every /ə/ of "the" before s, ʃ, θ or f: it is planned at 68 ms and keeps
    about half.
  - The fix tried: after a voiced segment, the folds open late in it and are fully apart early
    in the frication (Löfqvist & Yoshioka 1980), so voicing ends near the fricative's onset.
    After a pause or a voiceless segment they are already apart, so that timing stays.
- Change: `crates/chimera/src/phonetics/planner.rs`. After a vowel or a voiced consonant, the
  "voiceless" abduction gesture starts at `t0 + lag` instead of `t0 − 0.015`. Values tried:
  - lag +10 ms: the /ʊ/ of "pushes" voices 0.90–0.955 s (55 ms, up from 30), and frication
    starts at 0.96 s (planned 0.968). Speech **WORSE**: 36.09 → 42.05 %.
    - "Rice is often served" (male, 1 → 6: "Her eyes is often turned").
    - "chicken leg" (male 1 → 5, female 2 → 4).
    - "faced us" (both voices).
    - Male "sheet" → "feet" again.
    - Only "chopped" (male) moved right.
  - lag 0 ms (fully open at the onset): NO CLEAR CHANGE, 36.09 → 38.08 %.
    - Moved wrong: "the thin road" (female 2 → 5, "the fin rolled"), "chicken leg" (male 1 → 3),
      "quiet fish" (male), "faced us" (female).
    - Moved right: "birch canoe" (male 6 → 5), "rice … bowls" (female 3 → 2).
  - The trend runs one way: the later the folds open, the worse the result (−15 ms, the current
    value: 36.09 %; 0: 38.08; +10: 42.05). The voicing carried into the fricative onsets makes
    s, ʃ, θ and f weaker, or heard as voiced.
- Speech: training 36.09 → 38.08 % (lag 0) and 42.05 % (lag +10). The held-out rate also
  changed, but it isn't used.
- Singer, bench, tests: not run. The deciding verdict failed at both values.
- Verdict: reverted. The speech is not BETTER at either value.
- Commit: none (log only).
- Next: see lead 7.
  - Don't retime the fricative abduction: the early opening helps the fricative more than the
    vowel loses.
  - What is still open on stressed-vowel length:
    - The aspiration allowance: a stressed vowel after a voiceless stop gets 20 ms back for a VOT
      of about 50 ms. Klatt's rule adds 25 ms, but his aspiration is shorter.
    - The stop-closure lead: closures land about 17 ms early.
    - Lengthening the stressed vowels in the plan directly. None of these opens the fricative's
      onset.

### 15. An affricate's frication lasts until the folds close, with no [h] after it (reverted)

- Hypothesis: the affricates fail in Whisper ("chain" → "king"/"pin", "birch" → "bird",
  "chair" → "coloring"/"scheduling", "juice" → "dose", "chicken" dropped). Renders of "chain",
  "chair", "birch", "juice" and /ˈɑtʃɑ/ in both voices showed why for /tʃ/:
  - The planner splits the affricate's span at 55 %: a postalveolar closure, then the /ʃ/
    constriction to the span's end. In /ˈɑtʃɑ/ the span is 67 ms (Klatt's 70/50 ms), so the
    closure gives about 20 ms of silence and the frication starts at about 0.29 s.
  - The /ʃ/ gesture is built with the affricate's own definition, a closing one, so
    `oral_gestures_into` takes a contact release's 20 ms latency lead off its end. The
    constriction lets go about 20 ms before the span ends.
  - The folds, meanwhile, get a voiceless stop's aspiration gesture: wide (0.36) until 20 ms past
    the span's end, then a 45 ms ramp. So the release is followed by only 35–40 ms of /ʃ/
    frication (0.29–0.33 s, peak 2.2–2.3 kHz, as loud as the /ʃ/ of /ˈɑʃɑ/), then about 50 ms
    of [h] (0.33–0.38 s, energy below 1 kHz) before voicing. The same in the female "chain"
    (frication 0.13–0.18 s, then [h] to 0.23). Heard as a stop and an [h]: "king", "pin".
  - In a real /tʃ/ the frication is the voice onset time: the glottis is open behind a held
    postalveolar constriction, and voicing starts as the frication ends, with no aspiration
    after it.
- Change: `crates/chimera/src/phonetics/planner.rs`. A voiceless affricate's /ʃ/ gesture is
  held to the end of the aspiration gesture's hold (`t1 + 0.4·VOT`), with the 20 ms latency lead
  added back, since a fricative constriction lets go at once. A voiced affricate's is held to
  `t1`. The VOT and the aspiration test became two small helpers shared with the stops. The vowel
  onset (voicing) doesn't move; the [h] becomes frication. Values tried:
  - **A**, held to `t1 + 0.4·VOT` (lead compensated): /ˈɑtʃɑ/ male frication 0.29–0.36 s at
    −29 to −31 dB, then about 10 ms to the vowel; female "chain" 0.13–0.21 s, a clean /ʃ/
    spectrum (2–4 kHz on top), at about −37 dB against the vowel's −17. Speech 36.09 → 37.75 %
    (NO CLEAR CHANGE). Right: "the black chain" (male), "chopped" (male, 3 → 1). Wrong: "chicken
    leg" (male 1 → 5, female 2 → 5, "These taste like a rare dish"), "juice" (female 2 → 3).
    The stressed /ɪ/ of "chicken" kept about 20 ms of voicing before; with the constriction
    held into its onset it lost it.
  - **A + the aspiration allowance for affricates** (`durations.rs`: a stressed vowel after a
    voiceless affricate gets the 20 ms that one after a voiceless stop gets, since the same
    abduction gesture eats its onset): speech 36.09 → **37.09 %** (training, NO CLEAR CHANGE),
    45.67 → 48.33 % (held-out). Right: "chain" (male 4 → 3), "chicken leg" (female 2 → 1). Wrong:
    "chicken leg" (male 1 → 5), "juice" (female 2 → 3, "roaster"). Chair, the female chain
    ("fin"), birch and the male chopped are as before.
  - **B**, held to `t1 + 0.4·VOT` without compensating the lead (checked by frames only): the
    [h] comes back (/ˈɑtʃɑ/ 0.34–0.38 s), and voicing in "chicken" starts no earlier. Voicing
    onset follows the folds, not the tongue. Not judged.
  - "Juice": the /dʒ/ barely changes under either. Its frication (0.10–0.14 s) is about 25 dB
    below the vowel with a flat spectrum. It is quiet, not mistimed.
- Speech: training 36.09 → 37.09 % (A + allowance) and 37.75 % (A). Held-out not used.
- Singer, bench, tests: not run. The deciding verdict failed at both values.
- Verdict: reverted. The speech is not BETTER at either value.
- Commit: none (log only). The patch (A + allowance), for a retry:
  - `planner.rs`, `Manner::Affricate`: `let open = if def.voicing == Voicing::Voiceless { 0.4 *
    stop_vot(next_vowel, prev_seg, rate) } else { 0.0 };` and the release gesture
    `add_oral(&rel.targets, split + 0.008, t1 + open + 0.02, 1.4, def.ipa)`. Here `stop_vot` is
    the stops' `if aspirated { 0.05 / rate } else { 0.012 }` with
    `aspirated = next_vowel && !prev.is_some_and(|p| p.ipa == "s")`.
  - `durations.rs`: the +20 ms test becomes `matches!(pv.manner, Some(Manner::Stop |
    Manner::Affricate)) && pv.voiced != Some(true)`.
- Next:
  - The /tʃ/ now has the right shape in the renders, and Whisper hears it in some places (the
    male "chain"). What holds it back is level: the female /tʃ/'s frication sits about 20 dB
    below her vowel, like her /ʃ/ (lead 6, experiment 13). Retry this patch on top of a fix for
    the female fricative level (the glottal pulse amplitude by fold length), not on its own.
  - The male "chicken" is a short-vowel problem (lead 7): its stressed /ɪ/ voices for only about
    20 ms between the affricate's VOT and the /k/ closure's lead.
  - /dʒ/ is a separate fault: it is quiet, and it has no abduction at all, where a voiced
    fricative gets 0.035. Look at its release's glottal setting and level, not its timing.

### Decision after experiment 15: the pop gets its own keep rule

The owner asked for the pop on "sharp" to be fixed, but a single pop can't lower the training
word error rate by the 1.5 points that batch 2's keep rule asks for. So a change aimed at target 3
is kept when the ignored test `the_p_of_sharp_does_not_pop` passes (and is un-ignored in the same
commit), speech is not WORSE, and the singer guard holds. See the README.

Experiments 13 and 15 both point at the female fricatives' level (lead 6) and both run into the
singer's note-MCD guard, which experiment 12 left with 0.008 dB of room. Whether to widen that
guard for this batch is the owner's call; until then, experiments avoid changing the female
voice's sung consonants.

### 16. A pre-placed closure behind a stop seals as the front one opens: the pop on "sharp" (kept)

- Hypothesis: target 3, under its own keep rule. A trace of the male "sharp tree" (/ɹ/
  2.063–2.123 s, /p/ 2.123–2.188, /t/ 2.188–2.250) found the following:
  - The lips seal at about 2.130 s.
  - The tongue seals for /t/ at 2.169 s, 19 ms before its planned closure. The lips open at
    2.1925, so a pocket is trapped for 23 ms.
  - The /t/'s latency lead (`early`, 31 ms for the tip) assumes a tip rising from a vowel.
    Here the tip comes from the /ɹ/ posture (TtX 5.35, TtY 9.35), already close to the ridge,
    so it reaches contact early.
  - The pressure was already 5.5x the lungs' at the seal. In the last 30 ms before it, the
    swept volume ahead of the tongue was about 4.6 cm³, pushed back through a gap closing to
    zero:
    - tip forward 2.5 cm³
    - lips un-protruding 1.5 cm³
    - jaw 1.5 cm³
    - curl unwinding 1.0 cm³
  - After the seal the pocket shrank 6.9 → 5.4 cm³ (the jaw rising 1.17 → 0.75 cm alone
    accounts for −1.1 cm³), taking the pressure to 10.5x.
  - In a trapped pocket of a few cm³, any of these motions overshoots 2x the lungs'. So the
    model can't stand an early seal at all. What it can do is seal when the lips open.
- Change: `crates/chimera/src/phonetics/planner.rs`. A stop that closes behind the stop before
  it (front-to-back place order, `closes_in_front`) is aimed `PLACED_CLOSURE_DELAY` = 25 ms later
  when its dominant articulators were set by the consonant before that stop, or by a rhotic
  vowel (`pre_placed_behind_closure`). After a plain vowel the timing is unchanged. The test
  `the_p_of_sharp_does_not_pop` is un-ignored. Values tried, as a delay on every front-to-back
  stop cluster at first (p/lung, then the first stop's release in dB re the loudest vowel, male):

  | delay | /ʃˈɑɹptɹˈi/ | /ˈɑptɑ/ | /ˈɑpkɑ/ |
  |---|---|---|---|
  | 0 (before) | 10.5x, +7.0 | 2.1x, −7.9 | 4.0x, +1.5 |
  | 15 ms | 4.5x, +6.5 | 2.2x, −4.5 | 3.2x, −0.9 |
  | 25 ms | 1.3x, −6.5 | 2.2x, −2.5 | 3.2x, −0.2 |
  | 35 ms | 1.4x, −7.0 | 2.1x, −1.8 | 3.0x, +0.3 |

  - A blanket delay makes the /p/ of "apt" louder: from a vowel the /t/ already seals as the
    lips open, so delaying it releases the /p/ into an open tract. So the rule is limited to a
    pre-placed articulator.
  - A first version counted any vowel as placing the articulators. A vowel always sets the
    tongue body, so that also moved /pk/ and /tk/; it was narrowed to consonants and rhotic
    vowels.
  - With the rule, /ˈhɛlpt/ reads 1.2x, −12.3 dB and /ˈɝptɑ/ 2.97x, +5.4 → 2.05x, −4.8 dB.
    /ˈɑptɑ/, /ˈɑpkɑ/ and /ˈɑtkɑ/ are as before.
- The /p/ of "sharp tree" (the test): male +6.9 → **−6.8 dB**, oral pressure 10.5x → **1.3x**;
  female −8.0 → −17.6 dB, 10.5x → 1.3x. The p's of "paper" sit at −6 and −7.
- Speech: word error rate 36.09 → 36.09 % (training, NO CLEAR CHANGE), 45.67 → 45.67 %
  (held-out). No word moved. Whisper hears "sharp tree" right in both voices, before and after
  ("The coated paper locks under the sharp tree.").
- Singer: training 0.584 → 0.584 (baseline 0.582, NO CLEAR CHANGE). Every guard holds: 0 notes
  off time, 0 dropped gestures, note MCD 8.628 dB (unchanged), envelope correlation 0.811,
  pitch error 4.85 cents. Held-out 0.810 → 0.810. No sung cluster in the training songs seems
  to meet the rule, or none that changes a scored term.
- Speed: `os=2` 18.4 % (baseline 18.2 %), at load average 10–17.
- Tests: fixtures blessed twice, then `cargo test --workspace --release`.
  - Everything passes, `the_p_of_sharp_does_not_pop` included, except `golden_analysis` at
    "male neutral" (9 %). That is experiment 12's geometry change (the README's airway
    exception); this change touches only the planner.
  - `bun run wasm && bun test tests`: 30 pass.
  - Fixtures restored.
- Verdict: kept under target 3's rule. The test passes, speech is not WORSE, and the singer
  guard holds.
- Commit: 8ebb020.
- Next:
  - Other front-to-back clusters still pump, from the same physics: the second constriction
    narrows to closure with the front one shut.
    - /ˈɑpkɑ/: 4.0x, /p/ at +1.5 dB (male).
    - /ˈɑbdɑ/: 6.4x, /b/ at +1.9. The folds are adducted, so the pocket runs back to the
      glottis.
    - /ˈɑtkɑ/: 3.1x.
  - None of these is pre-placed, so a delay only trades the pump for a released first stop.
    The model's articulators keep moving at full speed into a sealed or nearly sealed space.
    A real speaker's are slowed by the rising pressure, and the cheeks and lips yield. Two
    candidates: a consonant jaw target (alveolars and velars have high jaw positions, so the
    jaw would be up before the second closure), or a lip seal that leaks above a contact
    pressure (the README's "real leak path"). Both reach every stop, so watch the singer's
    note MCD.

### 17. Tense vowels heard as lax: what cuts them, and an aspiration allowance as long as the VOT (reverted)

- Hypothesis: "eats" → "it's", "sweet stone" → "switch tone", "paints" → "pinks" and "reads" →
  "greater", in both voices: the tense vowels are heard as lax ones. Experiment 14 left two
  candidates, the realisation cutting the vowel (stop closures early, aspiration longer than its
  allowance) and the vowel undershooting its target. Measured first (male, LPC formants and
  10 ms levels; a Whisper probe with the judge's settings on the six failing nonsense sentences):
  - **The closure lead depends on the vowel, but it isn't what loses the /i/.** The /t/ of
    /ɑhˈVtə/ reaches −30 dB re the vowel's peak, against its planned onset: i −7, ɪ −4, e −3,
    u 0, o +3, ɛ +7, ə +9, æ +14, ɑ +23 ms. The tip's 31 ms latency lead is fixed, but its travel
    to the ridge is 2.4 cm from /i/ and 4.2 cm from /ɑ/ (vowel-table ttY against the stop's 9.68).
    Aiming the closure by travel (16.5 ms per cm round 2.8 cm) moves /ɑ/ from +23 to −5 ms but /i/
    only from −7 to −5: after /i/ the level falls 8–9 dB in the 20 ms before contact (F1 370 →
    310 Hz) as the tip narrows an already narrow front tract. Aiming it later only (up to 21 ms
    for /i/) moved no word in the probe.
  - **The /i/ undershoots, mostly from its neighbours.** "sweet" (/i/ planned 1.682–1.792 s): F2
    reaches 2200 Hz (table 2225) only from 1.725 s, about 35 ms before the level falls for the /t/;
    the /w/ owns the tongue body until its end, then the 12 Hz dynamics take 40 ms. F1 stays at
    390–400 (table /i/ 337, /ɪ/ 424) and F3 at 2550–2700 (/i/ 2901, /ɪ/ 2603). "river eats"
    (/i/ 0.937–1.030 s, after /ɝ/): F1 about 445, F2 1650 → 2080 only as the /t/ closes. It never
    reaches /i/. This /i/ also takes `klatt_durations`' vowel-after-vowel factor (0.7), which
    applies across the word boundary.
  - **"paints"**: the /p/'s aspiration takes 1.05–1.10 s, and the /eɪ/ (planned 1.053–1.211) is
    voiced for about 70 ms, from 1.10 s to the nasal murmur at 1.17. Its /e/ sits at 465/2030 Hz,
    the table's /e/, which is only 40 Hz of F1 from /ɪ/ (424/2031), as in Hillenbrand's data. What
    separates them is length and the glide.
  - **Length is the lever.** Adding 30 ms to every stressed tense vowel (a diagnostic, not a
    rule) makes "paints" heard right in both voices, and the male "sweet stone" too.
- Change: `crates/chimera/src/phonetics/durations.rs`, the aspiration allowance (a stressed vowel
  after a voiceless stop gets back the time the aspiration eats). It is 20 ms, against the
  planner's 50 ms VOT (the abduction gesture holds to `t1 + 0.4·VOT`, then ramps for 45 ms, and
  voicing starts about 50 ms after the release). Sung durations are explicit, so this is speech
  only. Values tried, full speech judge:
  - **Diagnostic, stressed tense vowels +30 ms**: 36.09 → 37.09 % (NO CLEAR CHANGE).
    - Right: "paints" and "sweet stone" (male 4 → 2), "paints" (female 5 → 4), male "Glue",
      female "rice … served" (3 → 1) and "thrown", male "chair" (3 → 2).
    - Wrong: male "chicken leg" 1 → 7 (Whisper stops after "These days,"), "the thin road" (male
      2 → 4, female 2 → 3), female "birch" and "steady".
  - **Allowance 20 → 50 ms**: 36.09 → 36.09 % (NO CLEAR CHANGE).
    - Right: male "paints", female "thrown" and "a large size", male "steady" (7 → 6).
    - Wrong: female "sharp tree" ("tray"), male "pushes a heavy" ("has a"), female "Four hours"
      (6 → 7: Whisper stops at "For our L").
  - **Allowance 50 ms, and only where the planner aspirates** (not after /s/, as in "steady" and
    "stone", whose /t/ is unaspirated but got the allowance): 36.09 → 36.09 % (NO CLEAR CHANGE),
    held-out 45.67 → 44.67 % (not used). "paints" is heard right in both voices. Otherwise as the
    row before.
- Speech: training 36.09 → 36.09 % at best (the last two rows); held-out not used.
- Singer, bench, tests: not run. The deciding verdict failed at every value.
- Verdict: reverted. The speech is not BETTER at any value: each gain on a target word is paid
  for by a loss elsewhere. Some losses are Whisper stopping mid-sentence.
- Commit: none (log only).
- Next:
  - "paints" is solved by length: any allowance of 50 ms or more fixes it in the male voice, and
    in both when the allowance is limited to aspirated stops. Keep that variant in mind as a
    passenger for a change that moves more words. On its own it is a wash.
  - The /i/ of "eats" and "sweet" is lost to its neighbours, not to the stop: the /w/ and the
    /ɝ/ hold the tongue body until their ends, and the /i/ then needs 40 ms to arrive. Two
    untried, speech-only angles:
    - the vowel-after-vowel 0.7 factor in `klatt_durations` across a word boundary
      ("river eats"). Klatt has no such rule; a word-initial vowel isn't shortened by the
      word before it;
    - an earlier tongue-body release for /w/ and /ɹ/ before a front vowel (coarticulation: a
      speaker's tongue anticipates /i/ during the /w/ of "sweet").
  - "sweet stone" and "eats" also fail on the /ts/: with the /i/ fixed, the male hears "each"
    and "switch". A /t/ released into /s/ is heard as /tʃ/. Look at the /s/ after a /t/ release
    (its tip place and the frication's spectrum) as a separate lead.
  - The tip-travel closure lead is real (30 ms of spread from /i/ to /ɑ/) but moves sung
    consonants, so it's for after the owner's note-MCD decision.

### 18. Utterance onsets: speech's breath lead, then a click on every /f/ and /v/ (reverted)

- Hypothesis (the suggested lead): the first word goes wrong more often than chance in both
  voices ("Four hours" → "Before I was …", "A cold" → "The coated", "A large" → "Your large",
  "Her round" → "Roundtable"). Speech's breath still reaches full drive 20 ms before the first
  segment (experiment 10 moved only sung phrases), so the adducted folds may voice before the
  first segment is in place.
- What the renders showed (male and female, first 300 ms, with the planned segments; the
  speech judge's renders start their plan at 0.05 s, first segment at 0.11):
  - "A cold": the /ə/ voices from 0.08 s, 30 ms before its planned start. "Her round": [h] from
    0.06 to 0.21 s, then a voiced /ɝ/ of 80 ms that runs straight into the /ɹ/ of "round".
  - "Four hours" (both voices): a burst at 0.100 s, peaking at −15 dB (the vowel is −16), with
    its energy below 1 kHz, 10 ms before the /f/. It isn't voicing: the breath change below
    moved the voicing but not this burst. It is a click from the geometry. In "ɑfɑ" the same
    click peaks at −10 dB mid-word. Every /f/ and /v/ has it; /s ʃ θ h p/ onsets don't.
  - Its cause, from a per-millisecond probe of the tract (`HumanVoice::telemetry` and the
    frame's grid), is two discontinuities in the labiodental geometry (`anatomy/human.rs`):
    1. The lip-contact cap (`ap_eff`) switched off at labiodental 0.5 in one step. Below it,
       /f/'s lip aperture target (0.05) caps the front gaps, so on the way in the lips form a
       near-bilabial constriction (0.75 cm² at a phrase start), and at 0.5 it opens at once:
       a [b]-like release.
    2. The last front vertical ray stops meeting the lower lip once the lip tucks behind it
       (labiodental ≈ 0.53). `measure` then falls back to a floor 3.5 cm down: that sample's
       gap jumped 1.6 → 3.5 cm, its midpoint dropped 1 cm and the oral tract got 0.9 cm longer
       in one control step (7.36 → 8.28 cm).
- Change, tried in order (speech judge only; training lines read):
  - **Speech's breath timed like a sung phrase's** (`plan_phrases` reaching full drive at the
    first segment, live notes unchanged): 36.09 → 39.40 % (WORSE). No first-word error
    changed. Male "chicken leg" 1 → 5 and a few one-word shuffles. Reverted before the next
    try.
  - **The click, fixed with a flat or lip-face floor**: the cap hands over continuously
    (`ap + 0.3k·s/(1−s)`, `s` = smoothstep(0, 0.5, lab)), and a vertical in front of the
    lower lip's edge takes the lip's outer face (the outline's tangent, 0.3 : −0.4) as its
    floor. The click is gone, but a held /f/ now ends in a 0.47 cm² lip slit instead of the old
    10 cm² opening, and comes out ~5 dB quieter. 36.09 → 38.74 % (NO CLEAR CHANGE): male
    "Four hours" right ("for our steady work history", 7 → 5) and male "served", but "fine" →
    "hind", "fixes" → "hits" and "fed" → "head" (the weaker /f/ is lost).
  - **Floor slopes between the two** (probe only, male fɑ / ɑfɑ, onset peak and held /f/ in
    dB; original −15.2 / −10.4 and −36.2 / −33.4): slope 4 → −41 / −30 and −47 / −45;
    12 → −36 / −29 and −42 / −38; 20 → −31 / −24 and −39 / −37; 40 → −24 / −17 and −38 / −35.
    A steeper floor buys back the held /f/ only by bringing back the click.
  - **The floor opens with the tuck instead** (kept as the patch below): the lip-face floor
    blends to the old depth over labiodental 0.7 → 1, so a held /f/ keeps its open front. Probe:
    onset peak −37.0 / −29.9 dB (was −15.2 / −10.4), held /f/ −37.2 / −33.9 (was −36.2 /
    −33.4). Opening from 0.3 or 0.5 left part of the click (−20 and −27 dB at a phrase start).
    In the judge's "Four hours" (male) the burst at 0.09–0.10 s fell from −25 to −42 dB.
    Speech 36.09 → 37.09 % (NO CLEAR CHANGE). "Four hours" is still heard "Before I was …"
    (male), so that extra syllable wasn't the click. Moved: female "rice … served" (3 → 4),
    "juice" (2 → 3), "Four hours" (6 → 7), male "sell" right (3 → 2), "paints the sweet stone"
    (4 → 5).
- Speech: training 36.09 → 37.09 % at the last value (NO CLEAR CHANGE); held-out 45.67 →
  45.67 % (not used).
  - My first run's `tail` printed the held-out transcripts along with the training ones. I
    didn't use them for any choice; every later run printed training lines only.
- Singer, bench, tests: not run, since the deciding verdict failed at every value.
- Verdict: reverted. The speech is not BETTER: the breath retiming is WORSE, and the click fix
  removes a real artifact but doesn't move Whisper's total.
- Commit: none (log only). The patch, against 41e3777 (`crates/chimera/src/anatomy/human.rs`):
  - constants: `LAB_HANDOVER = 0.5`, `LAB_GAP = 0.3`, `LAB_FRONT_OPENS = 0.7`;
  - in the lip contact: `let lab_open = smoothstep(0.0, LAB_HANDOVER, lab); let ap_eff = if
    lab_open >= 1.0 { f64::INFINITY } else { ap + LAB_GAP * k * lab_open / (1.0 - lab_open) };`
    in place of `if lab > 0.5 { f64::INFINITY } else { ap }`;
  - in the front verticals' loop, `if let Some(mut m) = measure(...)`, then
    `if x > ll_edge.x { let face = js_min(ll_edge.y - (x - ll_edge.x) * 4.0 / 3.0, m.outer.y);
    let y_in = lerp(face, m.outer.y - 3.5 * k, smoothstep(LAB_FRONT_OPENS, 1.0, lab));
    m.inner = v(x, y_in); m.d = m.outer.y - y_in; }` before `grid.push(sample(m, 3))`.
- Next:
  - The /f/ click is an artifact for the ear: a burst at about vowel level on every /f/ and
    /v/, and in the songs too ("f" and "v" lyrics). Whisper doesn't penalise it, so like the
    pop it needs its own keep rule from the owner: a test (the onset peak of "fɑ" and "ɑfɑ"
    against the held /f/), with the singer guard and speech not WORSE. The patch above is
    ready for that. It moves the geometry snapshots; the held /f/ is within 1 dB, so no
    recalibration should be needed.
  - The first-word errors aren't the breath. "A" → "The"/"Your" didn't move when its voicing
    moved 20 ms later. Whisper may just prefer a determiner it knows for a short initial /ə/.
    "Her round" → "Roundtable" is an 80 ms /ɝ/ running into /ɹaʊ/ with no boundary between
    them: a lead for the /ɝ/ + /ɹ/ sequence, not the onset.
  - Don't retry the speech breath lead on its own.

### Decision after experiment 18: a test for the /f/ click, under the artifact rule

Experiment 18 found a click before every /f/ and /v/, as loud as a vowel. Whisper doesn't count
it, but a listener would, so it gets the same treatment as the pop on "sharp": an ignored target
test, `an_f_does_not_click` (the loudest 2 ms peak from 20 ms before the fricative to 10 ms into
it, over the fricative's median 2 ms peak; between vowels and sentence-initially, both voices;
fails above 6 dB). On the current engine it reads +8 to +20 dB; with experiment 18's patch
(`out/onset/exp18-labiodental.patch`, `LAB_FRONT_OPENS` 0.7) +0.3 to +4.6 dB. The README's
keep rule for target 3 now covers any artifact with such a test.

### 19. The labiodental geometry hands over without a step: no click before /f/ and /v/ (kept)

- Hypothesis (experiment 18 and the decision after it): two steps in the labiodental geometry
  (`anatomy/human.rs`) make a [b]-like click, about vowel level, before every /f/ and /v/. The
  lip-contact cap switched off at labiodental 0.5 in one control step, opening the near-closed
  lips at once; and the front verticals in front of the tucked lower lip fell back to a floor
  3.5 cm down, jumping the gap by about 2 cm and the tract's length by about 1 cm. Real lips
  don't do either: the lower lip leaves the upper one gradually as it slides under the incisors.
  Kept under the artifact rule, so the target is `an_f_does_not_click`, not the word error rate.
- Change: experiment 18's patch as it was (`out/onset/exp18-labiodental.patch`), in
  `crates/chimera/src/anatomy/human.rs`. `LAB_HANDOVER` 0.5, `LAB_GAP` 0.3, `LAB_FRONT_OPENS` 0.7;
  no constant was adjusted. The cap hands over as `ap + LAB_GAP·k·s/(1−s)`, `s` =
  smoothstep(0, 0.5, lab); a vertical in front of the lower lip's edge takes the lip's outer face
  as its floor and opens to the old depth from labiodental 0.7 to 1. `an_f_does_not_click` is
  un-ignored in the same commit.
  - The test: male ɑfɑ +3.3, ɑvɑ +4.6, "four hours" +0.3 dB; female +2.9, +3.9, +0.8 dB (limit
    6; +8 to +20 without the patch).
- Speech: word error rate 36.09 → 37.09 % (training, NO CLEAR CHANGE), 45.67 → 45.67 %
  (held-out). The same training moves as experiment 18's last value: male "sell" right (3 → 2);
  female "rice … served" (3 → 4), "juice" (2 → 3), "Four hours" (6 → 7, Whisper stops at "For
  our L"), male "paints the sweet stone" (4 → 5, "fast" → "first").
  - My first grep of the judge's output, and a first per-sentence diff that filtered on the
    wrong field, printed held-out transcripts along with the training ones. I didn't use them
    for anything; the lines above come from a diff filtered on `set == "train"`.
- Singer: training 0.584 → 0.589 (baseline 0.582: +0.007, within 0.05; NO CLEAR CHANGE).
  Held-out 0.810 → 0.805. Guards: 0 notes off time, 0 dropped gestures, note MCD 8.628 →
  **8.614 dB** (better, so the guard's small room isn't spent), envelope correlation 0.811, pitch
  error 4.84 cents. Terms that moved, all by 0.02 or less: level 0–.5k cost 1.23 → 1.24, H1−H2
  2.29 → 2.30, aperiodicity 0.05 → 0.07; held-out voiceless-initial onset 0.22 → 0.14.
- Speed: `os=2` 26.1 % on the first run at load average 16 (baseline file 18.2 %). Rerun back to
  back with the change reversed, twice: patched 27.9 / 23.0 %, HEAD 27.2 / 25.8 %. No slowdown;
  the change adds a few comparisons per front vertical per control step.
- Tests: fixtures blessed twice, then `cargo test --workspace --release --no-fail-fast`: 104
  pass, `an_f_does_not_click` and `the_p_of_sharp_does_not_pop` included. The one failure is
  `golden_analysis` at "male neutral" (9.2 %), experiment 12's geometry change; it reads the same
  9.2055 % with this change reversed. The slow `calibrate_vowels_reproduces_the_committed_table`
  (run with `--ignored`) passes, so the vowel tables need no recalibration. `bun run wasm && bun
  test tests`: 30 pass. Fixtures restored.
- Verdict: kept under the artifact rule. The click test passes, speech is not WORSE, the singer
  guard holds (note MCD slightly better), the bench is not slower and the tests pass.
- Commit: 5cf036b.
- Next:
  - Both artifact targets are closed. The front-to-back clusters (/pk/, /bd/, /tk/) still pump
    to 3–6x (experiment 16's "Next"); they have no target test yet.
  - The first-word errors and the /ɝ/ + /ɹ/ of "Her round" remain open (experiment 18's
    "Next").

### 20. The obstacle source's jet distance runs from the channel's exit: the female /ʃ/ before /ɑ/ (reverted)

- Hypothesis (the suggested lead: /ʃ/ is 2–4 dB quieter than /s/, where real /ʃ/ is the louder).
  A probe of `update_noise` during /ˈɑsɑ/ and /ˈɑʃɑ/ (0.30–0.36 s) found:
  - **The source is not weaker for /ʃ/.** Its constriction is wider (male 0.20 cm² against 0.09,
    female 0.17 against 0.07) and carries more flow (male 460 cm³/s against 280), so the teeth
    source's Re² term is about 1 dB *higher* for /ʃ/ than for /s/. `w_jet` is 1.00 for both in
    both voices.
  - **The female /ʃ/ before /ɑ/ loses 2 dB to `w_dist`.** Her postalveolar channel spans two
    sections (0.17, 0.19 cm²), and the narrowest is the back one, 3.02 body-cm behind the teeth,
    in the far fade (2.6–4.0): `w_dist` 0.78. The jet leaves from the front section, 2.4 body-cm
    behind. The male's narrowest section is the front one (`w_dist` 1.00), as are both /s/'s.
  - **The rest is the transfer.** With only the teeth source on, it makes all of the fricative's
    level (−27.9 dB male /s/ against −27.8 with every source on), and from the same source level the
    radiated /ʃ/ is 2.8 dB weaker than /s/ (male) and 2.1 dB weaker (female). A rough budget: the
    radiation's +6 dB/octave favours /s/'s 4.5–5 kHz peak over /ʃ/'s 2.3–2.9 kHz by about 6 dB,
    and the teeth source's 5 kHz two-pole low-pass takes back about 4.5 dB of that; the last dB
    or so is the resonances.
- Change: `crates/chimera/src/voice/human_airway.rs`, `update_noise`. The teeth source's
  distance to the teeth runs from the most anterior section of the channel still within a factor
  of the minimum area, not from the narrowest section. Values tried:
  - **A**, both fades from the exit, sections under 2× the minimum: female /ˈɑʃɑ/ −40.0 →
    −37.6 dBFS (+2.4 dB), /s/ and the male unchanged. But it also moves a dental /ð θ/'s
    reference onto the teeth (their channel of 0.17–0.22 cm² runs up to the incisors' edge), so
    the near fade turns off their obstacle noise: every "the" changes, and the female "the thin
    road" became "the fin rolled". Speech 37.09 → 39.07 % (training, NO CLEAR CHANGE), held-out
    45.67 → 43.0 %.
  - **B**, only the far fade from the exit (the jet's travel), the near (dental) fade on the
    narrowest section as before, sections under 1.5×: same /ˈɑʃɑ/ gain, dentals unchanged.
    Speech 37.09 → **39.07 %** (training, NO CLEAR CHANGE), held-out 45.67 → 45.33 %. The patch
    is in `out/e20/variant-b.patch` (gitignored).
  - In the sentence that matters, it does nothing: the female "sheet" /ʃ/ (before /i/, tongue
    fronted) sits 2.47 body-cm behind the teeth and already had full weight, as experiment 13
    found. It is still heard as "feet". The fix reaches only /ʃ/ next to a back vowel.
- Speech (B), the training sentences that moved: male "chicken leg" (1 → 3, "quick lick"),
  "rice … round bowls" (1 → 3, "a round bowl"), "thin road" (2 → 3), "bright doors sell" (2 → 3);
  female "thrown" (1 → 0), "large size" (1 → 2), "green chair … late song" (2 → 3, "red song");
  male "fast window" (5 → 4). None of them is a female postalveolar.
  - **Most of these moves are Whisper's chaos, not the sound.** Diffing the judge's renders
    against the best run's, frame by frame: the male "rice" differs by at most −72 dB (about 50 dB
    below the signal) and the male "fast window" by −108 dB (a few 16-bit steps), and Whisper still
    changed its words ("bowls" → "a round bowl", "first" → "fast"). Whisper itself is
    deterministic (the same file gives the same text twice). So a change that touches the noise
    sources anywhere can swing the training total by about ±2 points with no audible cause. The
    BETTER threshold (1.5 points) is inside that noise for any small change.
  - The judge's printed output listed the held-out transcripts, and my first `tail` of it showed
    them. I didn't use them; the sentence comparison above is filtered on `set == "train"`.
- Singer, bench, tests: not run. The deciding verdict failed at both values.
- Verdict: reverted. The speech is not BETTER at either value, and the change misses the female
  "sheet".
- Commit: none (log only).
- Next:
  - Don't retry the jet-exit distance on its own: it is right, but it only reaches /ʃ/ before
    back vowels. Fold it into whatever next lifts /ʃ/, as a part of the same physical change.
  - The /ʃ/-below-/s/ gap is in the teeth source's spectrum against the radiation, not in its
    level or weights. The source is white from 1.2 to 5 kHz in pressure, and the radiation tilts
    the output toward /s/. A real obstacle source's spectrum peaks near a Strouhal frequency of
    the jet, f ≈ St·v/D, and falls above it. With the probe's numbers, v/D is about 2.1 times as
    high for /s/ (31 m/s through 3.4 mm) as for /ʃ/ (22 m/s through 5.1 mm). A teeth source whose
    band follows the jet's v/D, with its power held to the same total (a lower peak concentrates
    the same power in a narrower band), would lift /ʃ/ at 2–3 kHz and leave /s/'s band about where
    it is now. It touches every sibilant, so watch note MCD (0.022 dB of room). Its power scaling
    needs a citation (Stevens 1998, ch. 8; Shadle 1985) before it's coded.
  - Given the ±2-point chaos, a lift aimed at the female "sheet" should be checked on that
    sentence's /ʃ/ level before spending a judge run, and its verdict read as noisy.

### Batch 2 result (experiments 11–20)

| | Baseline (4980e3b) | Best (experiment 19) |
|---|---|---|
| Speech, training word error rate | 40.73 % | 37.09 % |
| Speech, held-out | 50.67 % | 45.67 % |
| Singer, training / held-out | 0.582 / 0.789 | 0.589 / 0.805 |
| Note MCD (guard 8.636 dB) | 8.536 dB | 8.614 dB |
| The /p/ of "sharp" re the loudest vowel (male) | +7.0 dB | −6.8 dB |
| Click before /f/ /v/ over the fricative | +8 to +20 dB | +0.3 to +4.6 dB |
| Real-time load (`os=2`) | 18.2 % | 18.4 % (quiet-machine reading) |

- Kept: 12 (the narrow space in front of the raised tongue tip puts /ʃ/ at its real pitch; and
  the roof contact no longer jumps at the port window), 16 (a pre-placed closure behind a stop
  seals as the front one opens: no pop), 19 (the labiodental geometry hands over without a step:
  no click). 11 found 12's change and was reverted on a test 12 fixed; 13, 14, 15, 17, 18 and 20
  were reverted.
- The female /ʃ/, /tʃ/ and /dʒ/ are still about 20 dB below her vowels. Every fix tried (13,
  20) either broke the note-MCD guard or didn't move the speech total.
- The speech judge is noisier than its threshold (experiment 20): renders a few 16-bit steps apart
  moved Whisper's training total by about ±2 points, against the 1.5-point BETTER margin.
- Open for the owner: widen the batch's note-MCD guard (0.1 → 0.3 dB proposed), and double the
  training sentences to make the speech judge steadier.
- Listening page (shared with the owner directly; before = the baseline, now = the
  best run; four training and four held-out sentences, two songs).

### Batch review (Codex), and what changed after it

Three findings, all fixed in one commit:
- **An area jump late in the lip tuck** (experiment 19's floor in front of the lower lip blended
  toward its open depth before a ray reached the lip's edge): up to 1.27 cm² at lab 0.75–0.94.
  The opening now grows from the edge over 0.1 cm. `geometry_continuity` sweeps the tuck from
  /f/-like postures, which the vowel sweeps never reached. A held /f/ is 1.5–2.8 dB quieter.
- **Experiment 16's delay overran short sung stops** (a /t/ closure 23 ms into the next vowel at
  a quarter beat, 180 bpm). It is capped at the stop's length less 30 ms; `sing_fast` has the
  reproduction.
- **The speech judge printed held-out transcripts**, which experiments 18–20 then saw (they say
  so in their entries). It prints training ones only.

After the fixes: speech 36.75 % training, 44.33 % held-out; singer 0.587, held-out 0.811, note
MCD 8.614 dB. `out/hill/best` holds this run, and the listening page was rebuilt from it.

### Batch review, round 2

- **Fixed, confirmed:** the cluster delay keeps every gesture ordered and inside its stop for
  durations of 10 ms and up (velars included), and the speech judge prints training transcripts only.
- **Still open, not new:** with the lips protruded and narrowed, the first front ray (behind the
  lower lip's edge, outside the new ramp) switches to a higher crossing of the lip's curve as the
  lip tucks: 0.41 cm² at lab ≈ 0.86 (NEUTRAL, jaw 0.3, lipAp 0.05, lipProt 0.2, lipWidth 0.5). Main
  has the same jump (0.30 cm²); this batch made it larger. It is kept as the ignored test
  `geometry_continuity::no_area_jumps_as_a_protruded_lower_lip_tucks` (jumps up to 0.48 cm²) and
  is lead 10 for the next batch: the lip-curve crossing that rays behind the edge pick.
- **Declined:** a stop shorter than 10 ms still holds its closure past its end (the minimum hold
  in `oral_gestures_into`). It predates this batch, and no planner produces one (the sung floor is
  12 ms).

## A judge against real voices (2026-11-07, between batches)

The owner found batch 2 much harder to hear than batch 1 (now 3, before 1, can't tell 4, songs
can't tell). Whisper had called it 4 points better: one noisy number that says nothing about
which sound is wrong. The owner asked for structural fixes rather than judge-loosening (the
proposed wider MCD guard), and for a judge built on real voices.

`chimera compare tsp` ([../speech-comparison.md](../speech-comparison.md)) says the Harvard
sentences 23 real speakers read (the TSP speech database) and compares each sound with theirs.
No batch uses it yet: whether it decides the next batch, and Whisper guards, is the owner's call.

- **The score.** 1.583 on the training speakers' sentences, 1.706 held-out. A real speaker gets
  0.277. It scores consonant levels, sibilant centroids and timing; spectrum, formants, voice
  quality, voicing and intonation are reported as diagnostics.
- **Both batches gained on it.** 1.994 before batch 1, 1.797 after, 1.583 after batch 2.
- **The leads it gives, largest first:**
  - **Female sibilant levels and centroids.** /ʃ/ −23 dB re her stressed vowels against the
    women's −7; /tʃ/ −26 against −9. /s/ centroid 4.7 kHz against 7.4; /z/ 4.0 against 7.1. No
    batch has moved the levels.
  - **Short closures and affricates.** /k/ 0.7 of a mean phone against 1.1–1.2; /dʒ/ 0.5 against
    1.2–1.3.
  - **/ð/ and /v/** 7–11 dB too loud.
  - **The male /ʃ/ centroid**, overshot by batch 2 (3.48 kHz, men 3.13).
  - **A diagnostic:** the voice lacks 1–4 kHz presence after batch 1 (female 1–2 kHz −16.1 dB re
    0–8 kHz, women −10.8). That is a spectral shape to fix, not a tilt.

## Batch 3: clarity (from 2026-11-08, fork amurchadha/chimera-vocal-synth)

The same rules as batch 2 (speech decides, the singer guards). The goal is the male voice's
clarity: it raps in a performance, and even at talking speed Whisper misses about 40 % of its
words.

### The judge for batch 3

- `speech_wer.py` averages each sentence over five start offsets (0, 0.07, 0.15, 0.23, 0.31 s;
  commit 8f37d38). One render's training rate moved 36.75 to 40.73 % with the offset alone (ten
  offsets measured); the five-offset mean roughly halves that. Single-offset numbers from
  batch 2 aren't comparable with batch 3's.

### Batch 3 baseline (commit 1717b57's sound = batch 2's best; `out/hill/baseline`)

- Speech, training: **39.74 %** (harvard female 47.0, male 28.5; nonsense female 39.72, male
  44.23). Held-out: **43.93 %**. Training rate at each offset alone: 38.74 to 40.73.
- Singer: training 0.587, held-out 0.811 (as batch 2's best after its review).
- Speed: 14.7 % of one core (`os=2`, this machine).
- The rap work on this branch (`render rap --speedup/--lively/--reduce`) is opt-in and changes
  no speech or singing render (goldens unchanged).

### 21. A voiceless stop is aspirated before the approximant of its onset cluster (reverted)

- Hypothesis: the planner aspirated a voiceless stop only when a vowel follows it
  (`aspirated = next_vowel && …`), so the /p/ of "planks" and the /k/ of "quiet" were released
  with a 12 ms VOT into a voiced /l/ and /w/: [bl] and [gw]. Whisper heard "blanks" and
  "glides"/"glazed"/"glad" at every offset, in both voices. In English a stop that begins an onset
  cluster with /l ɹ w j/ is aspirated, and the aspiration devoices the approximant (Klatt 1975:
  VOT before a sonorant is, if anything, longer than before a vowel).
- Change: `crates/chimera/src/phonetics/planner.rs`: a voiceless stop is also aspirated (VOT
  50 ms, as before a vowel) when it and the next segment, an approximant or lateral followed by a
  vowel, make a legal onset (`syllables::is_onset`, the ONSETS list made public) and no word
  boundary falls between them (`Seg` gets the input's `word_end`; "dark rope" keeps a coda /k/).
  `sing.rs` marks a sung word's last segment `word_end`, so a coda before the next word's
  approximant isn't aspirated in songs. One value (50 ms). The patch is in
  `/Volumes/hd/tmp/e21-onset-cluster-aspiration.patch` (outside the repo).
- Speech: word error rate 39.74 → 39.47 % (training, NO CLEAR CHANGE), 43.93 → 43.87 %
  (held-out). Training rate at each offset: 38.74 to 40.73.
  - "quiet" is heard at every offset in both voices (male "the glides fish" → "a quiet fish";
    female 3.4 → 1.8).
  - "planks" lost its [b] but not its error: "plangs" (male 6.0 → 5.8; female unchanged).
  - Male "Some bright doors" became "A sunrise door" at every offset (4.2 → 4.8), and the male
    "One tall cloud" lost "One" at one offset (0 → 0.4). Neither touches a changed cluster
    ("bright", "cloud" and "truck" are heard as before).
- Singer, bench, tests: not run. The deciding verdict failed.
- Verdict: reverted. Speech is not BETTER: it fixes one word in two voices, about 0.7 points.
- Commit: none (log only).
- Next: the patch is right phonetics and costs nothing elsewhere (no cluster word got worse).
  Keep it as a passenger for a change that moves more words, as experiment 17's "paints" is.

### 22. /w/ is a narrower, more rounded and backed /u/, not /u/ with less protrusion (kept)

- Hypothesis: Whisper heard the male "walks" as "locks", "quiet" as "glides"/"glazed" (both
  voices) and "hogs were" as "haggard with/was", at nearly every offset: the /w/ sounds like an
  /l/ or nothing. Its targets were /u/'s (lipAp 0.28 against the male /u/'s 0.29, tbX/tbY
  2.45/7.45 against 2.42/7.43) with less protrusion (1.0 against 1.4). So it formanted like a
  short /u/: in the male /əˈwɔks/ (LPC, 10 ms frames) F1 about 400 Hz, F2 990, only 8 dB below
  the vowel; female 470/1170. An F2 near 1 kHz is a dark /l/'s, and /w/ barely differed from the
  /ɔ/ after it (F2 1070). A glide is a narrower version of its vowel (Stevens 1998, ch. 9): a real
  /w/ has F1 near 300 and F2 about 600–750 Hz in men (Lehiste 1964; Espy-Wilson 1992), with an
  F2 well below the back vowel's.
- Change: `crates/chimera/src/phonetics/inventory.rs`, the /w/ targets: lipAp 0.28 → 0.10,
  lipProt 1.0 → 1.4 (/u/'s), tbX 2.45 → 2.1 (further back), tbY 7.45 → 7.4. Probes of a long and
  a short /w/ (male /əˈwɔks/ unless said):
  - lips alone (0.15 and 0.10, tbX 2.45): F2 990 → 920 → 870, F1 about 360. The lips can't take
    F2 down alone.
  - tbY 7.6 (tbX 2.2): the dorsum seals (−50 to −70 dB). Too high.
  - tbX 2.0, tbY 7.3, lips 0.10: F1 370–400, F2 735; female 440/800.
  - **tbX 2.1, tbY 7.4** with lips 0.10 / 0.08 / 0.06: F2 670–740 / 660–730 / 650–690, F1
    335–395 in all; the /w/ sits 17–20 dB below the vowel (female 13 dB; F1 435–460, F2 805–870
    at 0.10). F1 stays above 300 at every value: the lips set F2 here more than F1.
  - A Whisper probe with the judge's settings (render, trim, five offsets) on the nine training
    sentences with a /w/, both voices (the others render bit-identically, so the judge's total
    follows): errors 50.6 at HEAD, 45.6 at lips 0.10, 46.6 at 0.08, 46.0 at 0.06. The three
    values are within a word of each other, which is the judge's chaos; 0.10 was taken. At 0.08
    the total would have read −1.32 points, NO CLEAR CHANGE.
- Speech: word error rate 39.74 → **38.08 %** (training, **BETTER**, −1.66), 43.93 → 43.13 %
  (held-out). Harvard male 28.5 → 24.75, nonsense male 44.23 → 44.23; Harvard female 47.0 →
  45.5, nonsense female 39.72 → 38.59. Training rate at each offset: 36.09 to 39.74.
  - Right: "The hogs were fed" (male 2.2 → 0.4, female 3.0 → 2.0: "haggard" → "hogs were"),
    male "walks" (3.0 → 2.0), female "quiet" (3.4 → 3.0), male "Four hours of steady work"
    (4.6 → 3.4), female "wet bird" (0.4 → 0) and "depth of a well" (5.0 → 4.8).
  - Heard but not counted: the male "quiet" at every offset (it was "glides"), but it loses
    "the", so that sentence stays at 4.2; the female "walks" is now "rocks", not "locks" (3.0).
  - Wrong: male "A fast window paints" (4.0 → 4.6, "pinches" → "pins", "fast" → "first" at
    more offsets), male "One tall cloud" (0 → 0.4, "The one" at two offsets), female "The box
    was thrown" (0 → 0.2).
  - Still wrong in both voices: "cold" → "coated", "A" → "The", the /ts/ of "sweet stone".
- Singer: training 0.587 → 0.587 (NO CLEAR CHANGE, +0.000 like for like), held-out 0.811 →
  0.811. Guards: 0 of 5793 notes off time, 0 dropped gestures, note MCD 8.614 → 8.610 dB,
  envelope correlation 0.811 → 0.812, pitch error 4.85 → 4.86 cents. Terms moved by 0.01:
  level 4–8k 0.52 → 0.51, H1−H2 2.30 → 2.29, aperiodicity 0.06 → 0.07.
- Speed: `os=2` 14.7 % (baseline 14.7 %), run right after the judges at load average 15.
- Tests: fixtures blessed twice (only `planning.json` moves), then `cargo test --workspace
  --no-fail-fast`: 111 pass, 0 fail, 2 ignored. `bun run test`: 30 pass. `bun run typecheck`:
  clean. Fixtures restored.
- Verdict: kept. Speech BETTER, the singer guard holds, the bench is unchanged and the tests
  pass. The margin is thin: 0.16 points past the threshold, from a value chosen among three that
  the judge can't tell apart. The formants are the stronger evidence: /w/ moved from a dark /l/'s
  F2 to a /w/'s.
- Commit: db00357.
- Next:
  - /w/'s F1 is still 335–395 Hz (male), above a real /w/'s ~300, and its level dip (17–20 dB) is
    deeper than the old one; listen for a /w/ that sounds like a [b]. A smaller tbX moves F2 more
    than the lips do.
  - "cold" → "coated" (both voices, every offset): in a probe of the male /ə ˈkoʊɫd ˈpeɪpɚ/ the
    /ɫ/ reads F1 400, F2 1320, F3 about 1930 Hz at −11 dB (the vowel is −7): an F2 far above a
    male dark /l/'s (~800–1000 Hz) and an F3 low like an /ɝ/'s, so it sounds like a vowel
    after a tap. Look at the /ɫ/ targets (tbX 1.9, tbY 6.8) and the lateral channel.
  - Experiment 21's onset-cluster aspiration can ride with a change like this one: with it,
    "quiet" was heard in both voices.

### The real-speaker judge decides from here; experiment 22 re-judged (reverted)

After experiment 22, the original repo's `chimera compare tsp` was merged (45880cf). Its owner
found batch 2 harder to hear although Whisper scored it 4 points better, so from experiment 23
this batch is judged as follows:
- **TSP decides:** BETTER against `out/tsp/best/score.json` (score down at least 0.01, no
  scored term up more than 0.5).
- **Whisper guards:** not WORSE against `out/hill/best/speech/wer.json`.
- **The singer guards** as before.

Experiment 22 under TSP, against the same build without it: **WORSE** (training 1.584 → 1.583,
held-out 1.706 → 1.691, but four terms broke): male level w cost 0.68 → 3.35 (the narrower /w/
dips too far below its vowels, as its entry feared), male duration w 0.38 → 1.35, female duration
w 0.26 → 1.42, female level tʃ 10.38 → 11.03. Reverted (61b9e41). Whisper had called it
BETTER by 0.16 points over its margin; the formant argument still stands, but the fix has to
keep /w/'s level. `out/hill/best` is the batch baseline again; `out/tsp/best` is the TSP run
of the build without it: 1.584 training, 1.706 held-out (male 1.0, female 2.2).

### 23. Experiment 15 again under the real-speaker judge: an affricate's frication is its VOT (reverted)

- Hypothesis: the male's two largest TSP costs after /dʒ/'s length are affricates: level tʃ
  −18.8 dB re his stressed vowels against the men's −10.9 (cost 4.27) and duration tʃ 1.16
  against 1.52 (1.66). TSP measures an affricate's level on its second half, the frication.
  Experiment 15 found why that half is weak: the planner releases the /ʃ/ constriction about
  20 ms before the span ends (a closing gesture's latency lead) while the folds stay apart for a
  stop's aspiration, so 35–40 ms of /ʃ/ is followed by about 50 ms of [h]. In a real /tʃ/ the
  frication is the voice onset time. Whisper had called experiment 15 NO CLEAR CHANGE; this
  judge measures the frication directly.
- Change: experiment 15's patch (A + allowance), on the current planner. `planner.rs`: the
  aspiration test and VOT (with the rap work's squeeze) computed once per consonant; a voiceless
  affricate's /ʃ/ gesture held to `t1 + 0.4·VOT + 0.02` (the aspiration hold, the closing lead
  added back), a voiced one's to `t1 + 0.02`. `durations.rs`: a stressed vowel after a voiceless
  affricate gets the 20 ms aspiration allowance a voiceless stop's gets. One value. Probe, male
  /ˈɑtʃɑ/: frication 0.30–0.36 s at about −14 dB re the vowel, then about 10 ms to voicing, as
  experiment 15 measured.
- Real speakers (TSP): training 1.584 → 1.595 (**WORSE**), held-out 1.706 → 1.691.
  - Male 0.974 → **0.933**: level tʃ 4.27 → 2.21 (−18.8 → −15.7 dB), duration tʃ 1.66 → 0.75,
    duration dʒ 4.23 → 3.69, centroid tʃ 0.30 → 0, spectrum tʃ (diagnostic) 2.62 → 1.90. Against:
    centroid z 3.14 → 3.40 (3889 → 3822 Hz; no /z/ changed, so alignment moves in nearby phones).
  - Female 2.194 → 2.258: level tʃ 10.38 → 9.48 (−25.8 → −24.5 dB), but **centroid tʃ 0.99 →
    1.99** (3359 → 3076 Hz, women 4006), the term that breaks. Her /tʃ/'s second half is now her
    /ʃ/, whose centroid is already low (3341 Hz, women 4045; lead 6). The [h] it replaced sat
    higher. Centroid s 4.50 → 4.66 too.
- Whisper, singer, bench, tests: not run. The deciding verdict failed.
- Verdict: reverted. WORSE on one broken term (female centroid tʃ +1.0) and the score (+0.011):
  the male gains 0.041, the female loses 0.064, all of it in her sibilant group (five terms, so
  each centroid weighs six times a level or duration term).
- Commit: none (log only).
- Next: the patch is right for the male on every affricate term. It is blocked by the female
  /ʃ/'s spectrum, not its own logic: fix her /ʃ/ centroid (3.3 kHz against 4.0) first, then retry
  this unchanged. Also found while probing (not judged): the male /s/ peaks at 3.2–3.5 kHz in
  /əˈsi/ and /əˈsɑ/ whatever the teeth source's low-pass (5, 10 or 20 kHz) or the jaw (0.3, 0.15,
  0.05 cm); only the high bands rise with the low-pass, and the /ʃ/ centroid rises faster than the
  /s/'s (male /ʃ/ 3.9 → 5.4 kHz at 20 kHz), so a wider teeth source alone would break the male
  centroid ʃ. The /s/ front cavity holds a 3.5 cm² chamber 1 cm in front of the constriction
  (the region the `ahead` law covers), which a laminal /s/ with the tip down wouldn't have.

### 24. The teeth (obstacle) source is too weak against the jet: sibilants barely above /f/ (reverted)

- Hypothesis: TSP's speakers put the sibilants far above /f/: men /ʃ/ −8.9 and /s/ −9.0 dB re
  their stressed vowels against /f/ −23.6 (women −7.0, −10.9, −24.0). The synth doesn't: male
  /ʃ/ −14.7 (cost 2.51) and /tʃ/ −18.8 (4.27), female /ʃ/ −23.2 (8.80), /tʃ/ −25.8 (10.38), /s/
  −21.5 (2.07). Experiment 13 found that the obstacle source (the jet striking the incisors,
  Shadle 1985) adds only 9–10 dB over the jet source, so /ʃ/ is no louder than /f/ in either
  voice. It doubled the gain, and the singer's note MCD sank it with 0.008 dB of headroom. TSP
  measures these levels directly, and batch 3's singer guard is the training score (+0.05).
- Change: `NoiseGains.teeth` 3.0e-6 → X in `crates/chimera/src/voice/human_airway.rs`, smaller
  steps than experiment 13's 6e-6. Probe at 4.5e-6 (male and female /ˈɑ_ɑ/, middle half re the
  first vowel): male /s/ −10.4 → −7.0, /ʃ/ −14.2 → −10.8, /tʃ/ −18.6 → −15.5, /t/ burst −6.0 →
  −3.2; /d/ burst, /f/, /p/, /k/ unchanged. Female /s/ −20.5 → −17.2, /ʃ/ −23.6 → −20.2, /tʃ/
  −28.4 → −25.5, /t/ burst −15.3 → −13.6. Two values judged:
  - **4.0e-6**: training 1.584 → 1.553 (−0.031), held-out 1.706 → 1.684, but **WORSE**: three
    terms broke.
    - Male 0.974 → 0.916: level ʃ 2.51 → 1.09 (−14.7 → −12.3 dB), level tʃ 4.27 → 3.21, level s
      0.22 → 0, level p 1.60 → 1.00, duration z 2.16 → 1.75, centroid ʃ 0.77 → 0.39, centroid
      tʃ 0.30 → 0. Broke: **burst d 0.46 → 0.96** (tip releases get the obstacle noise too) and
      **level θ 0.30 → 0.92** (−19.4 → −17.3 dB: the dental jet sits in `w_dist`'s near fade,
      0.15–0.5 cm behind the teeth, so it gets part of the gain). Against: centroid z 3.14 → 3.41.
    - Female 2.194 → 2.189: level ʃ 8.80 → 7.35, s 2.07 → 1.41, burst t 2.87 → 2.31, level tʃ
      10.38 → 9.98, level dʒ 1.83 → 1.43. Broke: **duration k 3.37 → 4.14** (MFA gives more of
      the /sk/ and /ks/ clusters to the louder /s/). Against: centroid ʃ 2.24 → 2.49, tʃ 0.99 →
      1.31 (more weight on her low /ʃ/ resonance).
  - **3.5e-6**: training 1.584 → 1.559 (−0.025), held-out 1.706 → 1.695, **WORSE**: one term
    broke, **female level g 2.03 → 2.59** (−27.1 → −28.4 dB). No /g/ jet reaches the teeth, so
    that is the alignment moving.
    - Male 0.974 → 0.942: level ʃ 2.51 → 1.76, level p 1.60 → 1.00, level tʃ 4.27 → 3.92,
      duration v 0.63 → 0.29, duration z 2.16 → 1.89, duration k 3.58 → 3.35, centroid tʃ 0.30
      → 0.04, centroid ʃ 0.77 → 0.57, level s 0.22 → 0. Against: centroid z 3.14 → 3.40, level θ
      0.30 → 0.65, centroid s 2.71 → 2.76.
    - Female 2.194 → 2.176: level ʃ 8.80 → 8.07, s 2.07 → 1.76, burst t 2.87 → 2.58, duration
      k 3.37 → 3.10 (the term that broke at 4.0e-6), level dʒ 1.83 → 1.59, centroid z 7.58 →
      7.41. Against: level g, centroid ʃ 2.24 → 2.34, centroid tʃ 0.99 → 1.18.
- Whisper, singer, bench, tests: not run. Neither value passed the deciding verdict.
- Verdict: reverted. Both values are WORSE on broken terms, though both lower the training
  score (−0.031, −0.025) and the held-out one.
- Commit: none (log only).
- Next:
  - The gain is right for the levels, and its breaks are side effects: θ through `w_dist`'s near
    fade, the /d/ burst, and alignment terms (female duration k breaks at 4.0e-6 but improves at
    3.5e-6; level g breaks at 3.5e-6). A term that moves the wrong way and then back between two
    close values is the aligner. Retry with the obstacle weight cut for a dental jet (`behind`
    under 0.5 cm), which would keep θ out of it.
  - The sibilant spectra are the bigger error, and a louder obstacle source puts more weight on
    them. Mean band levels (dB re 1–10 kHz) in the middle half, TSP training lists, synth from
    `out/tsp/best`, real from the TSP recordings:

    | | 1–2k | 2–3k | 3–4k | 4–5k | 5–6k | 6–8k | 8–10k |
    |---|---|---|---|---|---|---|---|
    | male /ʃ/ synth | −9.1 | −4.0 | −10.0 | −12.8 | −13.5 | −9.0 | −14.8 |
    | male /ʃ/ real | −15.4 | −3.9 | −6.6 | −13.7 | −13.7 | −13.1 | −22.1 |
    | female /ʃ/ synth | −13.0 | −2.5 | −9.0 | −13.7 | −16.6 | −16.8 | −11.0 |
    | female /ʃ/ real | −22.9 | −11.6 | −3.1 | −9.5 | −11.3 | −12.3 | −20.7 |
    | male /s/ synth | −20.5 | −10.8 | −5.3 | −8.6 | −12.0 | −11.1 | −13.7 |
    | male /s/ real | −22.0 | −21.4 | −12.1 | −7.5 | −8.2 | −7.6 | −10.0 |
    | female /s/ synth | −23.8 | −14.2 | −6.7 | −6.8 | −10.3 | −10.2 | −12.5 |
    | female /s/ real | −25.5 | −25.0 | −20.7 | −15.2 | −10.5 | −5.1 | −5.0 |

    The female /ʃ/ resonance is about 1 kHz low: 2–3 kHz against her 3–4 kHz. Her front cavity
    is too long by about 1 cm, or its 2.9 cm² chamber is too big. Both voices' /s/ peaks at
    3–5 kHz where real /s/ is flat or rising to 10 kHz, so the /s/ front cavity resonates about
    an octave low. The male /ʃ/ is close except for its 6–10 kHz excess.

### 25. The female glottal pulse follows her fold size, not the body scale squared (kept)

- Hypothesis: the female's obstruents sit much further below her vowels than real women's do
  (TSP: level ʃ −23.2 dB against −7.0, tʃ −25.8 against −8.8, h −29.8 against −16.1, t −25.3
  against −16.8; burst k −21.7 against −12.9). Experiment 13 split the gap between the body and
  the source. The source half: her glottal pulse is 0.17·k² cm², 0.81 of the male's, where real
  female peak glottal flow is about 0.64 of the male's (Holmberg et al. 1988), with folds about
  0.67 of his length (Hirano). Her vowels are too loud for her folds, and the output gain's level
  match then pushes her frication down. The turbulence sources don't follow the pulse (a
  voiceless consonant's flow is set by the abduction and the constriction), so a smaller pulse
  with the gain re-levelled lifts every female obstruent against her vowels. The male is
  untouched, so his terms can't break.
- Change: `HumanBody.folds`, the glottal pulse area relative to the adult male's
  (`crates/chimera/src/anatomy/human.rs`): male 1.0, female 0.64, child 0.74² (unchanged), blended
  like the other body parameters. `voice/human_voice.rs`: the pulse amplitude is `0.17·folds`
  (was `0.17·scale²`), and the output gain is multiplied by `scale²/folds` to keep the vowel level.
  Abduction and the posterior chink still scale with `scale²`. `src/wasm/types.ts`: the field.
  One value. Probe, /ˈɑ_ɑ/ middle half re the first vowel, female: /s ʃ tʃ t k g h/ up 1.8–1.9 dB,
  /z/ 1.0, /ð/ 0.8, /v/ 0.2; the vowels themselves +0.15 dB. Male and child renders are
  bit-identical.
- Real speakers (TSP): training 1.584 → **1.517 (BETTER)**, held-out 1.706 → 1.631.
  - Male 0.974 → 0.974 (identical).
  - Female 2.194 → 2.059. Level group 1.802 → 1.494, sibilants 3.823 → 3.735, timing 0.957 →
    0.949. Level ʃ 8.80 → 7.83 (−23.2 → −21.6 dB), tʃ 10.38 → 9.57, burst k 3.30 → 2.46,
    burst t 2.87 → 2.11, level t 2.58 → 1.87, level g 2.03 → 1.39, burst d 1.09 → 0.48, level h
    4.71 → 4.11, level d 2.12 → 1.52, level f 0.75 → 0.17, level k 1.73 → 1.19, burst g 0.49 →
    0, level s 2.07 → 1.69, duration tʃ 2.27 → 1.93, centroid z 7.58 → 7.37. Against: duration p
    0.64 → 0.95, duration n 1.13 → 1.44, duration k 3.37 → 3.61, level w 0.80 → 1.04, duration θ
    1.88 → 2.09, level v 1.05 → 1.19, duration f 1.21 → 1.34. No term rose by more than 0.31.
  - Diagnostic, not scored: the vowels' tilt is steeper. Band 1–2 kHz −16.3 → −17.1 dB re the
    vowel (women −10.8), 2–4 kHz −22.6 → −23.3 (women −16.4); voice group 0.654 → 0.767. A
    smaller pulse against an unchanged chink is a breathier source.
- Speech (Whisper, guard): training 39.74 → 38.48 % (NO CLEAR CHANGE, so not WORSE), held-out
  43.93 → 43.33 %. Harvard female 47.0 → 44.0, nonsense female 39.72 → 37.75, male unchanged.
  The female "hogs were fed chopped corn" is now heard after "haggard" (3 → 2). "Thrown" and
  "late" each slip by part of a word.
- Singer (guard): training 0.587 → 0.582 (−0.003 like for like, NO CLEAR CHANGE), held-out 0.811
  → 0.805. No guard broken: 0 notes off time, 0 dropped gestures, note MCD 8.614 → 8.580 dB,
  envelope correlation 0.811 → 0.813, pitch error 4.85 → 4.86 cents. Level 4–8 kHz 0.52 → 0.34
  (the songs' vowels are darker too, which here is toward her), H1−H2 2.30 → 2.32.
- Speed: `os=2` 14.9 % (baseline 14.7 %, load average 13). The change is a constant.
- Tests: fixtures blessed twice (only `voice-speech-female-96k.f32` changes), then `cargo test
  --workspace` 116 pass, `bun run test` 30 pass, `bun run typecheck` and `bun run build` clean.
  Fixtures restored. `bun tools/e2e.ts` (for the `src/wasm/` type) times out clicking the Sing
  radio, identically at HEAD, so that failure is older than this change.
- Verdict: kept. `out/hill/best` and `out/tsp/best` are this run; the old ones are in
  /Volumes/hd/tmp/aside-10-31/.
- Commit: ec61c00.
- Next:
  - Retry experiment 23 (affricate frication held to the folds' closure) on top of this. Its
    break, female centroid tʃ, barely moves here (0.99 → 0.89), so it would likely still break.
    The female /ʃ/ resonance is the blocker (experiment 24's band table: 2–3 kHz against her
    3–4 kHz).
  - The steeper female vowel tilt: scaling the chink with `folds` instead of `scale²` would test
    whether it's the leak. The female spectrum and voice groups are diagnostic in TSP, but the
    singer's level bands are scored.
  - Experiment 24's teeth gain at 3.5e-6 broke only female level g (2.03 → 2.59), which is now
    1.39 here; retried on this base, that term has room.

### 26. The teeth (obstacle) source's band follows the jet's v/D, not one fixed 5 kHz (reverted)

- Hypothesis: the male's largest sibilant costs are the /s z/ centroids (s 4229 Hz against the
  men's 5725, cost 2.71; z 3889 against 5117, 3.14), and the female's are the same plus her /ʃ/
  (s 4728/7414, z 4062/7072, ʃ 3350/4045). Every jet that reaches the incisors got the same noise
  band (white, high-passed at 1.2 kHz, two poles at 5 kHz), the male /ʃ/'s. A turbulent jet's
  noise spectrum scales with v/D (a Strouhal number; Stevens 1971), and through a constriction
  that takes most of the pressure drop v is about the same whatever its size, so the band should
  follow 1/D ∝ 1/√A: an /s/ (0.085 cm²) brighter than an /ʃ/ (0.2 cm²), a smaller body's jets
  brighter than a larger one's. Lead 6's band table shows both voices' /s/ short of energy above
  5 kHz.
- Change: `crates/chimera/src/voice/human_airway.rs`, the teeth source's low-pass is
  `5000·√(0.2/A)` Hz at the narrowest section A (so the male /ʃ/, the calibration target 0.2 cm²,
  keeps 5 kHz), capped at 10 kHz (its value at 0.05 cm², so a stop's first opening has a bounded
  band); its gain unchanged. One value. Probes (/ˈɑ_ɑ/, middle half, 1–10 kHz centroid; male, then
  female): /s/ 5189 → 5474 and 5675 → 6056 Hz, +2.4 and +3.4 dB; /z/ 5147 → 5278 and 4619 →
  5074; /tʃ/ 3076 → 3299 and 3117 → 3457; /ʃ/ 3080 → 3056 and 3225 → 3263; θ, the /t d/ bursts
  within 0.5 dB. Tried while probing, not judged: the same band with the source's power held
  (gain × √(5000/f)): the same centroids, about 1–2 dB quieter; and a teeth low-pass of 8 and 12
  kHz for every jet: the /ʃ/ centroid rises faster than the /s/'s (male /ʃ/ 3080 → 3456 → 3810),
  as experiment 23 found.
- Real speakers (TSP): training 1.517 → 1.351 (−0.166), held-out 1.631 → 1.451, but **WORSE**:
  two terms broke, both male affricate centroids.
  - Male 0.974 → 0.935 (held-out 1.025 → 0.911): centroid z 3.14 → 2.20 (3889 → 4139 Hz), s 2.71
    → 2.16 (4229 → 4421), ʃ 0.77 → 0.67, level p 1.60 → 1.08, level tʃ 4.27 → 3.90, duration z
    2.16 → 1.89, level s 0.22 → 0, duration tʃ 1.66 → 1.47. Broke: **centroid tʃ 0.30 → 0.91**
    (3725 → 3932 Hz, men 3320) and **centroid dʒ 0 → 0.57** (2880 → 3566, men 3072). Against
    too: burst d 0.46 → 0.88 (−8.2 → −7.6 dB).
  - Female 2.059 → 1.768 (held-out 2.238 → 1.991): sibilants 3.73 → 2.98. Centroid s 4.50 → 3.52
    (4728 → 5124 Hz), dʒ 3.71 → 2.79, z 7.37 → 6.65, tʃ 0.89 → 0.22 (3392 → 3596), ʃ 2.21 → 1.70
    (3350 → 3449); level s 1.69 → 0.95, burst t 2.11 → 1.67, duration p 0.95 → 0.54, burst of
    final stops 1.28 → 0.87, level t 1.87 → 1.55. Against: duration k 3.61 → 3.91, level ð 2.39
    → 2.67.
- Whisper, singer, bench, tests: not run. The deciding verdict failed.
- Verdict: reverted. WORSE on two broken terms, though the training score falls by 0.166, the
  largest step in the batch, and the held-out by 0.180.
- Commit: none (log only).
- Next: both breaks are the male affricates' second halves, the part TSP measures: the release's
  opening jet (A small and growing, so a band up to 10 kHz) and then [h], not a held /ʃ ʒ/.
  Experiment 23 holds the /ʃ/ constriction through that half, and alone it lowered the male
  /tʃ/ centroid to 3369 Hz (cost 0) while its break was the female /tʃ/ centroid, which this
  change raises (3392 → 3596). The two are complementary: experiment 27 tries them together.

### 27. Experiments 26 and 23 together: the jet's band, and an affricate's frication held through its VOT (reverted)

- Hypothesis: experiment 26's two breaks were the male affricates' second halves, which TSP
  measures: the release's opening jet, its area small and growing (a band up to 10 kHz), then
  [h]. Experiment 23 holds the /ʃ/ constriction through that half (the frication is the VOT); alone
  it took the male /tʃ/ centroid to 3369 Hz (cost 0) and broke only the female /tʃ/ centroid
  (3359 → 3076), which experiment 26 raises (3392 → 3596). Each fixes the other's break.
- Change: experiment 26's band (unchanged, cap 10 kHz) and experiment 23's patch, rebuilt from its
  entry: `planner.rs` computes the aspiration test and VOT once per consonant and holds a
  voiceless affricate's /ʃ/ gesture to `t1 + 0.4·VOT + 0.02` (a voiced one's to `t1 + 0.02`);
  `durations.rs` gives a stressed vowel after a voiceless affricate the stops' 20 ms aspiration
  allowance. No new values.
- Real speakers (TSP): training 1.517 → 1.340 (−0.177), held-out 1.631 → 1.446, but **WORSE**:
  one term broke, **male centroid dʒ 0 → 0.54** (2880 → 3556 Hz, men 3072; the limit is about
  3540).
  - Male 0.974 → **0.863** (held-out 1.025 → 0.886); level 0.68 → 0.60, sibilants 1.38 → 1.17,
    timing 0.86 → 0.82. Level tʃ 4.27 → 2.13 (−18.8 → −15.6 dB), centroid z 3.14 → 2.48, s 2.71
    → 2.14, level p 1.60 → 1.08, centroid tʃ 0.30 → 0 (3725 → 3376 Hz), duration z 2.16 → 1.86,
    duration tʃ 1.66 → 1.37, duration k 3.58 → 3.35, level s 0.22 → 0. Against: burst d 0.46 →
    0.78, duration n 1.89 → 1.99.
  - Female 2.059 → 1.817 (held-out 2.238 → 2.006): level tʃ 9.57 → 8.13, centroid dʒ 3.71 → 2.61,
    s 4.50 → 3.52, level s 1.69 → 0.95, z 7.37 → 6.71, ʃ 2.21 → 1.78, burst t 2.11 → 1.64, level
    dʒ 1.82 → 1.37. Against: **centroid tʃ 0.89 → 1.24** (3392 → 3288 Hz; within the 0.5 limit),
    duration k 3.61 → 3.91, duration t 0.22 → 0.52, level ð 2.39 → 2.61.
  - Per token (male /dʒ/ second halves, 1–10 kHz centroid from the renders and MFA's
    alignment): the short tokens (30 ms) don't move; the long ones (60–110 ms: "edge", "edges",
    "pages", "raging", "package", "jump", "join") rise 500–1000 Hz. A probe of the male "edge"
    shows why: its release sweeps the narrowest area from 0.02 to 0.19 cm² over 20 ms, and the
    1/√A law gives that sweep 10–16 kHz (at the cap) where the held /ʒ/ gets 4.8 kHz.
- Whisper, singer, bench, tests: not run. The deciding verdict failed.
- Verdict: reverted. WORSE on one broken term, by about 16 Hz, against the batch's largest
  step (−0.177 training, −0.185 held-out).
- Commit: none (log only).
- Next: experiment 28 bounds the band where the law has no fricative under it.
  Tried while probing, not judged: a voiced affricate's release with the voiced fricative's
  abduction (0.035): its centroid rises (male /ˈɑdʒɑ/ 2225 → 3221 Hz) and its level falls 5–8 dB
  (the weaker voicing), so the male level dʒ would break. Not that.

### 28. Experiment 27 with the band bounded at the body's /s/: a release no brighter than a held sibilant (kept)

- Hypothesis: experiment 27 broke only the male /dʒ/ centroid, by about 16 Hz, and per token the
  rise was in the long /dʒ/ releases: the narrowest area sweeps 0.02–0.19 cm² there, and the
  1/√A law ran to its 10 kHz cap. The law is grounded on the held sibilants, whose constrictions
  span 0.085 (/s/) to 0.22 cm² (/ʒ/); a narrower opening is a closure closing or releasing, where
  the law has no fricative under it and 10 kHz was an arbitrary bound. Stopping the band at the
  narrowest jet a fricative holds, the body's /s/ (the calibration target 0.085 cm² × its scale²),
  leaves every held sibilant's band as it was in 27 (the male /s/ of /ˈɑsɑ/ holds 0.089–0.097
  cm²) and makes a release as bright as an /s/, no brighter.
- Change: experiment 27 (26's band and 23's affricate patch), with the 10 kHz cap replaced by
  `TEETH_LP_NARROWEST` = 0.085 cm² × scale²: `lp = 5000·√(0.2/max(A, 0.085·k²))`, at most 7.7 kHz
  (male) and 8.5 kHz (female). `crates/chimera/src/voice/human_airway.rs`,
  `crates/chimera/src/phonetics/planner.rs`, `durations.rs`. No new free value: the bound is the
  /s/'s calibration target.
- Real speakers (TSP): training 1.517 → **1.342 (BETTER, −0.175)**, held-out 1.631 → 1.458.
  - Male 0.974 → **0.833** (held-out 1.025 → 0.903). Level 0.68 → 0.60, sibilants 1.38 → 1.07,
    timing 0.86 → 0.84. Level tʃ 4.27 → 2.14 (−18.8 → −15.6 dB), centroid z 3.14 → 2.49 (3889 →
    4059 Hz), s 2.71 → 2.15 (4229 → 4424), level p 1.60 → 1.08, centroid tʃ 0.30 → 0 (3725 →
    3376), duration z 2.16 → 1.86, duration v 0.63 → 0.36, duration tʃ 1.66 → 1.41, level s 0.22 →
    0, duration m 0.36 → 0.20, level b 0.40 → 0.28. Centroid dʒ stays at 0 (2880 → 3216 Hz; 27 had
    3556). Against: **burst d 0.46 → 0.88** (−8.2 → −7.6 dB; +0.42, under the 0.5 limit),
    duration d 0.21 → 0.35, duration n 1.89 → 1.99.
  - Female 2.059 → 1.851 (held-out 2.238 → 2.012). Level 1.49 → 1.38, sibilants 3.73 → 3.24,
    timing 0.95 → 0.93. Level tʃ 9.57 → 8.13, centroid s 4.50 → 3.52 (4728 → 5124 Hz), dʒ 3.71 →
    2.85, level s 1.69 → 0.96, z 7.37 → 6.71, duration of a final stressed vowel 0.53 → 0, level
    dʒ 1.82 → 1.38, centroid ʃ 2.21 → 1.78 (3350 → 3435), burst t 2.11 → 1.74, final bursts 1.28
    → 0.92. Against: **centroid tʃ 0.89 → 1.35** (3392 → 3254 Hz; +0.47, the closest to the
    limit), duration k 3.61 → 3.91, duration t 0.22 → 0.52, level ð 2.39 → 2.67, burst g 0 → 0.18.
  - Diagnostics: the male vowel band 1–2 kHz doesn't move (−19.7 dB, men −10.7); female −17.1 →
    −17.5.
- Speech (Whisper, guard): training 38.48 → 39.80 % (NO CLEAR CHANGE, so not WORSE), held-out
  43.33 → 45.00 %. Harvard male 28.5 → 30.75, nonsense male 44.23 → 45.92; Harvard female 44.0
  → 45.75, nonsense female 37.75 → 37.18. Training rate at each offset: 37.42 to 43.05.
  - Wrong: the male "chicken leg" (2.6 → 5.8, "These taste like a rare dish", as experiment 15
    found: its stressed /ɪ/ is squeezed between the held frication and the /k/), the female "Rice
    is often served" (3.8 → 6.0, "short and round and bold"), the male "Some bright doors" (4.2 →
    4.8, "A sunrise door").
  - Right: the female "chicken leg" (5.2 → 3.6, heard whole), the male "hogs were fed chopped
    corn" (2.2 → 1.6), the male "Four hours of steady work" (4.6 → 3.8), the female "thrown" (0.4
    → 0).
- Singer (guard): training 0.587 → 0.585 against the baseline (NO CLEAR CHANGE, −0.002 like for
  like; experiment 25 had 0.582), held-out 0.805 → 0.805. No guard broken: 0 of 5793 notes off
  time, 0 dropped gestures, note MCD 8.580 → 8.590 dB (baseline 8.614), envelope correlation
  0.813, pitch error 4.86 cents.
- Speed: `os=2` 14.9 % (baseline 14.7 %, experiment 25 14.9 %), load average 10 after the judges.
- Tests: fixtures blessed twice (beatbox-bar, planning.json, voice-artic-sweep,
  voice-release-cancel and the three voice-speech renders move; the first run fails only
  `engine_plays_the_beatbox_bar_like_the_typescript_worklet`, the fixture-order case), then
  `cargo test --workspace --no-fail-fast` 116 pass, 0 fail, 2 ignored; `bun run test` 30 pass;
  `bun run typecheck` clean. Fixtures restored. No `src/wasm/` or worklet change, so no e2e run.
- Verdict: kept. TSP BETTER with no term broken, Whisper not WORSE, the singer guard holds, the
  bench is unchanged and the tests pass. The margins are thin on two terms (male burst d +0.42,
  female centroid tʃ +0.47) and the male "chicken leg" is heard worse; listen to those.
  `out/hill/best` and `out/tsp/best` are this run; experiment 25's are in
  /Volumes/hd/tmp/aside-10-31/.
- Commit: e419226.
- Next:
  - The male /s z/ centroids are still the largest male sibilant costs (2.15, 2.49): 4424 and
    4059 Hz against 5725 and 5117. The source's band moved them 5 %; the rest is the front cavity
    (lead 6's band table: the /s/ resonance an octave low, a 2.6–3.4 cm² chamber between the
    constriction and the incisors, 2 cm long in the male /ˈɑsɑ/, where a real /s/ has the blade
    close to the lower incisors and no sublingual space). That is geometry and `chimera
    calibrate`, larger than one run.
  - The male "chicken" /ɪ/: the affricate's held frication now ends where its VOT does, and the
    short stressed vowel between it and the /k/ closure is left with about 20 ms of voicing (lead
    7). Experiment 17's aspiration allowance of the full VOT is the candidate.
  - Male burst d (now 0.88, the people's −10.4 dB against −7.6) and the female /tʃ/ centroid
    (1.35) have the least room for the next change.
  - Tried while probing, not judged: the band from the measured v = U/A (smoothed) instead of a
    constant v. In the male /ˈɑ_ɑ/ probes v/D is about 4300 for /ʃ/, 9200 for /s/, 4000 for /z/
    and 1500 for /ʒ/, and the female's barely above the male's: /s/ would brighten more, but /z/
    and the voiced affricates would get darker than now, against the data (men's /z/ is only 11 %
    below their /s/), and the female /tʃ/ would lose what 26 gave it.

## Rap contrast (2026-11-08)

Branch `rap/contrast`, on batch 3 at experiment 28 (e419226). The goal is a male voice that raps
a fast verse understandably. The judge renders a fast section (dt, 83 words) and the next verse
(fv, 202 words) on the real artist's timing (`render rap … male --timing klatt --speedup 2
--probe`) and prints, per group, the median level of the middle half of each planned segment
against the median vowel's, pooled over both sections, and Whisper's word error rate on each.
Keep: at least 1.5 dB toward the artist's levels on two of the three groups, none worse by more
than 0.5 dB, and the rate over dt+fv not up by more than 3 points (or down 5+ points with no
contrast gain). The recognizer is noisy, about ±5 points on dt. The song is private: no lyrics,
audio or derived files in git; only numbers here.

- The artist: approximants (l w r) −5 dB, voiced fricatives (v ð z) −14, nasals (m n ŋ) −5.
  Baseline (e28): −0.6, −3.4, −1.8. The same lines three times slower: −4.6, −9.5, −7.1.
- Rate over dt+fv at the baseline: 88.9 % (dt 115.3, fv 78.1).

### Before the experiments: the contrast lost at speed is the vowels'

- Absolute levels (dB, middle half of each segment), fv at the artist's timing against three
  times slower: l w r 70.0 against 71.4, v ð z 66.2 against 66.4, m n 68.9 against 69.0, vowels
  71.2 against 76.0. The consonants are as loud fast as slow, and their narrowest sections are
  the same (l w r 0.283 against 0.285 cm², v ð z 0.156 against 0.157). The vowels lose 4.8 dB.
  In dt (median vowel 33 ms) the consonants are louder than the vowels (vowels 65.8 dB; l w r
  70.7, v ð z 68.1, m n 69.0).
- Vowels by neighbour, against the median vowel: between voiced sounds +3.8 dB in dt (105),
  after a voiceless consonant −7.7 (29), before one −5.0 (26); in fv +1.4, −5.2, −2.5; three
  times slower −0.1, −0.1, +0.3. Voicing is lost next to voiceless sounds.
- With the voicing and the abduction added to the probe (a scratch build, with 29 applied): 54
  of dt's 165 vowels are unvoiced through their measured window and 25 partly. 36 lie under the
  previous breath group's exhale (mean voicing 0.18), 27 under a stop's aspiration (0.39). The
  median of the voiced vowels alone is 6 dB above all vowels' in dt, 2 dB in fv.
- Between voiced sounds the vowels open less: fv's narrowest section at mid-vowel 0.71 cm²
  against 1.08 slow. The jaw reaches its target; the tongue body misses by 0.26 cm (median; 80th
  percentile 0.67) against 0.03 slow. About half of that is the blended target itself: at
  mid-vowel the consonants' strength-40 gestures weigh 3.7 on average on the tongue body against
  the vowel's 1 (0.4 slow), mostly a following velar or /w/, and 2.2 on the lips from a
  following /m/ alone. Stops and nasals seal 5–15 ms before their planned onset (smallest
  section ≤ 0.02 cm² at −0.1 to −0.2 of their length), fast and slow alike.
- The pooled medians count fv's tokens three times as often as dt's, so fv decides them.

### 29. Voiceless consonants' glottal opening shrinks with rate (reverted)

- Hypothesis: the glottal opening of a voiceless fricative (`plan_utterance`: from 15 ms
  before it, 30 ms ramps, strength 6, its abduction full once it is a third active) parts the
  folds from about 33 ms before the fricative to 23 ms after it, at any rate. A stop's
  aspiration ramps in over 35 ms. At rap speed that is half of a 50 ms vowel either side. Talkers
  shorten the glottal gesture with rate (Munhall & Löfqvist 1992).
- Change: `crates/chimera/src/phonetics/planner.rs`: the "voiceless", "h" and stop aspiration
  gestures' lead, pads and ramps divide by the larger boost of the consonant, the segment
  after it and the one before (`gq`); the aspirated release ramp keeps its squeeze. Acts only
  when a boost is above 1.
- Judge: levels m n −1.8 → −1.9, v ð z −3.4 → −3.3, l w r −0.6 → −0.8. Rate dt 115.3 → 106.4 %,
  fv 78.1 → 75.7 %, dt+fv 88.9 → 84.6 % (−4.3).
  - fv vowels before a voiceless consonant −2.5 → −0.7 dB, after one −5.2 → −3.7; dt hardly
    moves (after −7.7 → −8.5): most of dt's consonants are at their Klatt minimum, and dt's
    unvoiced vowels lie under the exhale (experiment 30).
- Guards: goldens unchanged (checked with 30 and 32 together against fixtures blessed at e28:
  116 pass), so speech and singing are untouched; TSP and the singer not run.
- Verdict: reverted. No contrast gain, and a 4.3-point drop is under the 5 the rule asks for
  (within the recognizer's noise on dt).
- Commit: none. Diff at /Volumes/hd/tmp/rap-contrast-11-08/e29-glottal-squeeze.diff.

### 30. A rap's breath groups end at breaths, not at every line and gap (reverted)

- Hypothesis: `render rap` planned every line, and every gap inside one, as its own breath
  group: 21 in dt and 41 in fv, though 8 of dt's 13 line boundaries and 16 of fv's 29 have no
  gap at all and the gaps inside lines are 20–280 ms. Each group ends with the folds apart (the
  exhale gesture, 0.22 cm² from 15 ms after its last sound to about 160 ms), so the next
  group's first word starts devoiced. Nobody breathes in a gap shorter than about 0.2 s.
- Change: `crates/chimera-cli/src/rap.rs`: words less than `BREATH_PAUSE` = 0.2 s apart, across
  lines too, are one breath group, and a word before a short gap runs on to the next one's start
  (for `--timing even`; Klatt's slots already did). Sung lines are planned as before. dt 21 → 2
  groups, fv 41 → 9. Rap only; goldens unchanged.
- Judge: levels m n −1.9, v ð z −3.3, l w r −0.7. Rate dt 110.0 %, fv 75.9 %, dt+fv 85.8 %
  (−3.1).
  - dt's median vowel +4.7 dB (65.8 → 70.5), and dt's consonants fell 2.4–3.3 dB against it;
    fv's vowels +0.5 dB, so the pooled levels hardly move.
- Verdict: reverted (no pooled contrast gain, a 3.1-point drop).
- Commit: none. Diff at /Volumes/hd/tmp/rap-contrast-11-08/e30-breath-groups.diff.

### 31. Experiments 29 and 30 together (reverted)

- Hypothesis: the two take voicing from different vowels (the next group's first words, and
  vowels next to voiceless consonants), so they should add.
- Change: 29 and 30.
- Judge: levels m n −2.4, v ð z −3.6, l w r −1.1 (+0.6, +0.2, +0.5). Rate dt 110.0 %, fv
  75.1 %, dt+fv 85.3 % (−3.6).
- Verdict: reverted: the contrast moves under 1.5 dB and the rate drop is under 5. The three
  drops (4.3, 3.1, 3.6) all point the same way but none clears the recognizer's noise.
- Commit: none.

### 32. Experiment 31, and the consonants' strength-40 ramps sharpened when talking fast (reverted)

- Hypothesis: at strength 40 a consonant's dominant gesture outweighs the vowel from 2.5 %
  activation, so its cosine ramps act as steps at their far ends. The 30 ms ramp-in adds about
  27 ms to the latency lead `early`, which is why stops and nasals seal 10–15 ms early, and the
  18 ms ramp-out (no `lead` on a non-closing consonant) holds the constriction about 16 ms into
  the next vowel. A 50 ms vowel loses both ends. With `--speedup` the ramps should shrink with
  the articulators' speed even where the consonant itself is not below its Klatt minimum, which
  is most of fv: the median fv consonant has boost 1 (64–76 % of each group is under 1.2).
- Change: `oral_gestures_into` takes `snap`, the speedup when one is set (1 for speech, singing
  and the beat sounds): the dominant gesture ramps in over 30 ms / max(squeeze, snap) and out
  over its 18 or 30 ms / snap. `planner.rs`, `beatbox.rs` (the call). Goldens unchanged.
  - Picked with a scratch build whose ramps scaled from the environment (levels only, not the
    recognizer), on 31: the closing consonants' ramp-in ×0.5 alone moved the levels +1.1, +0.5,
    +1.1 dB against the baseline and put the closures on their planned onset (≤ 0.02 cm² from 0
    to +0.1 of the stop instead of −0.2); ×0.2 put them late. The ramp-out ×0.5 added the rest.
- Judge: levels m n −3.6 (+1.8), v ð z −3.9 (+0.5), l w r −2.3 (+1.7): the contrast rule holds.
  Rate dt 123.3 %, fv 85.8 %, dt+fv 96.7 % (+7.8 against the baseline, +11.4 against 31; fv alone
  +10.7 against 31, past the noise).
  - Closures sealed (smallest section < 0.005 cm²): alveolar 92 and 93 % (dt, fv; 31: 95, 93),
    labial 67 and 89 % (72, 91), velar 95 and 96 % (unchanged).
- Verdict: reverted: the recognizer is clearly worse. The contrast moved toward the artist's,
  but the sharper switches shortened the transitions that carry the consonants' place, and the
  later closures sealed fewer short stops.
- Commit: none. Diff (29, 30 and 32) at /Volumes/hd/tmp/rap-contrast-11-08/e32-with-29-30.diff.
- Next:
  - The contrast measure and the recognizer disagree in 32. Louder vowel ends are not
    understanding; a change for the contrast should keep the transitions (32's ramp-out is
    the likely loss, as 947276b found for closures at sixteenths).
  - The aspiration sits in our vowels' windows (Klatt counts VOT in the vowel; the artist's
    alignment puts it in the stop). At fv's pace most stops keep their full 50 ms VOT (squeeze
    1), so a 60 ms vowel after /p t k/ voices only its last 10–20 ms. VOT that shortens with the
    syllable (Kessinger & Blumstein 1997) is the next candidate, and the measure would read it.
  - The early sealing is not a rap matter: it is there three times slower too. Fixing it for all
    speech (the closing ramp-in) moves the goldens and needs TSP and the singer; TSP's male
    nasals are too long (n 1.07 against the people's 0.77, ŋ 1.32 against 1.04), which early
    sealing would explain.
  - 29 and 30 are physical faults with small, consistent gains; retry them with more words
    (more sections) so the recognizer can decide, or together with a change that moves the
    contrast.
  - `boost` (below the Klatt minimum) misses fv: its 55 ms vowels and normal-length consonants
    are "not fast" by that test, though their vowels lose 4.8 dB.
  - The probe scripts (level by neighbour, voicing, blend weights by gesture, closure timing)
    are in /Volumes/hd/tmp/rap-contrast-11-08/.

## Rap voicing (2026-11-08)

Branch `rap/voicing`, on the deep dive (59597a3, whose engine is experiment 28's, e419226). The
goal is the same as the rap contrast's: a male voice that raps a fast verse understandably. The
deep dive (`docs/deep-dive/engine-map.md` section 15, `docs/deep-dive/real-voice.md` "Gaps
ranked") found the fast vowels losing 5–11 dB, mostly their voicing: the folds held apart around
voiceless consonants, every breath group's exhale on the next group's first word, and the
consonants' gestures inside the vowels. These experiments try to give the voicing back. The song
is private: no lyrics, audio or derived files in git; only numbers here.

### The judge: a bigger real-timed set

Round 1's dt+fv (285 scored words) moves ±5 points on noise alone, so no 3–4 point gain could be
kept. The new set adds five more stretches of the same recording (seconds 40–80, 90–111,
149–161, 200–221 and 250–269, outside dt and fv), timed from the recognizer's words of the real
vocal (its own words are the reference there; dt and fv keep the lyrics), split into lines at
the recording's gaps (≥ 0.12 s once a line has 4 words, at most 10 words), each word's pitch
the median YIN f0 of the separated vocal over the word (80–230 Hz). 836 scored words: dt 83, fv
202, the rest 551; 140 lines. Rendered as the rap judge (`render rap … male --timing klatt
--speedup 2 --probe`), every section in parallel, then `tools/rap/song_wer.py` on each. The
scores and the scripts (`build_big.py`, `big_eval.sh`) are private, in
/Volumes/hd/tmp/rapgod/real/big/.

- **Baseline (e28):** word error rate over the big set **100.0 %** (dt 118.5, fv 76.4, dt+fv
  88.7, the rest 105.9). Median vowel level 69.73 dB (1322 vowels).
- **Noise:** the same build with every word 13.7 ms later (the CLI has no noise seed; the shift
  moves the noise and the recognizer's frames): 98.4 % (dt 115.3, fv 75.1, dt+fv 86.8, the rest
  104.4), vowel 69.74 dB. So ±1.6 points on the big set, ±2 on dt+fv, and up to 10 points on one
  60-word section. The recognizer is not even repeatable on the same audio: round 1 heard this
  very dt render (byte-identical) at 115.3 %, this run at 118.5 % (its threads, under load).
  The keep rule (from the brief): the big set down at least 5 points, and the median vowel up.
- At most two recognizer processes at a time: seven per run in parallel pushed swap past 10 GB
  onto the boot disk. A run then takes ~15–30 min.
- The recognizer gets almost nothing of the synth at this speed: rates near 100 % are mostly
  substitutions and insertions, so the set can only see large changes.

### Before the experiments: a fricative's voicing comes back on time; its frication ends late

Traced with the deep dive's probe (`ddprobe`, rebuilt on this branch; medians over fv's 11
vowel–voiceless fricative–vowel tokens, at the artist's timing):
- The narrowest oral section is below 0.35 cm² (the frication source's full strength) from
  about 5 ms before the planned fricative to **about 22 ms after its planned end**: the
  dominant gesture of a non-closing consonant has no release lead (`planner.rs:556–561`) and
  its 18 ms ramp-out at strength 40 holds the constriction past the boundary. The acoustic
  fricative is ~75 ms for a 52 ms plan.
- Voicing (> 0.5) is gone from 25–30 ms before the constriction forms, and back about 15 ms
  after the frication ends (c1 + 37). So against the acoustic fricative the voice returns as
  real speakers' does (10–15 ms after, Hoole & Bombien 2014); what the next vowel loses after a
  fricative is the late oral release. Before it, the loss is the glottis: real voicing runs into
  the frication (Davidson 2018; Pirello et al. 1997, within its first 30 ms).

### 33. A voiceless fricative's glottal opening is one rise and fall over the fricative, not a plateau from 33 ms before it (reverted)

- Hypothesis: the "voiceless" gesture (and /h/'s) holds the folds fully apart from about 33 ms
  before the fricative to 23 ms after it at any length (strength 6 saturates `min(1, w/2)` at a
  third of its ramp), so a 30–60 ms rap vowel before /s f θ ʃ h/ loses its last 25–30 ms of
  voicing. The real glottal gesture is one abduction–adduction movement that starts at the
  constriction (German 0 ± 5 ms, American 10–20 ms before), peaks mid-frication and scales with
  the consonant (Hoole & Bombien 2014; Löfqvist & McGarr 1987, via Davidson 2018); voicing runs
  into the frication's first ~30 ms (Pirello et al. 1997). Experiment 14 moved the plateau later
  and the fricatives went weak: a single movement that peaks higher in the middle should keep
  the frication's flow where the frication is.
- Change (scratch build, `planner.rs`): the voiceless fricative and /h/ gesture becomes a
  raised-cosine bump at strength 2 (so the blend's `min(1, w/2)` never saturates): peak 0.42 cm²
  at the fricative's middle, rising from 15 ms before it, falling to 40 ms after it, so its
  length is the fricative's plus 55 ms. Where the fricative borders a pause or a voiceless
  segment, the old opening is kept on that side (a strength-6 hold to the peak), so a phrase-
  initial /s/ doesn't voice into the breath (experiment 14's caveat). One setting tried.
- Probe (fv, median of 11 V–fricative–V): voicing 1.0 at the constriction's start, 0.5 at
  +10 ms, 0.1 at +20 (was gone 20 ms before it); back to 0.67 at c1 + 30 ms (was 0.01; 0.72 at
  +40). Mean vowel voicing fv 0.68 → 0.74, dt 0.55 → 0.62; median vowel fv +0.6 dB, dt +1.2.
- Judge (big set): word error rate **97.5 %** (baseline 100.0 and 98.4): dt 121.7 (118.5, 115.3),
  fv 77.1 (76.4, 75.1), dt+fv 90.1 (88.7, 86.8), the rest 101.3 (105.9, 104.4): m1 107.6, m2
  97.9, m3 104.4, m4 88.2, m5 103.4. Median vowel 69.73 → **70.86 dB** (+1.1).
- Guards: not run (the deciding judge failed). The change moves every speech plan with a
  voiceless fricative or /h/, so goldens, TSP and the singer would all need a run.
- Verdict: reverted. −1.8 points against the two baseline runs' mean, inside the noise and under
  the 5 the rule asks for; dt+fv went the wrong way (+2.3). The vowels got 1.1 dB louder and the
  recognizer did not notice.
- Commit: none. Diff (env-gated scratch code for 33 and 35) at
  /Volumes/hd/tmp/rap-voicing-11-08/e33-e35-planner.diff.
- Next: the after-side is the oral release (above), not the glottis; a fricative release lead
  would give the next vowel ~20 ms but changes every fricative's length (TSP's male θ and f are
  already long, 1.78 and 1.66 against 1.45 and 1.46 mean phones, so it might be welcome there).

### 34. A rap's breath groups end only where a breath fits (0.3 s), not at every line and gap (reverted)

- Hypothesis: experiment 30 again, on a judge that can see it. `render rap` starts a breath
  group at every line and every gap between words (197 groups in the big set); each ends with
  the exhale (folds apart from 15–45 ms to ~150 ms past its last sound) while the next group's
  onset is placed up to 0.21 s before its beat, so the exhale lands on the next first word
  (`bridge`, the deep dive's oracle: +3.3 dB dt, +0.7 fv). Real inspirations take ~0.5 s and
  breaths at minor breaks vanish at fast rates (Huber & Darling 2011; Grosjean & Collins 1979,
  via Włodarczak & Heldner 2017). Round 1 used 0.2 s and dt+fv went 3.1 points the right way.
- Change: experiment 30's `crates/chimera-cli/src/rap.rs` (words less than `BREATH_PAUSE` apart,
  across lines too, are one group; a word before a short gap runs on to the next), with
  `BREATH_PAUSE` = 0.3 s: 197 → 18 groups (dt 21 → 2, fv 41 → 4). Rap only; no plan or sound
  of speech or singing changes, so no golden, TSP or singer run is needed.
- Judge (big set): **98.0 %** (baseline 100.0 and 98.4): dt 117.3 (118.5, 115.3), fv **80.9**
  (76.4, 75.1), dt+fv 91.5 (88.7, 86.8), the rest 101.3 (105.9, 104.4): m1 112.0, m2 93.6, m3
  110.6, m4 87.9, m5 95.6. Median vowel 69.73 → **71.73 dB** (+2.0; dt 65.8 → 70.5, as 30's
  +4.7; the other sections +0.6 to +3.6).
- Verdict: reverted. −1.2 points against the two baseline runs' mean, inside the noise; fv got
  worse by 4.5–5.8. The largest vowel gain of these experiments, and the recognizer still hears
  no difference.
- Commit: none. Diff at /Volumes/hd/tmp/rap-voicing-11-08/e34-breath-groups.diff.
- Next: with 33 it would give the vowels about 3 dB together (experiment 36).

### 35. An aspirated stop's glottal opening peaks at the release, and its VOT follows the syllable (reverted)

- Hypothesis: an aspirated /p t k/'s opening is a saturated plateau from a quarter into the
  closure to 0.4·VOT past the release, then a 45 ms ramp, with VOT 50 ms unless the stop or its
  vowel is below its Klatt minimum. The voice comes back ~61 ms after the release at fv's pace
  (median vowel after the stop: 42 ms), and fv's vowels after an aspirated stop sit 8.5 dB down.
  Real VOT shrinks 8–21 ms per 100 ms of syllable (Theodore, Miller & DeSteno 2007), and the
  stop's glottal gesture starts 10–25 ms into the closure and peaks at the release (Hoole &
  Bombien 2014; Löfqvist & McGarr 1987).
- Change (scratch build, `planner.rs`): VOT = 50 ms + 0.15·(D − 0.2 s), D the stop plus its
  vowel (the planner's median CV in the golden plans is 0.21 s), bounded to 18–60 ms; and the
  aspirated stop's opening becomes a strength-2 raised-cosine bump: rising from 10 ms into the
  closure (20 ms tried first), peak 0.36 cm² at the release (an affricate's at its frication's
  end), falling over (VOT − 8 ms)/0.72 so the voice is back VOT after the release. Unaspirated
  stops keep their gesture. VOT alone (the old plateau, ramp 0.9·VOT) was probed first: the
  voice came back only 4–6 ms sooner, because fv's slots give their extra time to vowels, so
  many stops' syllables are long (VOT up to the 60 ms bound).
- Probe: voice back 33 ms after the release in fv (was 61), 29 in dt (was 50); but the closure
  now stays voiced 24 ms into it in fv, 13 in dt (was off 4–8 ms before it), ~40 % of a 61 ms
  closure where speakers voice 14–24 % (Docherty 1992, via Davidson 2018). Median vowel fv
  +0.2 dB, dt +0.8; mean voicing 0.68 → 0.71, 0.55 → 0.58.
- Judge (big set): **103.2 %** (baseline 100.0 and 98.4): dt **134.5** (118.5, 115.3), fv 77.9,
  dt+fv 94.4 (88.7, 86.8), the rest 107.8 (105.9, 104.4): m1 123.0, m2 96.8, m3 107.2, m4 95.1, m5
  101.4. Median vowel 70.62 dB (+0.9).
- Verdict: reverted: worse by 4 points against the baseline runs' mean, 16–19 on dt. Likely the
  voiced closures and the short, weaker aspiration made /p t k/ sound like /b d g/: the change
  moved the stops' voicing cue, not the vowels'.
- Commit: none. Diff (env-gated, with 33) at /Volumes/hd/tmp/rap-voicing-11-08/e33-e35-planner.diff.
- Next: if VOT is retried, keep the opening's start (the closure devoiced as now) and shorten
  only the fall after the release.

### 36. Experiments 33 and 34 together: the fricatives' opening and the breath groups (reverted)

- Hypothesis: 33 and 34 give voicing back to different vowels (next to voiceless fricatives,
  and the first words after a line or gap), +1.1 and +2.0 dB each, and each moved the big set
  1–2 points the right way: together they might clear the noise. 35 made things worse and is
  left out.
- Change: 33's planner change with its constants (`FRIC_OPEN_LEAD` 15 ms, `FRIC_OPEN_LAG`
  40 ms, `FRIC_OPEN_PEAK` 0.42 cm²; the build renders byte-identical to the env-gated one) and
  34's `rap.rs`.
- Judge (big set): **93.9 %** against 100.0 at the same timing (−6.1) and 98.4 shifted (−4.5):
  dt **101.6** (118.5, 115.3), fv 74.9 (76.4, 75.1), dt+fv **82.7** (88.7, 86.8), the rest 99.7
  (105.9, 104.4): m1 108.8, m2 92.9, m3 108.3, m4 82.4, m5 100.7. Median vowel 69.73 → **72.64
  dB** (+2.9). Every section moved the right way.
  - Replicate, every word 13.7 ms later (like for like with the shifted baseline): **95.4 %**
    against 98.4 (−3.0); dt 109.6, fv 73.6, dt+fv 84.1, the rest 101.2; vowel 72.68 dB. The mean
    of the two runs is 94.6 against 99.2: **−4.6 points**, just short of the rule's 5. The only
    candidate here near it.
- Real speakers (TSP): **WORSE**, training 1.342 → 1.421 (+0.079), held-out 1.458 → 1.515; male
  0.833 → 0.933, female 1.851 → 1.910. Broken terms, all but one timing: the voiceless
  fricatives got short as aligned, the vowels before them long.
  - Duration s: male 1.19 → 1.03 against the people's 1.30 (cost 0 → 1.67), female → 0.99
    (0.10 → 2.11). ʃ: male 1.26 against 1.66 (0 → 1.13), female 0 → 0.79. f: male 1.66 → 1.17
    against 1.46 (0.52 → 1.23); the female f went from too long to too short (1.61 → 1.06,
    people 1.32; cost 1.19 → 1.02). h: female 0.89 against 1.08 (0 → 0.92).
  - Stressed vowel before a voiceless consonant: cost 0 → 0.86 (male), 0 → 1.31 (female);
    female unstressed vowels 0.32 → 1.02; male ð 0 → 0.83; male centroid dʒ 0 → 0.57.
  - So the real speakers' alignments put the boundary where the voicing stops, and the bump's
    voiced first ~10 ms and earlier return took 15–30 % off every voiceless fricative. The old
    plateau left f too long (1.61–1.66 against 1.32–1.46) and s about right: the right opening
    lies between the two.
- Singer (guard): BETTER, training 0.587 → 0.562 (−0.021 like for like), held-out 0.805 →
  0.786; 0 of 5793 notes off time, 0 dropped gestures, note MCD 8.502 dB, envelope correlation
  0.814, pitch error 4.93 cents.
- Tests: fixtures blessed twice (beatbox-bar, planning.json, voice-artic-sweep,
  voice-release-cancel and the three voice-speech renders move), then `cargo test --workspace
  --no-fail-fast`: 115 pass, **1 fails**: `an_f_does_not_click` (/f/ of /ɑfɑ/ onset +14.6 dB
  over the fricative, male; +13.0 female): with the folds still vibrating as the lip meets the
  teeth, experiment 19's click comes back. Fixtures restored. Whisper on speech, `bun run test`
  and the bench not run (two guards had already failed).
- Verdict: reverted: the rap gain is 4.6 points over two runs (under 5), TSP is WORSE on
  broken timing terms, and a test fails. The fricative half of the gain costs normal speech its
  voiceless fricatives.
- Commit: none. Diff (the constants version) at
  /Volumes/hd/tmp/rap-voicing-11-08/e36-planner-const.diff, with e34-breath-groups.diff.
  `out/tsp/try` and `out/hill/try` are in /Volumes/hd/tmp/aside-10-31/.
- Next:
  - Keep 34 (rap only, no guard at stake) for a combination, and retry 33's opening with the
    fully-apart part as long as the old one's at speech rate: e.g. the bump from 25–30 ms
    before the fricative, or a plateau over the middle that shrinks only when the fricative is
    short, aiming at TSP's s 1.30 and f 1.32–1.46 mean phones. Check `an_f_does_not_click`
    first (seconds, not a judge run): /f/ needs the folds apart as the lip closes.
  - The fricative release lead (the constriction opening ~20 ms after the planned end) is the
    other half of the vowel after a fricative, untried.
  - The big set can now see ~5 points; a shifted replicate of each candidate halves its noise.

## Batch 4: the base voice at talking speed (from 2026-11-08)

Branch `hill/batch4-base`, on `rap/voicing` (5369722; the engine is experiment 28's). The owner
chose to stop tuning the rap and fix the base voice: at talking speed Whisper misses about 40 % of
the male voice's words (training 39.80 %), where real speakers are near 0. The judges and keep rule
are batch 3's: TSP decides (`out/tsp/best`, 1.342; male 0.833), Whisper guards and is the number
this batch is for (`out/hill/best`, 39.80 %), the singer guards (`out/hill/baseline`).

## Batch 4 (2026-11-08): diagnosis

Training sentences only, male voice, from `out/hill/best/speech/wer.json` (20 sentences × 5
offsets = 100 hearings, 755 words, 286 word errors). Word errors were aligned to the reference
and given one primary class by hand; phones were aligned with CMUdict over each whole hearing
(script: `/Volumes/hd/tmp/batch4-11-08/diag.py`). The causes were then measured on the renders
with a probe that re-implements `render text` over the public engine API (its WAV is
byte-identical to the judge's) and records the source and the tract every millisecond
(`/Volumes/hd/tmp/batch4-11-08/probe`, `seg.py`, `fric.py`, `afterl.py`: per planned segment,
middle half: level re the median stressed vowel, transglottal and oral pressure, voicing,
narrowest oral section).

Word errors by confusion class (counts over the 100 hearings; a word can show two classes, its
primary one is counted):

| # | class | word errors | where |
|---|---|---|---|
| 1 | vowel identity (tense or diphthong heard lax, or another vowel) | ~47 | these→this, paints→pinks, sweet→switch, late→next, pushes→post, chair→children, reads→greater, fork→far, canoe→can |
| 2 | function words dropped, swapped or inserted mid-sentence | ~38 | "tell the depth of a well" → "tell depth as well"; hears a → here is; reads a → greater; pushes a → post is a |
| 3 | merged or resegmented words | ~35 | canoe slid on → can also feed into; small river eats → smaller it's; chair drinks → children to; round table → roundtable |
| 4 | the affricate /tʃ/ (→ d, ʃ, θ, or the word lost) | ~33 | birch→bird, chopped→shopped, chain→thing, "a chicken leg is" → like |
| 5 | the utterance's first word | ~28 | A→The (2 sentences), A→Your, Some→A, Her lost, Glue→Screw |
| 6 | stop voicing | ~25 | planks→blanks, quiet→glides (unaspirated /p k/ before /l w/, experiment 21), days→taste, fed→fat, fork reads→far greater |
| 7 | final /z/ dropped or devoiced | ~21 | lemons, bowls, doors, hears, sings |
| 8 | a stop's release heard as a fricative or another stop | ~20 | wet→west, faced us→phase plus, sweet stone→switch tone |
| 9 | approximants | ~19 | walks→locks, quiet→glides (/w/ as /l/); cold→coated, sell→set (dark /l/) |
| – | judge artifact | 4 | "4 hours": the judge's tokenizer drops the digit |

Phones (automatic, so approximate): the largest classes are vowel identity (113 confusions: i→ɪ
13, eɪ→ɪ 10, ɔ→ɑ 12, ə→æ 10), dropped fricatives (54: z 24, ð 12, s 8, v 5), voicing (52: d→t
15, z→s 11, k→g 10, p→b 5) and dropped vowels (48: ə 26, ɪ 14). The phones missed most often:
/tʃ/ 18 of 30 times spoken, /z/ 41 of 95, /eɪ/ 16 of 40, /v/ 12 of 30, /i/ 18 of 60.

Against the TSP male terms and the deep dive's gaps, with what the probe measured:

1. **Vowels (classes 1, 3).** TSP's diagnostics: the stressed vowels' band 1–2 kHz is −19.7 dB re
   0–8 kHz (men −10.6), 2–4 kHz −26.4 (−18.6), 4–8 kHz −29.6 (−35.0), and H1−H2 +0.7 dB (men
   −4.0): a muffled, breathy source, with noise where the harmonics should be. Not scored, so TSP
   can't keep a fix for it alone. Also: the tense vowels after an aspirated stop lose ~50 ms to
   the aspiration (lead 7, "paints"), and the /i/ after /w/ undershoots (gap 7).
2. **The voiced non-sibilant fricatives are approximants (classes 2, 3).** TSP: level ð −10.4 dB
   against −21.0 (cost 4.08, the largest level term), v −10.3 against −19.4 (1.74), voiced ð 0.63
   against 0.36. Probe: the phrase-initial /ð/ of "The" holds 0.195 cm² with 0.56 cmH₂O behind
   it (median of 23 /ð/: −8.6 dB re the stressed vowels, voicing 1.0); /v/ 0.21–0.31 cm² (target
   0.13), −6.3 dB; the voiceless θ and f hold 0.15–0.16 cm² with 2.4–3.8 cmH₂O. A voiced
   fricative in the model builds almost no oral pressure, so it voices fully and barely hisses.
3. **An /l/'s side channel stays open into the next consonant (classes 2, 3, 7, 9).** The probe:
   after /ɫ/ the next coronal starts at 0.348 cm² (the lateral channel, 0.35·lateral) and keeps
   0.27–0.33 cm² through its middle: the /ð/ of "tell the" (−2.4 dB, oral pressure −0.4: a
   lateral), the /z/ of "bowls" (0.27 cm²), the /s/ of "table sings" (0.156 against 0.085), the
   /d/ of "cold" (0.13 cm² at mid-closure, sealed only at its end). No consonant but an /l/
   moves the lateral articulator, which relaxes over ~50 ms. Whisper: "tell depth", "bowl",
   "coated", "single".
4. **Affricates and /ʃ/ (class 4).** TSP: level ʃ −14.7 against −8.9 (2.55), level tʃ −15.6
   against −10.9 (2.14), duration tʃ 1.20 against 1.52 (1.41), duration dʒ 0.48 against 1.28
   (4.23; planned at 0.53 mean phones, Klatt's 50 ms /dʒ/). Probe: /tʃ/'s middle half −18 dB.
5. **Final /z/ (class 7).** TSP: duration z 0.64 against 0.92 (1.86), centroid z 4059 against
   5117 Hz (2.49), voiced z 0.76 against 0.34. Probe: /z/ is voiced through (1.0) with 0.8–1.9
   cmH₂O of oral pressure: weak frication under strong voicing, which also pulls its centroid
   down. The same aerodynamics as item 2.
6. **Stops (classes 6, 8).** TSP: duration k 0.77 against 1.22 (3.53), p 0.93 against 1.14, t
   0.73 against 0.91, already short in the plan (k 0.85, t 0.76 of a mean phone); the loudest
   bursts are released stops where speakers don't release one (synth −0.6 to −10 dB, speakers
   −44 to −51): every stop before a consonant across words gets a burst ("wet bird" → "west").
   Onset-cluster /p k/ unaspirated: experiment 21.
7. **The first word (class 5)**: lead 9, open. **Nasals too long** (n 1.07 against 0.77, ŋ 1.32
   against 1.04: planned 0.69 and 0.92, so the realisation adds ~0.4), gap 5 (closures easing over
   their last 0.4 cm²) is the candidate; no Whisper class points at it directly.

Picked for this run: item 3 (a plain fault with four error sites, experiment 37); item 4 by
experiment 24's open lead (the teeth source's gain, with dental jets excluded); item 2 or 5 if
time allows. Item 1 is the largest class, but its terms are TSP diagnostics: a lead.

### 37. Lateral bracing: every central tongue-tip consonant closes the /l/'s side channel (reverted)

- Hypothesis: diagnosis item 3. An /l/'s side channel (0.35 cm² × the lateral articulator) is
  opened by the /l/'s gesture and closed by nothing: no other consonant targets the lateral key,
  so after the gesture it relaxes at 10 Hz and the next coronal starts at 0.348 cm² and keeps
  0.27–0.33 through its middle ("tell the", "bowls", "table sings", "cold"). In real central
  coronals the tongue's sides rise against the upper molars and seal the channel (lateral
  bracing: Stone 1990; Gick et al. 2017), as fast as the tip moves.
- Change: `crates/chimera/src/phonetics/planner.rs` `oral_gestures_into`: a consonant whose
  dominant keys include the tongue tip and that is not a lateral also targets lateral 0 in its
  dominant (strength-40) gesture. No new value. Diff at
  `/Volumes/hd/tmp/batch4-11-08/e37-lateral-bracing.diff`.
  - Probe (male training sentences, middle of the segment after /ɫ/): /ð/ of "tell the" 0.328 →
    0.144 cm², /z/ of "bowls" 0.269 → 0.098, /s/ of "table sings" 0.156 → 0.065, /d/ of "cold"
    0.130 → 0.075 at mid-closure; each starts at ~0.24 instead of 0.35.
- Real speakers (TSP): training 1.342 → 1.340 (**NO CLEAR CHANGE**, −0.002), held-out 1.458 →
  1.455.
  - Male 0.833 → **0.816** (held-out 0.903 → 0.903): duration k 3.53 → 2.83, burst d 0.88 → 0.38
    (−7.6 → −8.4 dB), burst p 1.21 → 0.91, duration d 0.35 → 0.13, duration f 0.52 → 0.36,
    level p 1.08 → 0.95. Against: level θ 0.32 → 0.52.
  - Female 1.851 → 1.864 (held-out 2.012 → 2.007): level ð 2.67 → 2.35. Against: burst d 0.30 →
    0.63, level g 1.43 → 1.64, centroid ʃ 1.78 → 1.94, centroid dʒ 2.85 → 3.01, level l 0.18 →
    0.31. Most of the moved terms have no /l/ near them: the aligner.
- Speech (Whisper, run alongside for the batch's number): training 39.80 → 38.74 % (NO CLEAR
  CHANGE), held-out 45.00 → 41.93 %. Harvard male 30.75 → 29.5, nonsense male 45.92 → 45.07;
  female 45.75 → 44.25 and 37.18 → 36.62. Right: the male "bowls" (1.8 → 0.4 errors), the female
  "Rice is often served" (6.0 → 3.8), the female "table sings" ("Roundtable sings"). Unchanged:
  "tell depth as well" and "coated" in both voices. Worse: the female "chicken leg" (3.6 → 5.0,
  "the chicken leg": not near an /l/ coda).
- Singer, bench, tests: not run (the deciding verdict failed).
- Verdict: reverted. TSP calls it NO CLEAR CHANGE: the male gains 0.017, the female loses 0.013.
- Commit: none (log only).
- Next: the fix is right and cheap; keep it as a passenger for a change TSP can see (it took 1
  point off Whisper and fixed two of its four sites). "Tell the" still loses "the": with the
  channel closed the /ð/ is still a 0.14–0.17 cm² approximant (item 2). "Cold" is still
  "coated": the dark /l/'s own F2 (experiment 22's Next), not the /d/.

### 38. Experiment 21 under the real-speaker judge: a voiceless stop is aspirated before its onset cluster's approximant (reverted)

- Hypothesis: diagnosis item 6 and class 6. The planner aspirates a voiceless stop only before a
  vowel, so the /p/ of "planks" and the /k/ of "quiet" release with a 12 ms VOT into a voiced
  /l w/ ("blanks", "glides"). In English a stop that begins an onset cluster with /l ɹ w j/ is
  aspirated and devoices the approximant (Klatt 1975). Experiment 21 tried it under Whisper alone
  (NO CLEAR CHANGE); TSP's male stops are short (duration k 0.77 against 1.22, p 0.93 against
  1.14, t 0.73 against 0.91) and its approximants too voiced (voiced w 0.91 against 0.55), both
  of which the aspiration should move. Picked over the VTL study's teeth ideas (below) because its
  patch was ready and the study's idea 1 measured flat.
- Change: experiment 21's patch ported to the current planner (`planner.rs`: `Seg.word_end`,
  `onset_cluster`, the `aspirated` test; `syllables.rs`: `is_onset`; `sing.rs`: a sung word's
  last segment marked `word_end`). No new value. Diff at
  `/Volumes/hd/tmp/batch4-11-08/e38-onset-cluster-aspiration.diff`. Probe: the /w/ of "quiet"
  devoiced through its 72 ms (voicing 0, −31 dB).
- Real speakers (TSP): training 1.342 → 1.320 (−0.022), held-out 1.458 → 1.455, but **WORSE**:
  two terms broke, both female.
  - Male 0.833 → **0.804** (held-out 0.903 → 0.901): duration k 3.53 → 1.66 (0.77 → 0.95 mean
    phones), burst p 1.21 → 0.49, duration p 1.03 → 0.46, duration w 0.38 → 0, duration of a
    stressed vowel before a sonorant 0.91 → 0.69, duration t 0.83 → 0.70, level w 0.78 → 0.68.
    Against: level p 1.08 → 1.57, burst k 0.53 → 0.98, duration ɹ 0 → 0.30, duration l 0 → 0.13.
  - Female 1.851 → 1.836: duration k 3.91 → 1.95, p 0.85 → 0.18, t 0.52 → 0, dʒ 3.03 → 2.67.
    Broke: **duration l 0 → 0.82** (0.77 → 0.65 mean phones, women 0.83) and **burst k 2.44 →
    2.95** (+0.51). Against: duration tʃ 1.85 → 2.11, z 2.93 → 3.06.
  - So the aligner gives the devoiced approximant to the stop: the stops lengthen toward the
    speakers', and the /l/ loses what they gain. The cluster's /l/ is planned short (Klatt's
    cluster shortening, ~45–60 ms) and the 50 ms VOT plus its 45 ms ramp devoice all of it.
- Whisper, singer, bench, tests: not run (the deciding verdict failed). The machine was loaded
  (two browser and chat helpers at ~100 % CPU each, load average 25–27): this TSP run took 30 min
  and the first one died in MFA with SIGSEGV (swap 7.2 of 8 GB with Whisper alongside); rerun
  alone.
- Verdict: reverted. WORSE on two broken female terms, though the training score fell 0.022 and
  the male's largest timing term halved.
- Commit: none (log only).
- Next: the stop half is right (male duration k 3.53 → 1.66). Keep part of the approximant
  voiced: real /l/ after /p k/ is devoiced only over the VOT, and the voiced rest carries its
  length. Either the cluster's approximant keeps Klatt's unshortened duration when the stop is
  aspirated, or the cluster's VOT ends inside it (half of it); one of those, with the female
  /l/ watched. Also tried while picking, not judged: the VTL study's idea 1 (fade the exit source
  where the teeth source has weight) moves the male /s/ centroid 4397 → 4385 Hz and /ʃ/ 3348 →
  3197 Hz in the probe: the exit source is not what holds the /s/ centroid down here; the front
  cavity is (experiment 28's Next). Diff at `/Volumes/hd/tmp/batch4-11-08/probe-teeth-only-exit-fade.diff`.
