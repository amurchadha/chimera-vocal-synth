# The CHIMERA voice engine, end to end

*Deep dive, 2026-11-08, branch `deep-dive` at 38d868e. Every `file:line` is in this repo; paths are
relative to `crates/chimera/src/` unless they start with `crates/`. Where the code and
[architecture.md](../architecture.md) disagree, the code is described here. Anything inferred
rather than read or measured is marked "inferred" or "computed, not measured".*

Contents: [plain-English summary](#how-a-word-becomes-sound) · [pipeline](#the-pipeline-at-a-glance) ·
stages [1](#1-text--phonemes)–[13](#13-the-sung-path-where-it-differs) ·
[vocal folds and breath](#14-the-vocal-folds-and-breath-in-depth) ·
[measured trace](#15-measured-trace-rap-speed-against-three-times-slower) ·
[questions for the real voice](#questions-for-the-real-voice)

## How a word becomes sound

CHIMERA does not play recordings or shape a buzz with filters. It simulates a body: lungs push air
through vibrating vocal folds into a throat and mouth whose shape changes over time, and the sound
is what comes out of the lips and nose.

1. **Words to sounds.** A pronouncing dictionary (CMUdict) turns each word into its list of speech
   sounds, with stress. Unknown words go through spelling rules.
2. **How long each sound lasts.** A rule set from 1970s speech synthesis (Klatt) gives every sound
   a natural length and a shortest possible length. For rap, the words must land on the artist's
   beats, so each word's sounds are stretched or squeezed between the two.
3. **Sounds to movements.** Each sound becomes a few "gestures": instructions like "tongue tip to
   the gum ridge from 0.41 s to 0.46 s, very firmly" or "vocal folds apart from 0.50 s to 0.58 s".
   Vowels are gentle, long, overlapping gestures for the tongue body, jaw and lips; consonants are
   short, forceful gestures for the one articulator that makes them. The folds get their own
   gestures: they open for voiceless sounds like /s/ and /p/ and for breathing out at the end of a
   phrase.
4. **Movements to a moving mouth.** Every 1.3 ms the engine mixes the gestures active at that
   moment into one target per articulator (a consonant's firm gesture outweighs a vowel's), and
   each articulator moves toward its target like a weight on a damped spring, getting most of the
   way there in about 50 ms.
5. **Mouth to a tube.** A drawn side-view of a male head (tongue as a circle plus a tip, jaw on a
   hinge, lips, velum) is measured along about 50 lines across the airway; each gap is turned into
   a cross-section area. That gives the vocal tract as two tubes of about 18 short sections each,
   plus a nose, a windpipe and side cavities.
6. **Air through the tube.** 96 000 times a second the engine updates air pressure and flow in
   every section, the way the equations of sound in a pipe say it should, including the friction
   and turbulence at narrow places (that hiss is how /s/ and /f/ are made).
7. **The folds.** At each of those steps a model of the vocal folds sets the size of the gap
   between them: a pulse each pitch period while the folds are vibrating, plus a steady gap when
   they are held apart. The folds only vibrate when enough pressure drives air across them and
   they are close enough together, so a sound goes voiceless when the mouth closes or the folds
   open, as in a real throat.
8. **Out of the lips.** The air leaving the lips and nostrils is the sound. It is filtered down to
   48 000 samples a second and written out.

The gestures overlap, and the body is slow, so at rap speed one sound's movements spill into the
next. Measured on the artist's timing (section 15), the vowels come out 5–11 dB quieter than the
same lines three times slower, because the folds are held apart for neighbouring voiceless sounds
and for the end of each breath group, and because the next consonant has already started to close
the mouth while the vowel is sounding; the articulators' speed matters much less.

## The pipeline at a glance

| Stage | Code | Rate | In → out |
|---|---|---|---|
| Text → phonemes | `phonetics/english.rs`, `ipa.rs` | offline | text → `Segment` (IPA, stress, word ends) |
| Syllables | `phonetics/syllables.rs` | offline | words → onset/nucleus/coda (sung path only) |
| Durations | `phonetics/durations.rs`; rap: `phonetics/rap.rs` | offline | segments → seconds |
| Planner | `phonetics/planner.rs` | offline | timed segments → `Gesture`s (one breath group) |
| Score blending | `control/score.rs` | control, 750 Hz | gestures → per-key target, weight, speed |
| Articulator dynamics | `control/articulators.rs`, contacts in `voice/human_voice.rs:517` | control | targets → 17 articulator positions |
| Geometry | `anatomy/human.rs:730` (`compute`) | control | positions → outlines, ~49 measured gaps |
| Area function | `anatomy/human.rs:1185–1371`; slew limits `voice/human_airway.rs:197–278` | control, then per-sample linear ramps | gaps → 18 + 18 section areas, lengths, sub-section minima |
| Glottis | `sources/glottis.rs` | audio, 96 kHz | transglottal Δp, params → glottal area |
| Turbulence | `voice/human_airway.rs:281`, `airway/network.rs:1097` | list at control rate, noise at 96 kHz | flows → pressure sources |
| Airway | `airway/network.rs:769` (`step`) | 96 kHz | areas, glottal area, lung pressure → p, U |
| Radiation, output | `airway/network.rs:1064–1091`, `airway/decimator.rs`, `voice/human_voice.rs:368–395` | 96 → 48 kHz | radiated flow → samples |

### Rates and clocks

- **Internal (simulation) rate**: output × oversampling. `render rap` uses
  `HumanVoice::new(48000, male, 2)` (`crates/chimera-cli/src/rap.rs:155`), so 96 kHz. The FDTD step,
  the glottis and the noise all run per internal sample (`voice/human_voice.rs:356–367`).
- **Control rate**: every `64·m` internal samples (`voice/human_voice.rs:217`) = 128 samples =
  1.333 ms (750 Hz). One control step blends the score, moves the articulators, recomputes the
  geometry, areas, noise-source list, breath gate and pitch glide (`voice/human_voice.rs:428–511`).
  The network then ramps every area, length and port area linearly across the block
  (`airway/network.rs:694–724`, applied per sample at `776–857`), and the lung pressure ramps
  linearly too (`voice/human_voice.rs:363, 496`).
- **Glottal pitch modulation**: drift and vibrato every 32 internal samples (3 kHz,
  `sources/glottis.rs:153–163`).
- **Output**: 48 kHz after a polyphase FIR decimator (`airway/decimator.rs:51–57`), DC blocker and
  limiter (`voice/human_voice.rs:368–395`).
- **Planning** is offline and allocates (`phonetics/mod.rs:1–3`). Gesture times are continuous;
  they are sampled at control steps, so every planned event is quantised to 1.33 ms.

Units are CGS throughout (`physics.rs:1–15`): pressure in dyn/cm² (1 cmH₂O = 980.665), flow in cm³/s.

---

## 1 Text → phonemes

**What it models.** American English pronunciation, not acoustics.

**Method.** `EnglishG2P::to_phrases` (`phonetics/english.rs:132–177`) splits text at `. ! ? ; : ,`
into phrases (pause after: 0.35 s for `.!?`, 0.18 s for other punctuation, 0.3 s at the end;
`english.rs:155–161`), expands digits to words (`english.rs:297–347`), and looks each word up in
CMUdict (`public/data/cmudict.txt.gz`, loaded by the CLI at `crates/chimera-cli/src/render.rs:39`).
ARPAbet maps to IPA in `english.rs:10–53`; unstressed AH/ER become ə/ɚ (`english.rs:257–262`).
In running speech, monosyllabic function words (`english.rs:73`) lose stress and reduce ʌ æ ɑ ɛ ɔ
u ʊ → ə (`english.rs:77–82, 186–198`; "you do to who not no" keep their vowels). Six homographs are
forced to the common reading (`english.rs:60–70`). Words missing from the dictionary go through
~90 letter-to-sound rules with first-vowel stress (`english.rs:355–449`). Allophones
(`english.rs:269–292`, run over each phrase): /t d/ between a vowel (or ɹ) and an unstressed
vowel → tap ɾ unless the /t d/ starts a word, so a word-final /t/ before an unstressed
vowel-initial word flaps; /l/ before a consonant, a pause or a word end → dark ɫ.

`tokenize_ipa` (`phonetics/ipa.rs:31–96`) reads IPA directly ("/ipa/" pronunciations in a rap
score): NFC-normalised, ties removed, `ˈ ˌ` stress, `ː` lengthens ×1.7 (`ipa.rs:64–70`), `,`/`|`
insert a 160 ms silence segment (`ipa.rs:58–60`), unknown symbols are dropped.

**Constants.** Pause lengths (hand-set), reduction lists (hand-set), dictionary (data).

**Simplifications.** One pronunciation per word; no part-of-speech. In the rap path there is no
cross-word flapping: `render rap` runs `to_phrases` on one word at a time
(`crates/chimera-cli/src/rap.rs:21–23, 105`), so the allophone pass never sees the next word and a
word-final /t/ before a vowel-initial word stays a full /t/, and the planner then aspirates it
with the full VOT because a vowel follows (`planner.rs:308`) (read from the code; how often it
happens in the two scores was not counted). Function words still reduce there, since
`to_phrases` always asks for weak forms (`english.rs:147`).

## 2 Syllables

`syllabify_segments` (`phonetics/syllables.rs:33–59`) splits a word by maximal onset over a list of
English onsets (`syllables.rs:15–21`). It is used by the **sung** path (`lyrics_to_syllables`,
`syllables.rs:180–220`; and sung lines in `render rap`, `crates/chimera-cli/src/rap.rs:86`).
**Speech and rap never build syllables**: the planner sees a flat list of segments, the Klatt rules
use only "word" and "vowel" counts (`durations.rs:97–117`), and the rap fitter anchors each word
at its first vowel (`phonetics/rap.rs:94–99`). Syllable-level timing (onset/coda) in speech emerges
only from the vowel-to-vowel gesture overlap (section 5).

## 3 Durations

**What it models.** Segment durations of careful read English (Klatt 1979 / MITalk).

**Method.** `klatt_durations` (`phonetics/durations.rs:94–202`): DUR = MIN + (INH − MIN)·PRCNT with
the inherent/minimum table at `durations.rs:14–69` (literature values, Klatt's table). Vowel
factors (`durations.rs:139–181`): last vowel of the phrase ×1.4, others ×0.6; non-word-final ×0.85;
polysyllabic ×0.8; unstressed ×0.7 with MIN halved; next consonant in the word: voiced fricative
×1.6, voiced stop ×1.2, voiceless stop ×0.7, nasal ×0.85 (in a non-final syllable softened to
0.7 + 0.3f); vowel before a vowel ×1.2, after one ×0.7; a stressed vowel after a voiceless stop or
affricate +20 ms "aspiration eats into it" (hand-added, `durations.rs:176–181`). Consonants
(`durations.rs:185–199`): post-vocalic sonorant at phrase end ×1.4, non-word-initial ×0.85, in a
cluster ×0.7 (both sides ×0.5). `klatt_min` (`durations.rs:86–91`) is the minimum (halved for
unstressed vowels): `--speedup` and the rap fitter use it as "the floor a talker can reach".

**Rate.** Offline, per phrase (in rap: per breath group, so "phrase-final" lengthening lands on the
last vowel of every breath group).

**Simplifications.** No rate dependence except the external `rate` divisor (`planner.rs:260`);
fixed, context-free minimums; no prosodic hierarchy beyond phrase/word.

## 4 The rap path

`chimera render rap <out> <score.json> [male] [--timing even|klatt] [--speedup x] [--base-hz hz]
[--lively] [--reduce] [--tele f] [--probe f.tsv] [--dump]` (`crates/chimera-cli/src/rap.rs:43–207`).

**Breath groups.** Words are read line by line. A new breath group (one `plan_utterance` call,
with its own breath and end-of-group exhale) starts **at every line end and at every gap of more
than 1 µs between words** (`crates/chimera-cli/src/rap.rs:139–150`). The real-timed scores give 21 groups for dt's 14 lines
and 41 for fv's 30 (measured; experiment 30 in the hill-climb log found the same).

**Timing.** The CLI's default is `--timing even` (`crates/chimera-cli/src/rap.rs:45–50`: "even measured better than klatt" on the old rap WER tool); the rap-contrast judge uses `--timing klatt --speedup 2` (`docs/hill-climb/log.md:1886`).
- `Even` (`phonetics/rap.rs:79–89`): each word's span split into shares, consonant 1, unstressed
  vowel 1.9, stressed vowel 2.5.
- `Klatt` (`phonetics/rap.rs:90–112`): the word's first vowel lands on the word's `start` (its
  beat), so a word's slot runs from its first vowel to the next word's first vowel and holds the
  rest of the word plus the next word's onset. The group's first onset consonants come before the
  beat, at most `MAX_PRE_ROLL` = 0.15 s (`phonetics/rap.rs:53`). `fit` (`phonetics/rap.rs:123–143`) fills a slot with
  one k: DUR = MIN + (INH − MIN)·k; a slot longer than natural gives all the extra to the vowels
  (`phonetics/rap.rs:129–136`); a slot below the sum of minimums scales the minimums and reports the word as
  overfull. `t0` puts the plan's 60 ms breath lead before the pre-roll (`phonetics/rap.rs:51, 111`).
- Consequence (measured, section 15): the "3× slower" score gives stops, fricatives and nasals
  only 1.2–1.5× their rap-speed length (approximants 1.2× in fv, 2.1× in dt) and vowels 4.4–4.6×,
  because the extra time goes to vowels.

**Planning.** Each group: `plan_utterance` with the group's segments (durations set), `f0` from
the first word, `Intonation::Flat`, `speedup` and `lively` (`crates/chimera-cli/src/rap.rs:134`). Each word's `hz` is put
on its segments (`phonetics/rap.rs:62`) and becomes a strength-6 pitch target held to 30 ms before
the next vowel (`planner.rs:413, 444–451`).

**Source.** `pressure 9 cmH₂O, tension 0.55`, base pitch the first word's `hz` (`crates/chimera-cli/src/rap.rs:159–161`);
the rest default (`voice/human_voice.rs:49`: breathiness 0.15, roughness 0.1, drift 5 cents,
brightness 0.25).

**`--speedup x`** (`planner.rs:141–145, 266–272`): a segment shorter than its Klatt minimum gets
boost b = min(x, min/dur); otherwise 1. A boosted vowel's gesture ramps shrink (floors 30 ms/b,
`planner.rs:284–285`) and its articulators move b× faster (`planner.rs:287`); a boosted consonant's
oral gestures move faster, their ramp-in and latency lead shrink by b (`planner.rs:304, 311,
548–563`), and an aspirated stop's VOT and aspiration ramp-out divide by the larger boost of the
stop and its vowel (`planner.rs:309–310, 364`). **Not boosted:** voiceless-fricative and /h/
abduction, velum, exhale, breath, dominant ramp-out (18/30 ms). Measured: 67 % of dt's and 43 % of
fv's vowels are boosted (median b 1.32–1.34), so most of fv's consonants run at full natural timing.

**`--lively`**: stressed vowels get a strength-3 breath of 1.22 (secondary 1.08, unstressed 0.9,
`planner.rs:158, 380–387`), a pitch kick after obstruents (×1.07 voiceless, ×0.95 voiced, fading
over 50 ms, `planner.rs:161–162, 452–459`), and `shape_pitch` (`crates/chimera-cli/src/rap.rs:228–238`): stressed +8 %, a
6 % fall over the group, the last stressed vowel −6 %.

**`--reduce`**: words with more than `REDUCE_LOAD` = 15 segments/s (`phonetics/rap.rs:147`) take a
weak form (`crates/chimera-cli/src/rap.rs:211–223`), then `reduce_fast` (`phonetics/rap.rs:165–211`):
-ing → -in', /h/ dropped from unstressed words, a final /t d/ after a consonant dropped before a
consonant, a repeated consonant across words said once, a weak vowel before ɹ l n squeezed out.

**`--probe f.tsv`** writes, per planned segment, the smallest and largest smallest-oral-section
area while it was planned, and per ms the oral minimum and lip aperture (`crates/chimera-cli/src/rap.rs:167–191`). It
does not record the source; the trace below used a separate harness (section 15).

## 5 Planner: segments → gestures

`plan_utterance` (`phonetics/planner.rs:213–471`). One call is one breath group.

**Layout.** Durations from `klatt_durations` (explicit `dur` kept), diphthongs split 0.55/0.45 into
two vowel targets (aɪ→a ɪ, aʊ→a ʊ, ɔɪ→ɔ ɪ, eɪ→e i, oʊ→o u, ɚ→ɝ; `planner.rs:47–57, 221–228`). The
first segment starts 60 ms after `t0` (`planner.rs:243`).

**Vowel gestures** (`planner.rs:273–288`): one per vowel on its calibrated articulation (tongue body
x/y, jaw, lip aperture/protrusion/width, root, larynx, tip curl; `planner.rs:24, 74–108`), active
over the vowel, strength 1, ramping in over max(30 ms/b, 0.75 × the gap from the previous vowel)
+ 10 ms/b and out over max(30 ms/b, 0.4 × the gap to the next) + 10 ms/b. So the tongue travels
vowel to vowel through the consonants (Öhman coarticulation).

**Where the targets come from.**
- *Vowels: fitted.* `vowelTargets.generated.json` (`planner.rs:26, 40`) is written by `chimera
  calibrate`: per body and vowel, Nelder–Mead over the nine vowel keys so that the first three
  peaks of the airway's linear (chain-matrix) transfer function (`airway/frequency.rs:24`, driven at
  the pharynx's first node with the glottis cut, 700 frequencies from 120 to 4600 Hz;
  `crates/chimera-cli/src/calibrate.rs:73–87, 90–96`) match the Hillenbrand et al. (1995)
  means (`phonetics/vowel_data.rs:2`). Cost Σ w·ln(F/F_ref)² with w = 1, 1, 0.45 (1.2 for ɝ),
  plus soft priors: smallest section ≥ 0.22 cm², jaw near 0.2 + 1.5·height, lip rounding and
  spreading bounds (`crates/chimera-cli/src/calibrate.rs:134–168`). AGENTS.md: the table is regenerated, never edited, and
  the fit is not bit-reproducible.
- *Consonants: hand-set targets, one key per consonant generated.* The place targets and dominant
  keys are hand-set in `inventory.rs:136–223` (e.g. alveolar stop tip at (6.25, 9.68)); for the
  consonants with a target constriction area, `calibrate` bisects one key (40 steps) in an /ɑ/
  context with the jaw at 0.55 until the narrowest section equals that area
  (`crates/chimera-cli/src/calibrate.rs:281–330`), into `consonantTargets.generated.json` (`inventory.rs:229`).

**Consonant oral gestures** (`oral_gestures_into`, `planner.rs:535–584`), per consonant from `a`
(closure) to `b` (release):
- *Dominant* gesture on the consonant's own articulators (`inventory.rs` `dominant`): strength
  **40**, plateau from `a − early` to `max(a + 10 ms, b − lead)`, ramp-in 30 ms/q, ramp-out 18 ms
  (30 ms for tongue-body consonants; **not** scaled by q), speed `sp`, release hold 45 ms
  (`planner.rs:563`). Latencies (`planner.rs:556–561`), at boost 1: closing tip consonants early
  31 ms / lead 20 ms; lips 22/19; tongue body 24/34; non-closing (fricatives, approximants) early
  8 ms, lead 0. Speeds: stops and nasals 1.55, taps 2.8, fricatives/approximants/laterals 1.3,
  affricate closure 2.0 and release 1.4, body-only consonants damped to 1 + 0.35(speed − 1)
  (`planner.rs:319–348, 548`). These latencies are "measured movement latencies" of this model
  (fitted to the model's own lag, `planner.rs:553–555`); the ramps and strength are hand-tuned.
  So at boost 1 an alveolar stop's dominant gesture starts **61 ms** (early + ramp-in) before its
  planned start, a labial's 52 ms, a velar's 54 ms, a fricative's 38 ms; the stops still seal only
  2–5 ms before the planned start (measured, 14.6). A fricative's gesture lasts 18 ms past its end.
- *Secondary* gesture on the target's other keys (e.g. a velar's jaw 0.7): strength 2.2, a..b,
  ramps 50 ms/q each way (`planner.rs:570–583`); a velar's front–back place only at strength 0.25
  so it follows the vowel (`planner.rs:571–582`).
- *Alveolar fronting* for t d n s z ʃ… without a body target: tongue body to (3.2, 7.4) at strength
  1.2, ramps 50 ms/q (`planner.rs:565–569`).
- Trills: driven, ~26 Hz alternation of strength-40 gestures (`planner.rs:322–331`); the
  flow-induced valve model (`sources/valves.rs`) is not used by the human voice (only
  `creatures/elephant.rs` uses it).
- A stop closing behind another stop whose articulator is already placed is delayed 25 ms
  (`planner.rs:319, 489–506`).

**Velum** (`planner.rs:351–353`): nasal → velum 0.45 cm² (the articulator value *is* the port area,
`anatomy/human.rs:1264`), strength 4, from 20 ms before the nasal (ramp 50 ms, so it starts
lowering **70 ms** ahead) to 20 ms before its end (ramp 30 ms). Velum blending is "bounded"
(section 6).

**Phonation gestures** (`planner.rs:354–370`), all on the abduction channel unless noted (details
in section 14.6):

| Segment | Gesture | Target (cm²) | Strength | Window |
|---|---|---|---|---|
| /h/ | "h" | 0.33 | 5 | t0 − 10 ms … t1, ramps 30/35 ms |
| ɦ | "ɦ" | 0.10 | 5 | t0 … t1, ramps 30/30 |
| ʔ | "ʔ" (closure channel) | 1.0 | 8 | t0 … t1, ramps 12/15 |
| voiceless stop/affricate, before a vowel, not after /s/ | "aspiration" | 0.36 | 6 | t0 + 0.25·dur … t1 + 0.4·VOT, ramps 35 / 45/squeeze; VOT = 50 ms/squeeze |
| other voiceless stop/affricate | "aspiration" (unaspirated) | 0.22 | 6 | t0 + 0.25·dur … t1 + 4.8 ms, ramps 35/20 |
| voiceless fricative | "voiceless" | 0.30 | 6 | t0 − 15 ms … t1 + 5 ms, ramps 30/30 |
| voiced fricative | "voiced frication" | 0.035 | 3 | t0 … t1, ramps 30/30 |
| end of group | "exhale" | 0.22 | 6 | end + 45 ms (after a sonorant) or + 15 ms … end + 100 ms, ramps 30/60 |

All targets, strengths and windows are hand-tuned; the 50 ms VOT is a textbook English value.

**Breath** (`planner.rs:374–379`): one strength-1 breath gesture of value 1 from `t0 + 40 ms` (60 ms
sung) to the group's end, ramps 40 ms in (so it starts at t0) and 50 ms out (70 ms for an open
end).

**Pitch** (`planner.rs:397–469`): a pitch target per vowel. With a given f0 (rap, singing) it is
that f0 at strength 6 held through the consonants to 30 ms before the next vowel (speech) or to
the vowel's end (sung, open-ended), ramps 60 ms (sung: `pitch_ramp`, 8–60 ms). Without one:
declination 10 % over the phrase, accents +14 % (nuclear +25 %), final fall to 0.82 or a question
rise to 1.35 (`planner.rs:419–442`).

**Simplifications.** No syllable or foot structure; one fixed lead/lag per articulator class
whatever the speaking rate (only `--speedup` scales it, and only below the Klatt minimum); the
glottal gestures of fricatives and /h/ never scale; one breath per group with a fixed exhale.

## 6 Gestural score: blending

`control/score.rs`. A gesture's activation (`score.rs:273–286`) is 0 before `t0 − ramp_in`, a
raised-cosine rise to 1 at `t0`, 1 to `t1`, a raised-cosine fall to 0 at `t1 + ramp_out`: **ramps
lie outside [t0, t1]**. At each control step `blend_all` (`score.rs:405–436`) gives every control key
(17 articulators + abduction, closure, breath, f0, vibrato) the strength-weighted mean of the
active gestures' targets, the total weight Σ act·strength, and the largest `speed` of any gesture
on that key whose window (ramp-in to end + release hold) covers now (`score.rs:412–425`).

How the voice uses the blend:
- **Articulators** (`control/articulators.rs:115–131`, `voice/human_voice.rs:438`): target =
  (base·0.05 + Σw·value)/(0.05 + Σw), base = the performer's posture (neutral schwa,
  `anatomy/human.rs:426`). So a strength-40 consonant outweighs a strength-1 vowel (plus the 0.05
  base) from activation 2.6 %, 3 ms into its 30 ms ramp. On keys no vowel controls (the tongue tip,
  which otherwise rests behind the lower incisors, `anatomy/human.rs:448`, `articulators.rs:110–114`)
  the consonant takes over from activation 0.1 %.
- **Velum** is "bounded" (`articulators.rs:54–56, 122–126`): target moves a fraction min(1, w/2) toward
  the blended value, so the gesture's ramps shape it (a strength-4 gesture is fully on at 50 %
  activation).
- **Abduction** (`voice/human_voice.rs:441–443`): base + value·min(1, w/2)·scale². A strength-6
  gesture is at full abduction from 1/3 activation; strength 5 from 0.4.
- **Closure**: max(base, value·min(1, w/2)) (`human_voice.rs:444–445`).
- **Breath**: gate goal = value·min(1, w) (`human_voice.rs:446–450, 481–482`).
- **f0**: (source f0·0.02 + Σw·f)/(0.02 + Σw) (`human_voice.rs:453–456`).

Bounded: 16 384 gestures; pruned every 100 ms once 0.2 s past their end (`score.rs:305`,
`human_voice.rs:460–462`).

**Simplification.** Linear weighted averaging of targets (Task-Dynamics "blending" without
task-space coupling): two gestures on one key compromise by strength, not by physics.

## 7 Articulator dynamics and contact

**What it models.** Each articulator as a critically damped second-order system tracking its
target: x″ = ω²(T − x) − 2ωx′, ω = 2π·hz·speed (`control/articulators.rs:141–146`), semi-implicit
Euler at the control step. Natural frequencies (`articulators.rs:24–46`, hand-tuned, informed by
VocalTractLab's 5–40 ms time constants): jaw 10 Hz, tongue body 12, tip 13, curl 9, root 9, lips 11,
labiodental 10, velum 12, larynx 8, epilarynx/ventricular 6, lateral 10, dorsum 9. Time constant
1/ω = 12–18 ms (9–13 Hz); a step is 90 % complete after 3.9/ω = 48–69 ms at speed 1 (tongue
body 52 ms, jaw 62 ms), half that at speed 2 (computed from the equation, not measured). The
blended target, not the position, is clamped to each articulator's range (`articulators.rs:134–140`).

**Contact** (`voice/human_voice.rs:517–544`): after each step, if the tip or the tongue body is
more than `max_penetration` = 0.1 cm into the palate (`human_voice.rs:252`), it is projected back
along the contact normal and its inward velocity removed. Consonant targets aim past contact
(e.g. the velar stop, `inventory.rs:143–145`) so closures seal.

**Simplifications.** No mass, muscle or jaw–tongue mechanics; no velocity limits other than the
dynamics; the same ω at every rate unless a gesture sets `speed`.

## 8 Geometry

`HumanVocalTract::compute` (`anatomy/human.rs:730–1268`). A 2-D midsagittal template (cm, glottis at
the origin) of the adult male, mapped to a body by `p()` (`human.rs:690–697`: oral region x > 0.5
compressed ×0.86, pharynx below y = 7 scaled by the body's pharynx factor, all scaled by the body
size). Hand-drawn landmarks: posterior pharyngeal wall, palate and incisors as Catmull-Rom splines
(`human.rs:671–682`). Moving parts:
- jaw: rotation about the condyle by `jaw` cm at the incisors (`human.rs:737–741`);
- velum: a flap from the posterior nasal spine whose angle follows the port area (`human.rs:743–767`);
- tongue: a circle (radius 2.25 cm male) at (tbX, tbY), a Bézier root down to the vallecula, a
  quadratic blade to the tip (curl lifts and turns it), the underside to the jaw-carried floor
  (`human.rs:819–880`); dorsum depression for clicks;
- lips: edges from aperture, protrusion, spreading and labiodental tuck (upper `human.rs:799–815`, lower `884–886`);
- larynx height shifts the glottis and epiglottis (`human.rs:734–735, 822–824`).

**Measured gaps** (`human.rs:931–1072`): 12 horizontal pharyngeal rays, 31 rays of an oral fan whose
centre glides from mid-mouth to behind the incisors, 6 vertical lines from the incisors to the lips;
each gives the midsagittal distance d. A **soft-tissue contact model** replaces d near the palate by
the tongue surface's distance to each roof point (searching ±1–2 mm along the roof, so contacts
seal together, `human.rs:1076–1156`). Lips: d = aperture + Δx²/2R behind the lip edge, R = 0.6 cm,
so compressed lips seal over a length (`human.rs:1158–1177`).

**Simplifications.** One midsagittal slice; no lateral tongue shape except a /l/ side channel and
grooving rules; a circle for the tongue body; hand-drawn template, not imaging data (inferred: no
source is cited in the code).

## 9 Area function, resampling and slew limits

**Area law** (`human.rs:1179–1198`): A = α·d^β per region, `AreaLaw` at `human.rs:665`: pharynx
(2.0, 1.4), oral (2.6, 1.4), in front of a raised tip (1.6, 1.4), dental (2.0, 1.4) blending into an
elliptical lip slit π/4·d·w with w = 1.1–4.6 cm by spreading (`human.rs:1074, 1195`). α, β are of the
literature's form (Heinz–Stevens style), values hand-tuned (inferred: no reference in the code).
Isolated spikes are clamped to 1.35× the larger neighbour (`human.rs:1200–1206`); a /l/ keeps a side
channel of lateral·0.35 cm² near the tip (`human.rs:1208–1213`). The epilarynx is a parametric 2.4 cm
tube: ventricle 1.3, ventricular folds 0.95 (narrowed by `ventricular`), then to 1.9 or 0.35 at the
top by `epilarynx` (`human.rs:1271–1291`).

**Resampling** (`human.rs:1293–1371`): the centreline is cut at the velopharyngeal junction into a
pharynx tube and an oral tube; each is resampled to its fixed node count by the **harmonic mean**
over 8 sub-samples (keeps a constriction's inertance), any closed grid sample seals its section,
and each section also carries its sub-section minimum (which sets the jet losses and the
Reynolds number). Lengths change with the posture.

**Node counts** (`voice/human_airway.rs:88–100`): Δx ≥ (c/fs)/0.93 = 0.392 cm at 96 kHz; pharynx and
oral tubes get ⌊(shortest expected length)/Δx⌋ = 18 sections each for the male body; trachea 13,
nasal 22, piriform 3 (computed from the formulas; not printed from a run).

**Slew limits** (`voice/human_airway.rs:197–256`, constants `158–163`, male body): section areas and
sub-section minima may open at most (45 + 40·A) cm²/s and close at most (r(A) + 40·A) cm²/s, where
r is 45 above 0.4 cm², eases (smoothstep) to 5 at 0.03 cm², and below that shrinks with √A
(`human_airway.rs:220–232, 242`), so a seal is approached smoothly (anti-click, hand-tuned). From
0.4 cm² to the network's closed area (2e-4 cm²) therefore takes at least 27 ms (18 ms to 0.03,
10 ms more), and 1.0 → 0.4 cm² at least 8 ms, however fast the articulators move (integrated from
the formula, not measured).
Experiment `slew3` below shows that relaxing this lowers vowels at speed: it shields them from
early closures.

## 10 Sources

**Glottis**: section 14.

**Turbulence noise** (`voice/human_airway.rs:281–342`, `airway/network.rs:1097–1132`). Up to three
sources per control step: aspiration at the glottal jet (gain 3.2e-6, band 300–3500 Hz), the
narrowest supraglottal section (2.2e-6, 350–2600 Hz, fading in below 0.9 cm², full below 0.35;
`human_airway.rs:301`), and an obstacle
source at the upper incisors for a narrow anterior jet (3.0e-6, high-pass 1200 Hz, low-pass
5000·√(0.2/A) Hz bounded at the /s/ area: a Strouhal scaling, `human_airway.rs:12–25, 334`). Per
sample each is white noise → 1st-order high-pass → 2nd-order low-pass, scaled by
gain·(Re² − Re_c²)/(1 + x/sat), Re = 2|U|/(ν√(πA)), Re_c = 1800 (`physics.rs:35`), sat at Re 12 000,
injected as a series pressure source one flow-direction-aware branch downstream (`network.rs:1100–1131`).
Gains and bands are hand-tuned (hill climb); the Re² law is Stevens-style physics.

## 11 Airway network

`airway/network.rs` (header `1–17`). A staggered-grid FDTD transmission line on a graph: pressure
nodes (volume V = A·Δ) and flow branches. Leapfrog: branches U(n+½) from p(n), then nodes p(n+1).

- **Branch momentum** (`network.rs:865–993`): (L/T + R)·U + k·|U|·U = Δp + Φ/T, solved exactly as a
  quadratic (`network.rs:973–985`). L = ρ(Δa/2Aa + Δb/2Ab); viscous R from the perimeter at a
  fixed 700 Hz reference (`network.rs:420`); Borda–Carnot expansion loss ρ/2·(1/A_min,up −
  1/A_down)² by flow direction plus a 10 % contraction loss (`network.rs:914–930`). Energy-safe
  momentum when L changes (`network.rs:971–972`).
- **Ports** (`network.rs:931–965`): own duct (area, length) with kinetic entrance/exit coefficients
  and either a slit viscous law 12μLw²/A³ or a circular one. The glottis is a port of length 0.3 cm,
  slit width 1.4 cm, coefficients 0.37 entrance + 1.0 exit (Ishizaka–Flanagan values,
  `voice/human_airway.rs:122`); its area is set every sample by the glottis
  (`human_voice.rs:365–366`).
- **Nodes** (`network.rs:1013–1090`): (V/ρc²)·dp/dt = ΣU − U_wall − dV/dt. A closed branch
  (A < 2e-4 cm², `network.rs:417`) passes nothing; node volumes floored at 0.02 cm²
  (`network.rs:418`); junction compliance floor for stability (`network.rs:1053–1059`).
- **Moving walls** (`network.rs:776–857`): −dV/dt is injected, split to open neighbours when a
  cell is nearly shut (< 0.12 cm², `network.rs:361`), and low-passed at 60 Hz (`network.rs:360`).
- **Yielding walls** (`network.rs:995–1011`): mass–spring–damper per unit area (soft tissue 1.5 g/cm²,
  1600, 3e5; trachea, nasal: `physics.rs:28–32`, Ishizaka, French & Flanagan 1975), times
  perimeter·Δ; a quarter of the pharyngeal and oral wall flow radiates (`human_airway.rs:97–98`).
- **Topology** (`voice/human_airway.rs:84–133`): lungs (a fixed-pressure node) → port (2.5 cm²,
  resistance 0.5ρc/A ≈ 8 dyn·s/cm⁵, `human_airway.rs:121`) → trachea 12 cm → glottis → pharynx →
  oral → lips; the velum port (from the pharynx's last node) → nasal 11.4 cm with a 14 cm³
  maxillary-sinus Helmholtz cavity → nostrils; piriform fossae 2.6 cm above the glottis.

**Simplifications.** 1-D plane waves; a fixed lung pressure behind a resistance that is an
acoustic termination, not lung mechanics (it is 8 cmH₂O per L/s, about 4–8× a real lower airway's;
inferred from the formula, the physiology figure is a literature estimate to check); no
cross-modes; turbulence only as injected noise.

## 12 Radiation and output

Lip and nostril ends carry a Flanagan parallel R–L load, L = 8ρ/(3π√(πA)), R = 128ρc/(9π²A),
coupled Crank–Nicolson (`network.rs:1064–1089`). The output is d/dt of the total radiated flow
(lips + nose + wall radiation, `network.rs:1091`). A sealed aperture lets its pressure and flow decay
smoothly. Then: 2× decimation by a Kaiser-windowed sinc (49 taps, β 8.5, cutoff 0.46/M,
`decimator.rs:51–57`), gain 5.5e-7 (×(scale²/folds) and a small-body ramp, `human_voice.rs:226,
257–268`), a 25 Hz DC blocker (`human_voice.rs:229, 371–375`), and a limiter: peak envelope held 25 ms,
released over 0.2 s, gain-reduced above 0.75, soft clip above 0.85 (`human_voice.rs:250–251, 376–394`).
No room and no microphone in the engine; the app's optional "close mic" chain for beatbox mode (proximity low shelf, presence, compressor) is WebAudio, outside it (`src/audio/AudioEngine.ts:82`).

## 13 The sung path: where it differs

`plan_song` (`phonetics/sing.rs:101–177`) builds the same `plan_utterance` call per phrase with
`sung: true` (`sing.rs:164`):
- Every segment has an explicit duration, so the Klatt rules do nothing: consonants are 0.8× the
  inventory's default durations (`sing.rs:123–125`), squeezed (to ≥ 12 ms, `MIN_CONSONANT`,
  `sing.rs:47`) only when they would leave a vowel under 50 ms (`MIN_VOWEL`, `sing.rs:45`); the
  vowel takes the rest of the note.
- The breath reaches full drive as the first segment starts (60 ms, not 40, `planner.rs:22, 378`).
- Consonants carry their note's pitch (`planner.rs:461–469`); pitch ramps shrink with the note
  (`planner.rs:513–518`).
- Diphthongs hold their first vowel 0.8 of the note (speech: 0.55, `sing.rs:151`).
- Vibrato blooms 0.22 s into vowels longer than 0.3 s (`sing.rs:70–71, 168`).
- A phrase's last vowel leaves 50 ms (last phrase) or 120 ms for breath (`sing.rs:130`).
- No `speedup`, no `lively`.

In `render rap`, a line marked `sung` goes through `plan_song` with bpm 60 and 22 cents of vibrato
(`crates/chimera-cli/src/rap.rs:81–97`).

---

## 14 The vocal folds and breath, in depth

### 14.1 The area waveform

`ParametricGlottis::next(dp)` (`sources/glottis.rs:148–224`) runs every internal sample and returns
the glottal area:

  a(t) = max(0, amp·cycle_amp·voicing·shape(φ) + static·(1 − 0.92·closure))   (`glottis.rs:219–221`)

- `shape(φ)` (`glottis.rs:233–246`): zero after the open quotient; a raised-cosine opening over
  `skew` of the open phase, then a closing that mixes a soft cosine and an abrupt quarter-cosine by
  `closure_sharpness`.
- `amp` = amplitude·(0.45 + 0.75·effort), smoothed over 4 ms (`glottis.rs:214–216`).
  amplitude = 0.17·folds cm² (`human_voice.rs:314`; folds 1 male, 0.64 female).
- `static` = abduction + chink, smoothed over 4 ms (`glottis.rs:218`).
- `cycle_amp` and the period scale are redrawn at each cycle start (`glottis.rs:180–199`).

The flow is not specified: the network computes it from the area and the pressures (Bernoulli
kinetic loss, the slit's viscosity, inertance), so pulse skew, F1 ripple and devoicing under an oral
closure emerge (`glottis.rs:1–4`).

For `render rap` (tension 0.55, pressure 9, defaults otherwise; derived from
`human_voice.rs:310–343`): open quotient 0.78 − 0.36·0.55 = 0.582, then −0.18·(effort − 0.5) →
0.564 (`glottis.rs:202`); skew 0.648; closure sharpness 0.22; effort at full breath (9 − 3)/10 = 0.6;
peak vibratory area 0.17·0.9 = 0.153 cm²; chink 0.0125 cm²; base abduction 0.00225 cm². All are
hand-tuned mappings (hill-climb experiments 1–3 tuned the jitter, the closing return phase and the chink, `docs/hill-climb/log.md:201–300`).

### 14.2 The voicing gate (phonation threshold)

Vibration is gated, not simulated (`glottis.rs:171–176`):

  target = smoothstep(2.0, 4.0 cmH₂O, Δp_sm) · (1 − smoothstep(0.08, 0.22 cm², abduction_sm)) · (1 − closure_sm)

- **Pressure gate.** Threshold 2.5 cmH₂O (`glottis.rs:130`); vibration starts fading below
  1.6× (4.0 cmH₂O) and is gone at 0.8× (2.0). Δp is the instantaneous p(trachea top) −
  p(pharynx bottom) (`human_voice.rs:365`), low-passed at 30 Hz (τ 5.3 ms, `glottis.rs:126, 150`).
  With the rap's 9 cmH₂O lungs, a vowel with an open mouth has Δp ≈ 7.7 cmH₂O (measured), so a
  rise of the supraglottal pressure by ~3.7 cmH₂O starts to devoice it.
- **Adduction gate.** Abduction (static − chink) fades voicing from 0.08 cm², and stops it at
  0.22 cm². Note the exhale and unaspirated-stop targets are 0.22: they devoice fully only while
  the gesture's weight is saturated (activation ≥ 1/3 at strength 6), with only the 0.002 cm² base
  abduction to spare.
- `voicing_sm` follows the product with a 25 Hz one-pole (τ 6.4 ms, `glottis.rs:127, 175`), and
  scales the vibratory area linearly. So voicing switches on and off over ~10–20 ms, and a partly
  gated glottis vibrates with a smaller pulse at the same shape (no breathy-to-modal
  transition, no irregular onset).
- No hysteresis: onset and offset share one threshold (real folds start at a higher pressure than
  they stop; question below).

All gate numbers are hand-tuned; the 2.5 cmH₂O threshold is of the literature's order (Titze's
phonation threshold pressure; inferred, the code cites nothing).

### 14.3 Abduction, chink, closure

- Abduction (cm²) = base 0.1·breathiness²·scale² + the score's abduction value·min(1, w/2)·scale²
  (`human_voice.rs:315, 443`). Whisper (`voiced: false`) sets base 0.2 + 0.1·breathiness and
  amplitude 0 (`human_voice.rs:314–315`).
- Chink: a posterior gap open through the closed phase, (0.008 + 0.03·breathiness)·scale²
  (`human_voice.rs:318–321`, Södersten & Lindestad 1990 qualitatively; value tuned in experiment 3).
- Closure (glottal stop): `closure` squeezes the static area by up to 92 % and gates voicing
  (`glottis.rs:174, 220`).
- The open glottis is just a larger port area; aspiration noise rises with the glottal Reynolds
  number (section 10).

### 14.4 Effort, f0, jitter, shimmer, drift

- **Effort** follows the applied pressure each control step: clamp((pressure·gate − 3)/10, 0, 1)
  (`human_voice.rs:497–499`), so during a breath ramp the pulses are also smaller and open longer.
  It raises the pulse amplitude (0.45 + 0.75·effort) and lowers the open quotient (−0.18 per unit
  above 0.5).
- **f0**: the blended score target glides exponentially in log-frequency, τ 30 ms under a score
  (60 ms otherwise, `human_voice.rs:500–503`); the glottis multiplies it by vibrato and drift
  (`glottis.rs:161–164`); fry pulls toward 48 Hz (`glottis.rs:166–168`).
- **Jitter** 0.0021 + 0.0245·roughness (0.45 % at the default), **shimmer** 0.02 + 0.22·roughness
  (4.2 %), Gaussian, per cycle; period-doubling from roughness > 0.5; a logistic-map "chaos" mode
  (`human_voice.rs:334–338`, `glottis.rs:183–198`).
- **Drift**: three filtered noises at 0.3, 0.9, 2.7 Hz (`math.rs:235–259`), 5 cents by default.

### 14.5 Lungs, breath gestures and breath groups

- The lungs are a fixed-pressure node: p = pressure·gate (`human_voice.rs:495`), ramped across each
  control block (`human_voice.rs:363, 496`). The port into the trachea has 0.5ρc/A ≈ 8 dyn·s/cm⁵
  (`human_airway.rs:121`), so the subglottal pressure sags with flow: 7.7–7.9 cmH₂O in voiced vowels
  at 9 cmH₂O lung pressure, and 1–4 cmH₂O lower during voiceless fricatives and /h/ (measured,
  14.6).
- **Gate**: a one-pole toward max(performer gate, breath value·min(1, Σw)), τ 25 ms rising, 20 ms
  falling while a breath gesture is active or within 0.15 s after one, 70 ms otherwise
  (`human_voice.rs:479–494`); a negative breath is ingressive. Measured over each vowel's middle half,
  the gate is ≥ 0.99 for 93–98 % of vowels and never below 0.84 (fast and slow alike): the breath
  ramp itself costs the vowels little; the exhale's abduction is what devoices them.
- **Breath gesture** per breath group (`planner.rs:378–379`): starts rising at the plan's t0, full at
  t0 + 40 ms; the first segment starts at t0 + 60 ms; it ends at the group's end over 50 ms. At a
  group start after a real pause the gate is 0.78 at the first segment (measured).
- **Exhale** per group (`planner.rs:388–396`): the folds part to 0.22 cm² from 45 ms (after a
  vowel or sonorant) or 15 ms (after an obstruent) past the group's end until 100 ms past it,
  ramping out over 60 ms. It devoices from about end + 22–27 ms (sonorant) to end + 137–147 ms
  (computed from the windows and the gate, 14.6), whether or not another group has started.
- **Groups in rap** (`crates/chimera-cli/src/rap.rs:139–150`): a group per line and per gap.
  Because the next group's onset consonants are placed before its first beat (pre-roll up to
  150 ms), a group that follows with no gap **starts before the previous one ends**: 9 of dt's 20
  boundaries overlap by 10–105 ms and 12 of fv's 40 by 10–141 ms (first segment of the next group
  against the last of this one, measured from the plans), and the earlier group's exhale lands on
  the next group's first word. At 3× slower 6 and 10 boundaries still overlap, by up to the same
  105 and 141 ms: the overlap comes from the capped pre-roll, not from the tempo. 19 of dt's and 34
  of fv's boundaries have gaps under 0.2 s (12 and 18 at 3× slower).
- `render text` (`plan_phrases`, `planner.rs:599–610`) makes a group per punctuated phrase with
  pauses of 0.18–0.35 s, so there the exhale falls into silence.

### 14.6 How the glottal opening is timed against the mouth

Computed from the gesture windows (section 5), the blend rule min(1, w/2), the gate's 0.08–0.22 cm²
window and the cosine ramps (all times relative to the planned segment's start c0 and end c1; the
4 ms parameter and 6.4 ms voicing smoothing add a few ms):

| Consonant | Folds start parting / devoiced from | Mouth | Gate reopens / fully open | Note |
|---|---|---|---|---|
| voiceless fricative (strength 6, 0.30) | c0 − 39 / c0 − 35 ms | dominant gesture active from c0 − 38 to c1 + 18 ms (non-closing) | c1 + 25 / c1 + 29 ms | not rate-scaled |
| /h/ (strength 5, 0.33) | c0 − 34 / c0 − 30 ms | no oral gesture | c1 + 23 / c1 + 28 ms | not rate-scaled |
| aspirated stop or affricate (6, 0.36) | c0 + 0.25·dur − 29 / − 25 ms (a 50 ms stop: c0 − 16 / c0 − 12) | dominant gesture from c0 − 61 (tip), − 52 (lips), − 54 (body); acoustic closure ≈ c0, release ≈ c1 | c1 + 0.4·VOT + 0.70·45/sq / + 0.83·45/sq ms: c1 + 52 / + 57 at squeeze 1, c1 + 26 / + 29 at squeeze 2 | VOT 50 ms/squeeze |
| unaspirated stop (6, 0.22) | c0 + 0.25·dur − 27 / − 21 ms | as above | c1 + 17 / c1 + 20 ms | |
| affricate's frication | | held to c1 + 0.4·VOT + 20 ms (`planner.rs:341–344`) | as aspirated stop | |
| exhale (6, 0.22) | end + 22 / end + 27 ms (after a sonorant); end − 8 / − 3 ms (after an obstruent) | none | end + 137 / end + 147 ms | |

Measured in the trace (median, voicing > 0.5 on the engine's smoothed voicing; `timing.py`):

| | dt fast | dt ×3 slower | fv fast | fv ×3 slower |
|---|---|---|---|---|
| V–voiceless fricative–V: voicing off before c0 / back after c1 | −29 / +37 ms | −29 / +37 | −29 / +37 | −29 / +37 |
| V–/h/–V (n = 1 in dt, 5 in fv) | −24 / – | −24 / +35 | −24 / +35 | −24 / +35 |
| V–aspirated stop–V: sealed / released / voice onset after the release | −2 / +2 / 50 ms | −2 / +2 / 62 | −5 / +3 / 61 | −5 / +3 / 62 |
| subglottal dip during a voiceless fricative / /h/ | 1.2 / 1.6 cmH₂O | 3.0 / 2.2 | 1.6 / 1.9 | 3.2 / 4.2 |

So a voiceless fricative takes about 29 ms of voicing from the vowel before it and 37 ms from the
vowel after it, at any rate; an aspirated stop's voice onset is ~61 ms after its release at fv's
pace and at 3× slower alike (only dt's sub-minimum stops get the squeeze). In fv's
vowel–stop–vowel sequences (n = 20) the vowel after the stop is planned at a median 42 ms, so a
61 ms voice onset outlasts it; fv's vowels whose middle half lies under an aspiration gesture
(n = 68) are a median 42 ms too (section 15.2).

**History.** Hill-climb experiment 14 (`docs/hill-climb/log.md:878–926`) tried opening the folds
for a voiceless fricative later (at its onset or 10 ms into it, instead of from 45 ms before), so
the vowel before it keeps its voicing. Whisper's word error rate on read speech got worse (36.09 %
→ 38.08 % and 42.05 %): the voicing carried into the fricative made /s ʃ θ f/ weaker or heard as
voiced. So the early opening is there for the fricative, and the `confine` oracle below costs the
fricatives what it gives the vowels.

---

## 15 Measured trace: rap speed against three times slower

### 15.1 Method

- Scores: `/Volumes/hd/tmp/rapgod/real/dt-real.json` (14 lines, 83 words) and `fv-real.json` (30
  lines, 198 words), the real artist's timing; the slow versions stretch every time ×3 about 0.4 s
  (`/Volumes/hd/tmp/rapgod/real/fv-real-slow.json`, the previous agent's, and `/Volumes/hd/tmp/deep-dive/dt-real-slow.json`, made the same way).
- Renders: `--timing klatt --speedup 2`, male, as the rap judge. A harness,
  `/Volumes/hd/tmp/deep-dive/probe/` (`ddprobe`), re-implements `render rap`'s non-sung path over the
  public engine API (its baseline WAV is byte-identical to the CLI's) and records every ms: glottal
  area (mean, range), the abduction and closure parameters, voicing, lung, subglottal and
  supraglottal pressure, glottal flow, gate, f0, the smallest oral and pharyngeal sections, lip area,
  eight articulators' positions and blended targets, and the vowel- and consonant-gesture weights on
  them. No engine code was changed. Analysis scripts: `/Volumes/hd/tmp/deep-dive/py/` (`trace.py`,
  `gates.py`, `timing.py`, `lines.py`, `line_detail.py`, `durs.py`).
- Level is the previous agent's measure: dB of the 16-bit samples over the middle half of each
  planned vowel (diphthong halves count separately), median over vowels.
- **Counterfactuals** edit the plan (or two public fields) before rendering, to remove one cause at a
  time. They are oracles, not proposed fixes (experiment 14 already showed that `confine`'s kind
  of change hurts the fricatives, section 14.6):

| Name | What it removes |
|---|---|
| `bridge` | a group followed within 0.2 s by the next keeps its breath on until the next group's is full, and loses its exhale (segment timing unchanged) |
| `merge` | breath groups only at gaps ≥ 0.2 s (as experiment 30; this also lengthens vowels into the gaps) |
| `confine` | voiceless-fricative and /h/ abduction confined to the consonant's own planned span |
| `noasp` | aspirated stops made unaspirated (0.22 cm², 12 ms VOT) |
| `protect` | consonant oral gestures (strength 40, 2.2, 1.2, 0.25) inactive in the middle half of every vowel |
| `artic3` | every articulator 3× faster (`ArticulatorBank::speed`) |
| `slew3` | the area slew limits ×3 (`HumanAirway::max_area_rate`, `seal_rate`, `area_rate_gain`) |
| `vel25` | velum lowering starts 25 ms before a nasal instead of 70 ms |

### 15.2 Stage by stage

Medians over vowels (n = 165 dt, 291 fv), each vowel's middle half:

| Stage | Measure | dt fast | dt ×3 | fv fast | fv ×3 |
|---|---|---|---|---|---|
| Durations | segments per second of plan | 24.4 | 8.5 | 14.7 | 5.1 |
| | median vowel / stop / fricative / nasal (ms) | 33 / 46 / 42 / 44 | 144 / 71 / 62 / 64 | 60 / 57 / 49 / 51 | 278 / 71 / 70 / 62 |
| | vowels below Klatt minimum (boosted) | 67 % | 5 % | 43 % | 1 % |
| Gesture overlap | consonant weight on the tongue body at mid-vowel, mean (vowel's: ~1.1–1.3) | 6.6 | 0.6 | 4.7 | 0.6 |
| | vowels where a consonant outweighs the vowel: tongue body / jaw / lips | 27 / 16 / 21 % | 4 / 2 / 3 % | 26 / 14 / 14 % | 2 / 1 / 1 % |
| Articulators | tongue-body distance from the vowel's target at mid-vowel (blended target's) | 0.38 (0.33) cm | 0.06 (0.04) | 0.29 (0.21) | 0.05 (0.04) |
| Tract | smallest oral section, mean over the window (lowest) | 0.36 (0.16) cm² | 0.96 (0.70) | 0.61 (0.24) | 1.36 (0.81) |
| Glottis | vowels voiced > 0.8 / unvoiced ≤ 0.2 | 49 / 36 % | 87 / 5 % | 61 / 23 % | 92 / 3 % |
| | mean voicing | 0.55 | 0.91 | 0.68 | 0.94 |
| | mean 1-ms range of glottal area (∝ pulse size) | 0.035 cm² | 0.052 | 0.039 | 0.042 |
| Pressures | subglottal | 7.29 cmH₂O | 7.86 | 7.69 | 7.82 |
| | supraglottal (share of vowels > 1 cmH₂O) | 0.98 (50 %) | 0.11 (2 %) | 0.37 (31 %) | 0.09 (5 %) |
| | transglottal | 4.52 | 7.73 | 6.70 | 7.72 |
| Output | median vowel level | 65.8 dB | 76.5 | 71.1 | 76.0 |

So dt's vowels lose **10.7 dB** and fv's **4.9 dB** (the earlier 4.8 dB). By context (dB against
the run's median vowel; voicing):

| Vowel context | dt fast | dt ×3 | fv fast | fv ×3 |
|---|---|---|---|---|
| between voiced sounds | +3.9 (0.70) | +0.1 (0.96) | +1.6 (0.89) | −0.1 (0.97) |
| after an aspirated stop | −8.4 (0.07) | −1.3 (0.82) | −8.5 (0.34) | −1.5 (0.87) |
| after a voiceless fricative or /h/ | −10.1 (0.09) | +0.8 (0.87) | −5.2 (0.39) | +0.9 (0.92) |
| before a voiceless consonant | −4.9 (0.56) | −0.8 (0.88) | −2.8 (0.64) | +0.3 (0.95) |
| window under the previous group's exhale (n) | −10.9 (36) | −18.3 (11) | −14.5 (35) | −5.1 (13) |
| window under no abduction gesture (n) | +6.7 (74) | +0.4 (133) | +2.4 (143) | +0.2 (250) |

### 15.3 By line (dt)

Vowel targets per second (a diphthong counts two), median vowel ms, median vowel level, mean
voicing, mean abduction (cm²), and the medians of transglottal and supraglottal pressure
(cmH₂O), smallest oral section (cm²), tongue-body miss (cm) and consonant weight on the tongue
body, all over each vowel's middle half; fast / ×3 slower:

| Line | rate | vowel ms | level dB (Δ) | voicing | abduction | Δp | P supra | oral min | tb miss | cons wt |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 14.3 | 26/108 | 69.7/76.1 (−6.4) | 0.85/1.00 | 0.016/0.002 | 7.1/7.7 | 0.42/0.11 | 0.48/1.03 | 0.33/0.06 | 0.9/0.0 |
| 2 | 12.1 | 46/165 | 62.9/75.4 (−12.5) | 0.42/0.80 | 0.170/0.058 | 3.2/7.7 | 1.89/0.27 | 0.32/0.82 | 0.44/0.06 | 0.5/0.0 |
| 3 | 10.7 | 44/212 | 59.8/75.5 (−15.7) | 0.41/0.85 | 0.161/0.033 | 4.9/7.7 | 0.54/0.09 | 0.65/1.56 | 0.43/0.07 | 0.7/0.0 |
| 4 | 12.1 | 24/116 | 69.7/74.2 (−4.4) | 0.65/0.83 | 0.080/0.034 | 6.3/7.5 | 1.75/0.46 | 0.21/0.27 | 0.49/0.07 | 1.0/0.0 |
| 5 | 13.1 | 24/89 | 57.0/75.4 (−18.4) | 0.27/0.73 | 0.160/0.055 | 3.3/7.6 | 1.59/0.23 | 0.24/1.19 | 0.40/0.20 | 0.9/0.0 |
| 6 | 9.8 | 39/231 | 57.3/77.7 (−20.4) | 0.32/0.91 | 0.212/0.015 | 3.5/7.8 | 0.92/0.08 | 0.46/1.42 | 0.42/0.05 | 0.0/0.0 |
| 7 | 14.0 | 27/115 | 61.2/76.5 (−15.3) | 0.30/0.95 | 0.189/0.022 | 2.8/7.7 | 1.48/0.13 | 0.47/1.14 | 0.39/0.07 | 1.3/0.0 |
| 8 | 15.2 | 35/119 | 65.6/75.8 (−10.1) | 0.65/0.98 | 0.078/0.016 | 6.3/7.7 | 1.03/0.10 | 0.34/1.13 | 0.45/0.15 | 0.8/0.0 |
| 9 | 13.1 | 45/156 | 63.5/77.2 (−13.7) | 0.57/0.92 | 0.119/0.018 | 3.6/7.8 | 1.09/0.10 | 0.38/0.83 | 0.40/0.05 | 0.8/0.0 |
| 10 | 12.1 | 35/134 | 56.8/77.6 (−20.8) | 0.61/0.94 | 0.126/0.016 | 3.3/7.7 | 3.09/0.09 | 0.10/0.81 | 0.39/0.03 | 0.9/0.0 |
| 11 | 14.9 | 27/112 | 67.2/76.8 (−9.6) | 0.45/0.88 | 0.131/0.041 | 4.1/7.8 | 0.56/0.14 | 0.61/1.52 | 0.36/0.07 | 0.3/0.0 |
| 12 | 16.3 | 29/128 | 66.5/77.3 (−10.8) | 0.62/0.95 | 0.108/0.016 | 5.0/7.8 | 0.70/0.09 | 0.35/0.91 | 0.53/0.10 | 0.8/0.0 |
| 13 | 11.4 | 30/123 | 72.3/77.0 (−4.7) | 0.88/0.99 | 0.060/0.002 | 6.6/7.7 | 0.87/0.10 | 0.36/0.98 | 0.36/0.04 | 0.8/0.0 |
| 14 | 7.1 | 48/253 | 69.2/74.3 (−5.1) | 0.62/1.00 | 0.113/0.002 | 6.1/7.8 | 0.82/0.17 | 0.45/0.59 | 0.19/0.06 | 0.0/0.0 |

### 15.4 One line in detail (dt line 10)

Each vowel by its neighbours' class (no words): planned ms; consonant weight at mid-vowel on the
tongue body / jaw / lips; tongue body height (own target / blended / reached, cm); abduction;
voicing; subglottal, transglottal and supraglottal pressure (cmH₂O); smallest oral section (cm²);
level (dB). Fast, then ×3 slower.

| prev → next | ms | cons wt tb/jaw/lip | tbY tgt/blend/x | abd | voicing | Psub | Δp | Psupra | oral min | dB fast | dB ×3 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| vl fric → approx | 62 / 376 | 0.7/0.6/0 | 6.68/6.85/6.91 | 0.248 | 0.00 | 3.7 | 3.3 | 0.43 | 1.07 | 55.7 | 77.8 |
| vd fric → vd stop | 54 / 285 | 0.6/0/0 | 6.68/6.92/6.81 | 0.010 | 1.00 | 7.8 | 5.7 | 2.07 | 0.06 | 66.6 | 79.7 |
| vd stop → vowel | 39 / 138 | 0.8/0/0 | 7.24/7.39/7.32 | 0.002 | 0.90 | 8.0 | 8.0 | 0.00 | 1.20 | 76.4 | 77.4 |
| vowel → vd fric | 31 / 112 | 0/0/0 | 7.74/7.51/7.43 | 0.025 | 1.00 | 7.6 | 7.2 | 0.39 | 0.50 | 74.3 | 76.1 |
| vd fric → vl stop | 22 / 131 | 1.0/0/0 | 6.68/7.03/7.13 | 0.131 | 0.89 | 7.0 | 2.4 | 4.58 | 0.05 | 58.0 | 78.6 |
| vd fric → vowel | 21 / 121 | 39.1/1.0/0 | 7.24/8.31/7.89 | 0.035 | 0.55 | 7.7 | 3.4 | 4.30 | 0.13 | 55.6 | 77.4 |
| vowel → vl stop | 17 / 99 | 40.0/2.1/0 | 7.74/8.31/8.13 | 0.230 | 0.58 | 7.8 | 1.0 | 6.79 | 0.00 | 50.9 | 74.3 |
| vl stop → nasal | 47 / 238 | 1.9/41.2/0 | 6.68/7.14/7.31 | 0.331 | 0.00 | 5.1 | 1.0 | 4.12 | 0.01 | 45.7 | 78.4 |

Every mechanism shows in one line: the first vowel sits under the previous group's exhale and a
fricative's opening (unvoiced, 22 dB down); in a diphthong split into a 21 ms and a 17 ms half, the
following velar stop's strength-40 gesture lifts the tongue body's blended target 1.07 cm above the
first half's own (the tongue gets 0.65 cm above it) and seals the tract inside the second half
(supraglottal pressure 6.8 cmH₂O, Δp 1 cmH₂O, 23 dB down); the last vowel lies under an
aspiration and a fricative's opening (abduction 0.33 cm², unvoiced) while a following nasal's
strength-40 gesture (weight 41 on the jaw) all but seals it (0.01 cm²). At ×3 slower the same
vowels have voicing ≥ 0.70, an oral minimum ≥ 0.66 cm² and levels of 74–80 dB.

### 15.5 What each cause costs

Median vowel level change (dB) against the fast baseline; in brackets, the mean of each vowel's own
change. The fast-to-slow gap is 10.7 dB (dt) and 4.9 dB (fv).

**Each cause alone:**

| Cause | Oracle | dt | fv | same oracle at ×3 slower (dt / fv) |
|---|---|---|---|---|
| (b) breath-group ends: the exhale on the next group | `bridge` | +3.3 (+2.6) | +0.7 (+1.3) | +0.4 / +0.1 |
| (b) without the exhale only | `noexhale` | +3.3 (+2.6) | +0.7 (+1.3) | |
| (b) merged groups (also lengthens vowels into the gaps) | `merge` | +4.7 (+3.7) | +0.6 (+1.3) | |
| (a1) voiceless-fricative and /h/ opening spilling into vowels | `confine` | +2.7 (+2.0) | +1.0 (+1.6) | +0.1 / +0.0 |
| (a2) 50 ms aspiration | `noasp` | +0.8 (+0.5) | +0.5 (+0.6) | +0.1 / +0.0 |
| (a) both | `confine,noasp` | +3.3 (+2.6) | +1.4 (+2.3) | |
| (c) consonant gestures inside the vowel's middle | `protect` | +3.0 (+2.2) | +1.1 (+1.3) | +0.2 / +0.0 |
| articulator speed | `artic3` | +1.2 (+1.1) | +0.3 (+0.3) | −0.1 / −0.0 |
| area slew limits | `slew3` | −1.0 (−0.7) | −1.3 (−0.6) | −0.1 / −0.0 |
| velum anticipation | `vel25` | −3.4 (−0.9) | −0.2 (−0.5) | |

**Added one after another** (median vowel level):

| Step | dt | fv |
|---|---|---|
| fast baseline | 65.8 | 71.1 |
| + `bridge` (b) | 69.1 (+3.3) | 71.8 (+0.7) |
| + `confine` (a1) | 72.2 (+3.1) | 73.0 (+1.2) |
| + `noasp` (a2) | 72.5 (+0.3) | 73.2 (+0.2) |
| + `protect` (c) | 74.4 (+1.9) | 74.5 (+1.3) |
| + `artic3` | 75.2 (+0.8) | 74.7 (+0.2) |
| ×3 slower baseline | 76.5 | 76.0 |
| ×3 slower with the same five oracles (and `slew3`) | 77.0 | 76.0 |
| left unexplained | 1.3–1.8 | 1.3 |

With all five, the fast source looks like the slow one (mean voicing 0.88 dt, 0.90 fv against
0.91, 0.94; transglottal 7.6, 7.7 against 7.7; supraglottal 0.13, 0.10). The order matters by a few
tenths for fv; for dt, `bridge` and `confine` together give 0.4 dB more than their sum (they free
the same vowels).

So, for fv (291 of the 456 vowels, so it dominates pooled medians): **voicing next to voiceless consonants
≈ 1.4 dB (fricatives and /h/ 1.0–1.2, aspiration 0.2–0.5), breath-group exhales ≈ 0.7 dB,
consonant gestures in the vowel ≈ 1.1–1.3 dB, slow articulators ≈ 0.2–0.3 dB, unexplained ≈
1.3 dB.** For dt the same causes cost about 3.3, 3.3, 1.9–3.0 and 0.8–1.2 dB, with 1.3–1.8 left.

### 15.6 What the earlier diagnosis missed

1. **The consonant gestures cost through the source as well as the filter.** At mid-vowel the
   supraglottal pressure exceeds 1 cmH₂O in 50 % of dt's vowels and 31 % of fv's (2–5 % slow),
   because the neighbouring consonant's constriction is already (or still) narrow (oral minimum
   0.16–0.24 cm² against 0.70–0.81 slow). That lowers the transglottal pressure (dt median 4.5
   against 7.7 cmH₂O) into the pressure gate's 2–4 cmH₂O fade and shrinks the pulses. `protect`
   halves the supraglottal pressure (0.98 → 0.41 dt) and raises the transglottal (4.5 → 5.5);
   voicing barely moves (0.55 → 0.58), so most of its gain is the open tract and the stronger
   flow, not the gate.
2. **It is not only the vowel's ends.** At boost 1 (most of fv) a following consonant's dominant
   gesture starts 38–61 ms before its planned onset and its secondary and alveolar-fronting
   gestures ±50 ms around it (section 5), so in a 30–60 ms vowel the next consonant has a say from
   the vowel's start. In dt, stops seal inside the planned vowel (line 10, 15.4).
3. **Breath groups overlap in time.** A line boundary without a gap makes the next group start up
   to 141 ms before the previous one ends (9 of 20 boundaries in dt, 12 of 40 in fv; 6 and 10 at
   3× slower, so it is not a tempo effect, but at speed the exhale lands on 30–60 ms vowels). The exhale,
   not the breath ramp, is what costs: `noexhale` alone equals `bridge` exactly.
4. **VOT does not shorten at fv's pace.** Measured voice onset ~61 ms after the release, fast and
   slow alike, because fv's stops and vowels are mostly above their Klatt minimums (squeeze 1); in
   fv's vowel–stop–vowel sequences the vowel after the stop is a median 42 ms, shorter than the
   voice onset.
5. **The "3× slower" control mostly stretches vowels.** Klatt fitting gives the extra time to
   vowels (`phonetics/rap.rs:129–136`): slow stops, fricatives and nasals are only 1.2–1.5× their
   fast length, the vowels 4.4–4.6×. The comparison
   isolates vowel compression, not a uniform tempo change.
6. **Two fixes that look obvious make it worse.** Faster area slewing (`slew3`, −1.0 to −1.3 dB)
   and a shorter velum anticipation (`vel25`, −0.5 to −0.9 dB mean) both lower vowels: the slew
   limit is currently shielding vowels from the consonants' early closures, and the velum needs its
   lead to be open when the nasal starts (the second is inferred; not traced further).
7. **Articulator speed is a small part** (0.3 dB fv, 1.2 dB dt with all articulators 3× faster).
   The blended targets, not the dynamics, set where the tongue goes: the blended target itself is
   0.21 of fv's 0.29 cm median tongue-body miss and 0.33 of dt's 0.38 (the earlier agent's "about
   half", `docs/hill-climb/log.md:1914–1915`, is more than half here).
8. **The subglottal source has an acoustic, not physiological, resistance** (≈ 8 cmH₂O per L/s):
   Psub sags 1–4 cmH₂O during voiceless fricatives and /h/. In vowel middles it is 7.3 cmH₂O (dt
   fast) against 7.9 slow, and the all-oracle run restores it to 7.8, so once the abduction is out
   of the vowels the sag costs little level (inferred from those medians), but it shapes every
   voiceless-to-voiced transition.

The level gains are not intelligibility: experiment 32 raised the contrast and lost 7.8 points of
word error rate. These oracles say where the dB go; they do not say which change a listener needs.

---

## Questions for the real voice

Each is a model assumption that matters at 9–15 syllables a second, phrased so measurements of real
speech (or of the artist) can answer it.

1. **VOT and rate.** The model keeps an aspirated stop's VOT at 50 ms planned (~61 ms measured to
   voice onset) unless the stop or its vowel is below its Klatt minimum (`planner.rs:309–310`).
   How does real VOT of /p t k/ scale with speaking rate and with the following vowel's duration,
   down to 30–60 ms vowels?
2. **The glottal gesture of voiceless fricatives.** The model devoices from ~29–39 ms before a
   voiceless fricative to ~25–37 ms after it, at any rate (`planner.rs:366`). How far does the real
   glottal opening lead and lag the oral constriction, and do its duration and peak shrink at fast
   rates (Munhall & Löfqvist 1992; Löfqvist & Yoshioka)? Experiment 14 found a later opening made
   the fricatives weaker for Whisper, so the answer should cover both sides: how much voicing does
   the real vowel keep, and how soon is the real fricative fully voiceless?
3. **Peak glottal opening.** Targets are 0.30 (fricatives), 0.36 (aspirated stops), 0.33 (/h/),
   0.22 cm² (unaspirated stops, phrase-end exhale). What are real peak glottal areas for these, and
   at fast rates?
4. **When do the folds stop vibrating?** The model fades voicing from 0.08 cm² of abduction and stops
   it at 0.22, and needs 4 cmH₂O transglottal for full voicing (gone at 2.0) with no hysteresis
   (`glottis.rs:172–174`). What abduction and transglottal pressure end and restart phonation in
   real speech, and how much higher is the onset threshold than the offset?
5. **Voicing onset dynamics.** The model's voicing rises with a 6.4 ms time constant plus 4 ms of
   parameter smoothing, as a scaled copy of the full pulse. How many cycles does a real voice take
   to reach full amplitude after a voiceless consonant, and is the first part breathy?
6. **Supraglottal pressure in fast vowels.** At rap speed the model has > 1 cmH₂O behind the lips in
   31–50 % of vowel middles. How much does intraoral pressure stay raised through real fast vowels,
   and does phonation weaken there?
7. **Vowel intensity at fast rates.** Do real vowels lose level at fast rates (the model: 4.9 dB in
   fv, 10.7 dB in dt against 3× slower), and how much of a rapper's vowel-to-consonant contrast
   (approximants −5, voiced fricatives −14, nasals −5 dB, `docs/hill-climb/log.md:1894`) survives
   at 9–12 syllables a second?
8. **Consonant anticipation.** The model's consonant gestures start 38–61 ms before the planned
   closure, and its secondary gestures ±50 ms, at any rate above the Klatt minimum
   (`planner.rs:556–583`). How early do real lip, tip and dorsum movements toward a consonant start,
   and does the lead shrink in proportion at fast rates (Gay 1981)?
9. **Speed or reach?** The model makes articulators faster only below the Klatt minimum (≤ 2×) and
   otherwise keeps 9–13 Hz dynamics. At fast rates do real speakers raise peak velocities
   (stiffness) or shorten displacements and undershoot (Ostry & Munhall 1985; Lindblom 1963)? Peak
   velocities of tip, dorsum, lips and jaw in fast speech?
10. **Closing time.** The model's areas take at least 27 ms to go from 0.4 cm² to a seal (slew limits), and
    stops seal 2–5 ms before their planned onset. How long is the real closing phase of a stop, in
    area per ms, at fast rates?
11. **Which segments compress?** The model compresses vowels first (Klatt's MIN + (INH − MIN)·k with
    one k per slot): dt vowels 33 ms, stops 46 ms, fricatives 42 ms. In real rap at 9–15
    syllables a second, how are vowels and consonants shortened, and what are the floors?
12. **Breathing in rap.** The model starts a breath group at every line and every word gap, each
    ending with the folds apart for ~150 ms. Where do rappers actually breathe, how long are their
    breath groups, and do the folds open at phrase ends or in short gaps (< 200 ms)?
13. **Subglottal pressure.** The model holds the lungs at a fixed 9 cmH₂O behind ≈ 8 cmH₂O per L/s,
    so Psub dips 1–4 cmH₂O in voiceless consonants. What are Psub, its dips and its recovery in
    fast connected speech, and real lower-airway resistance?
14. **Stress and effort.** Without `--lively` every syllable gets the same breath. Do rappers vary
    subglottal pressure syllable by syllable, and by how much (dB per stressed syllable)?
15. **Nasal timing.** The velum starts lowering 70 ms before a nasal at any rate. How early does the
    real velum lower before a nasal at fast rates, and how much of a 40 ms vowel is nasalised?
16. **VOT in the vowel.** Klatt timing counts aspiration in the following vowel (+20 ms for a stressed
    vowel, `durations.rs:176–181`); the artist's alignment puts it in the stop. Where does the
    artist's VOT fall relative to the beat?
