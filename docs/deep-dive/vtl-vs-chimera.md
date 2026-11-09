# VocalTractLab against CHIMERA: what VTL does, and what could make our male voice clearer at talking speed

*Research note, 2026-11-08. Nothing was built or run, and no VTL code was copied. The VTL source was
read at `TUD-STKS/VocalTractLabBackend-dev` commit `df30392` (2026-06-14), shallow-cloned to
`/Volumes/hd/tmp/vtl-study/src/backend`. VTL paths below are relative to `src/VocalTractLabBackend/`
unless they start with `include/` or `resources/`. CHIMERA facts come from
`docs/deep-dive/engine-map.md` (as found in the working tree on 2026-11-08), with `file:line` relative to
`crates/chimera/src/`. A few CHIMERA lines I read myself are marked "(read)". Judge numbers come
from `out/tsp/best/report.md`, "## male", given as speakers / synth (cost). Whisper error classes
come from `docs/hill-climb/log.md:2232–2290`.*

How to read the citations:

- **[full]** means I read the paper's full text. **[abstract]** means I read only the abstract or a
  summary of it.
- **[code]** means a VTL source line.
- **computed** means my own arithmetic from an equation in the code. It is not a measurement of
  rendered audio.

---

## Summary

### The five differences that most plausibly cost clarity

1. **Sibilant noise has one source in VTL and two in CHIMERA.**
   - VTL puts all /s ʃ/ noise at the upper incisors, as a single obstacle source.
   - CHIMERA adds a second source at the constriction exit, low-passed at 2.6 kHz.
   - That extra low band plausibly drags the /s z/ centroids down: s 5725 / 4424 Hz (2.15), z
     5117 / 4059 Hz (2.49).
2. **The noise amplitude laws differ.**
   - VTL uses Stevens' |v|³·√A. It has no critical Reynolds number and no saturation. Its gain is
     flat for areas from 0.15 to 0.5 cm², and it is compensated so that a lower cutoff does not
     lower the radiated level.
   - CHIMERA has three things that each take level from /ʃ/:
     - its Re² law saturates;
     - its teeth source fades for areas from 0.2 cm² up, and 0.2 cm² is exactly the /ʃ/ target;
     - its lower /ʃ/ cutoff is not compensated.
   - The judge: level ʃ −8.9 / −14.7 dB (2.55), level tʃ −10.9 / −15.6 dB (2.14).
3. **Voicing in obstruents follows the aerodynamics in VTL.**
   - In VTL the fold amplitude scales with √(transglottal pressure). There is no voicing gate, and
     voiced fricatives use a half-open, still-vibrating glottis (about 0.18 cm² static, computed).
   - In CHIMERA the pulse size is set by lung pressure, then cut by a hard gate. Voiced fricatives
     are nearly adducted (0.035 cm²) and build almost no oral pressure.
   - The judge: level ð −21.0 / −10.4 dB (4.08), level v −19.4 / −10.3 dB (1.74), voiced ð
     0.35 / 0.63, voiced z 0.34 / 0.76.
4. **Coarticulation never averages targets in VTL.**
   - Each parameter has one target at a time. A consonant fully owns its primary articulator.
   - The consonant's other parameters come from prototypes measured in the /a i u/ contexts and
     interpolated toward the current vowel. There are no context-free secondary targets.
   - CHIMERA blends by strength (40 / 2.2 / 1.2 against the vowel's 1), with fixed secondary and
     "alveolar fronting" targets. Those pull short vowels toward one place whatever the vowel is.
   - This bears on the formant diagnostics (F2 u 1555 / 1068 Hz, F2 ɑ 1104 / 1377, F2 æ
     1441 / 1722). It also bears on Whisper's largest error class, vowel identity (113 confusions).
5. **The glottal gestures are graded by duration in VTL.**
   - A VTL glottal gesture lasts exactly as long as its segment. It is shifted earlier by the
     dynamics' half-rise time (57 ms) and smoothed by the same fifth-order dynamics. So a short
     fricative gets a partial opening: 58 % of full at 40 ms, 89 % at 80 ms (computed).
   - VTL's VOT depends on place (p 47, t 50, k 70 ms, after Klatt 1975). It is cut to 10–20 ms
     before a fricative, and the closure is never shorter than half the stop.
   - CHIMERA's glottal windows are fixed and saturate to full opening, with one 50 ms VOT for every
     stop.
   - The judge: duration k 1.22 / 0.77 (3.53), p and t also short. Whisper confused k→g 10 times
     and p→b 5 times.

### The three ideas I would test first (details in "## Ideas ranked")

1. **Put all sibilant noise at the teeth.** Drop the constriction-exit source wherever the teeth
   source is active. Moves the **s and z centroids**.
2. **Use the VTL-style amplitude law for the sibilant source.**
   - Stevens' law with no saturation.
   - VTL's area window: flat to 0.5 cm², then fading to 1.0.
   - The cutoff-compensated gain.

   Moves the **ʃ and tʃ levels**.
3. **Voiced obstruents with aerodynamic voicing.**
   - Fold amplitude scales with √(transglottal pressure).
   - Voiced fricatives get a partly abducted but vibrating glottis.

   Moves the **ð and v levels** and the **voiced z and voiced ð** shares. It should also raise the
   z centroid by giving more frication.

---

## 1 Subsystem by subsystem

### 1.1 Coarticulation and timing (the gestural score)

**VTL.**

*The score.* A gestural score has eight tiers: vowel, lip, tongue tip, tongue body, velic, glottal
shape, F0 and lung pressure (`GesturalScore.cpp:838–845`) [code]. Within a tier, gestures follow
one another without overlap. Each gesture names a target, a shape or a value, and a time constant.

*How targets are combined.* `calcTractParamTargets` (`GesturalScore.cpp:3899–4232`) [code] cuts the
score into slices at every boundary of any tract tier. Within each slice:

- All 19 vocal-tract parameters start from the active vowel's shape.
- If any consonant gesture is active, every parameter is replaced by the mean of the active
  consonants' context-dependent shapes.
- Each consonant then takes "FULL CONTROL" of its primary articulator (`:4139–4160`):
  - lips: LP and LD;
  - tongue tip: TTX, TTY and the tongue-side elevation TS3;
  - tongue body: TCX, TCY and TS2.
- The velic tier overrides the velum opening (`:4165–4170`).
- Direction-dependent velocity factors then divide each time constant (`:4192–4231`). All of them
  are 1.0 in the shipped speaker (`resources/JD3.speaker:45–63`).

So there is no weighted averaging of a vowel and a consonant on one parameter.

*The context-dependent consonant.* `getContextDependentConsonant` (`:3473–3523`) [code] gives each
consonant three prototypes, one each in the /a/, /i/ and /u/ contexts. It interpolates them as
x = x(a) + α(x(i) − x(a)) + β(x(u) − x(a)). The weights α and β come from projecting the current
vowel into the a–i–u subspace, and the lips are interpolated separately from the tongue.

- This is the model of Birkholz 2013 (PLoS ONE) [full]. There the prototypes came from MRI of one
  speaker and were then acoustically optimised.
- In that paper the consonants of CV syllables with /b d g l r m n/ were recognised 82.4 % of the
  time, and the vowels 95.4 % (20 listeners, Table 4).
- An earlier VTL used a per-parameter dominance model, x = v + w·(c − v) (Birkholz 2007,
  Interspeech) [full]. The 2013 model replaced it.
- Xu, Birkholz & Xu (2019, ICPhS) [full] tested the same idea in synthesis: "each articulatory
  dimension was controlled either by the consonant or by the vowel", with no blending. Their
  learned English CVC words were recognised 45–100 % of the time, depending on the word (their
  Fig. 2).

*Timing from a segment list.* `createFromSegmentSequence` (`:824–2083`) [code] builds the score
from segments:

- **Vowels.** Vowel gestures tile the vowel tier. Each ends 20 ms before its vowel's acoustic end
  (`:1374`), so a consonant between two vowels takes the following vowel as its context once the
  previous vowel's gesture has ended.
- **Fricatives** (`:1611–1690`).
  - The oral gesture runs from segment start − 57 − 15 ms (−20 ms if voiced) to segment end − 47 ms.
  - The glottal gesture covers exactly the segment, shifted 57 ms earlier. The code says this
    delay "was precisely tuned so that the degree of glottal abduction is the same at the segment
    beginning and end".
  - 57 ms is the half-rise time of its 5th-order dynamics at τ = 12 ms (computed: 56 ms).
  - A voiceless fricative followed by /p t k/ keeps the glottis open 30 ms longer (`:1673`).
- **Plosives** (`:1744–1930`).
  - VOT is p 47, t 50 and k 70 ms, but 10, 15 and 20 ms before a fricative. Voiced b, d and g get
    11, 17 and 27 ms. The comment cites Klatt (1975).
  - The closure runs from the segment start to segment end − VOT, so the plosive segment includes
    its aspiration. The closure is forced to at least half the segment and at least 20 ms
    (`:1872–1880`). So VOT is never more than half the stop.
  - The glottal gesture runs from closure − 10 ms to segment end − 40 ms (`:1888–1889`). It is
    shortened before voiced fricatives, homorganic nasals and laterals, and /l/.
- **Closing gestures are placed by search** (`addClosingGesture`, `:2090–2250`). The code
  re-simulates the articulators in 2.5 ms steps (`include/.../GesturalScore.h:142`).
  - It moves the gesture's start earlier until the model's tube is actually closed at the planned
    closure start.
  - It moves the gesture's end until the closure opens at the planned release.
  - It tests the tube itself: an area under 2× the minimum, made by the right articulator
    (`:2258–2356`).
- **The velum** is placed by the same kind of search. The port opens 30 ms before a nasal and
  closes 30 ms after it when vowels neighbour it, and less next to obstruents (`:1970–2005`,
  `:2363–2465`).
- **Other segments.** /h/ and the glottal stop are shifted 60 ms early (`:2019`, `:2034`), /l/
  65 ms (`:2060–2072`).
- **Affricates** are split into a stop and a fricative: /tʃ/ is 0.33 stop and 0.67 fricative, /dʒ/
  0.4 and 0.6, "determined from audio recordings of Peter Birkholz" (`:870–890`).
- **The lungs** get one 800 Pa (8.2 cmH₂O) gesture for the whole utterance (`:1010–1085`).
  - It rises with τ = 5 ms, starting 20 ms before the first segment (50 ms before a plosive).
  - It starts to fall 120 ms before the last segment ends, or 70–90 ms before a final /t p k/.
  - Pauses are just empty segments: there is no phrase-end abduction.
- A recent EMA study from the same group [abstract, via OpenAlex] reports something relevant to
  timing. When tongue-body movements start relative to an intervocalic consonant depends mainly on
  the vowel and consonant durations and the direction of movement (Kleiner, Mooshammer, Belz &
  Birkholz 2026, JASA 159(5)). That argues against fixed latencies.

**CHIMERA.**

- **Gestures overlap and are blended by a strength-weighted mean** (`control/score.rs:273–286,
  405–436`; articulators `control/articulators.rs:115–131`).
  - Vowels have strength 1.
  - A consonant has a dominant gesture of strength 40, a secondary of 2.2 on its other keys (for
    example a velar's jaw 0.7), and "alveolar fronting" of the tongue body to (3.2, 7.4) at 1.2,
    with 50 ms ramps (`phonetics/planner.rs:535–584`).
- **The lead times are fixed by consonant class** (`planner.rs:556–561`). They were fitted once to
  the model's own lag: 61 / 52 / 54 ms before closure for tip, lips and body, and 38 ms for
  fricatives. Measured, stops seal 2–5 ms before the planned start.
- **Glottal gestures have fixed windows** (`planner.rs:354–370`, table in engine-map §5).
- **Each breath group gets a breath gesture and an exhale abduction** (`planner.rs:374–396`).
- **Affricates** keep their frication to c1 + 0.4·VOT + 20 ms (`planner.rs:341–344`).

**Difference.**

- **Averaging.**
  - CHIMERA averages a consonant's context-free secondary targets with the vowel. VTL lets the
    vowel own every parameter the consonant does not need, or derives that parameter from the
    vowel's own position.
  - At fv's rap pace the consonant weight on the tongue body at mid-vowel is 4.7, against the
    vowel's ~1.1–1.3. A consonant outweighs the vowel on the tongue body in 26 % of vowels
    (engine-map §15.2).
  - Removing consonant gestures from the vowel middles (the `protect` oracle) gained +1.1 to
    +3.0 dB (§15.5).
- **Placement.** VTL places each closure by simulation, per token. CHIMERA uses fixed leads. Its
  stops still seal on time, so this difference matters less than the averaging.
- **Breath.** VTL has no phrase-end exhale. That matters for rap (`bridge` +0.7 to +3.3 dB, §15.5).
  It matters little for the TSP sentences, where CHIMERA's exhale falls into the 0.18–0.35 s pauses
  (§14.5).

**Clarity cost at talking speed.** Likely moderate, through vowel quality. The TSP diagnostics show
vowel targets far off: F2 u 1555 / 1068 Hz (6.42), F2 ɑ 1104 / 1377 (3.18), F2 æ 1441 / 1722
(2.32), F1 ɔ 485 / 614 (2.65). Vowel identity is Whisper's largest class.

- Some of this is the vowel targets themselves, which were calibrated to Hillenbrand's /hVd/ means.
  That is not VTL's business.
- The part caused by blended secondary targets is something the VTL scheme avoids by construction.

### 1.2 Articulator motion

**VTL.**

*The dynamics.* Each parameter follows a critically damped 5th-order linear system, a cascade of
five equal first-order lags (`GesturalScore.cpp:4337–4442`) [code]. Position and its first four
derivatives are carried across every target boundary.

- The default τ is 12 ms (`:32`).
- In computed terms, a step is 10 / 50 / 90 % complete at 29 / 56 / 96 ms: almost no motion for
  the first ~25 ms, then a bell-shaped velocity.

*Where the order and time constants come from.*

- The 2011 IEEE paper [full] used a 10th-order system. It reports "a reaction time of roughly
  50–100 ms". Its fitted time constants lie between 0 and 40 ms (Fig. 7).
- Birkholz & Hoole 2012 [full] found that the fitting error "substantially drops up to an order of
  five or six". Their median time constants were 20.5–27.6 ms for lip and jaw V–V movements.
- A 2017 re-synthesis (Birkholz et al., Computer Speech & Language) [full] used 10 ms for lips,
  15 ms for the tongue tip, 20 ms for the tongue body and 15 ms for vowels.
  - Doubling all time constants was heard as less careful speech 77–96 % of the time.
  - Halving them was not reliably heard (54 %).

*Contact and virtual targets.* Contact is handled by clipping, with virtual targets placed about
10 mm beyond the contact point.

- In Birkholz, Kröger & Neuschaefer-Rube 2010 (Interspeech) [full], targets 10 mm beyond contact
  reproduced natural formant transitions better than targets 1 mm beyond. They had no effect on
  intelligibility: 25.2 % against 25.6 % errors.
- In the 2013 paper [full], the release falls "about half-way between the (virtual) target for the
  consonant and the vowel target".

**CHIMERA.** Each articulator is a critically damped 2nd-order system, ω = 2π·(6–13 Hz)·speed
(`control/articulators.rs:24–46, 141–146`). For the tongue body at 12 Hz, a step is 10 / 50 / 90 %
complete at 7 / 22 / 52 ms (computed). The response starts at once, front-loaded. Contact works by
projecting the articulator back out of the palate (`voice/human_voice.rs:517–544`), with targets
past contact.

**Difference.** The rise times are similar: 10–90 % takes 67 ms in VTL and 45 ms in CHIMERA. The
shape differs. VTL waits and then accelerates. CHIMERA moves the moment a gesture's weight rises.

**Clarity cost.** Small. Making every articulator 3× faster gained only +0.3 dB for fv and +1.2 dB
for dt (`artic3`, §15.5). Where the blended target points matters more than how fast the
articulator follows it (§15.6 item 7).

### 1.3 Area function and geometry

**VTL.**

- **The model.** VTL uses a 3D geometric vocal tract fitted to MRI of one German man (the JD3
  speaker).
- **Cross-sections.** The model is cut perpendicular to a smoothed centre line at 129 points. The
  cuts are mapped to 40 sections (Birkholz 2014, ISSP) [full]:
  - 16 equal sections from the glottis to the velum;
  - 24 shortening sections toward the mouth, for detail where fricatives are made.
- **Each section** keeps:
  - the minimum area over its interval, so short closures are not averaged open;
  - the articulator on its anterior–inferior side: tongue, lower incisors, lower lip or other.

  This is the paper's "enhanced area function".
- **Noise sources** are typed by that articulator label and by the distance to the incisors.
- **The tongue sides** are three parameters, TS1–TS3. Every tongue-tip consonant owns TS3
  (`GesturalScore.cpp:4153`), so a coronal after /l/ re-seals the sides immediately.
- **Laterals** get no frication source (`TdsModel.cpp:1579–1585`).
- **Why resolution matters.** In the 2006 fricative study (Birkholz & Jackèl) [full], fricative
  spectra were "very sensitive to area changes" in the front of the tract. The study asked for
  finer front resolution and found the sublingual space and the incisor constriction essential for
  /ʃ ç/.

**CHIMERA.**

- The geometry is a 2D midsagittal template measured along ~49 rays. Areas follow an α·d^β law per
  region and are resampled by harmonic mean into 18 + 18 sections, with each section's minimum
  kept (`anatomy/human.rs:730–1371`).
- Δx is at least 0.392 cm, set by the explicit scheme's stability limit (`voice/human_airway.rs:88–100`).
- A /l/ side channel of lateral × 0.35 cm² (`human.rs:1208–1213`) is moved only by /l/ gestures.
- The teeth source is placed by its distance behind the teeth.

**Difference.**

- VTL's front sections are shorter. CHIMERA's oral grid is uniform and coarse, so a ~1–2 cm /s/
  front cavity spans 3–5 sections.
- VTL coronals own the lateral channel. CHIMERA's channel stays open into the next coronal:
  0.27–0.35 cm² through /ð z s d/ after /l/. Whisper heard "tell depth", "bowl", "coated" and
  "single" (`docs/hill-climb/log.md:2262–2268`).

**Clarity cost.**

- The lateral leak plausibly costs part of the ð level gap (4.08) and the s/z centroids.
- Grid resolution is a possible contributor to the /s/ centroid, but I could not estimate how
  much.

### 1.4 Vocal folds and voicing (with obstruent voicing, aspiration, lungs)

**VTL.**

*The default fold model.* The default is the geometric glottis (selected in
`resources/JD3.speaker:1518`; `GeometricGlottis.cpp`) [code]. The 2019 Interspeech paper
describes it [full]:

- Lower and upper fold edges each move as a sinusoid along the fold length.
- Each edge has a rest displacement at the vocal processes, XB and XT.
- The two edges differ by a phase lag of 1.22 rad (70°).
- There are a skewness warp, a double-pulsing parameter and a posterior chink area.

*Amplitude follows transglottal pressure.* The vibration amplitude is 0.0011·√Ptrans cm (≈0.1 cm
at 8 cmH₂O) × a relative amplitude RA (`GeometricGlottis.cpp:255–280`). Ptrans is the lung
pressure minus a 25 Hz low-passed supraglottal pressure (`:144`). So the pulses weaken smoothly as
oral pressure builds.

*There is no gate.*

- Abduction is added to the dynamic displacement before clipping at contact (`:337`). An abducted
  glottis keeps vibrating on top of an open DC area, which is breathy phonation.
- Vibration stops only through RA (set to 0 by the voiceless shapes) or through Ptrans falling to
  0.

*The glottal shapes* (`JD3.speaker:1578–1695`) [code], with static areas computed from the
area formula at a 1.6 cm fold length:

| shape | rest displacement XB / XT | chink | RA (vibration) | static area (computed) |
|---|---|---|---|---|
| modal | 0.010 / 0.020 cm | 0.05 cm² | 1 | ≈0.07–0.08 cm² |
| voiced fricative | 0.050 / 0.050 cm | 0.10 cm² | 1 | ≈0.18 cm², still vibrating |
| voiceless fricative and plosive | 0.10 / 0.10 cm | 0.10 cm² | 0 | ≈0.26 cm² |
| /h/ | 0.045 cm | 0.10 cm² | 0.002 | ≈0.17 cm² |

Every glottal parameter passes through the same 5th-order dynamics with τ = 12 ms.

*Other fold models.*

- **The triangular glottis** (Birkholz, Kröger & Neuschaefer-Rube 2011, Interspeech) [full];
  `TriangularGlottis.cpp:174–366` [code].
  - It is a self-oscillating two-mass model whose rest shape is a triangle.
  - Its closure becomes more gradual as the folds abduct, which gives "the continuum of voice
    qualities from pressed over normal to breathy".
  - Whether it oscillates follows from the mechanics, not from a gate.
- **Perceptual tuning of the geometric model** (Birkholz, Drechsel & Stone 2019) [full].
  - The most natural male voice had rest displacements of 0.3 / 0.6 mm (slightly divergent), a
    phase lag of 70°, no skew and a little double pulsing.
  - Listeners preferred slightly abducted folds.
- **Soft contacting and de-contacting** (Zhang, Huang & Birkholz 2026, Interspeech) [full]. A newer
  contact model that closes the glottis more gradually during partial contact was preferred in
  58.1 % of A/B pairs (MOS 3.02 against 2.68).
- All three papers measured naturalness, not intelligibility.

*Voicing in stops (2013 paper) [full].* VOTs of voiced stops were set by the degree of abduction.
The measured VOTs were /b/ 18, /d/ 22 and /g/ 38 ms, with /g/ produced breathier (~0.25 mm). The
paper suggests that /g/'s better recognition "could in fact be brought forward by its clearly
higher VOT".

*The source spectrum.*

- Birkholz & Drechsel 2021 (Speech Communication) [full]:
  - Adding the piriform fossae cut 2.5–5 kHz by up to 10 dB, and listeners preferred the voice
    without them.
  - The synthetic voice source in general "rolled off too fast with increasing frequency".
  - A more adducted, "more tense" voice brought 2–5 kHz closer to natural speech.
  - Even so, the dev code keeps the fossae on by default (`TdsModel.cpp:62`).
- Ngo, Akagi & Birkholz 2020 (Speech Communication) [full]:
  - Switching VTL from modal to pressed phonation flattened the spectral tilt from −9.23 to
    −3.55 dB/oct. That change also doubled the lung pressure, so the two are confounded.
  - Of the four features tested, pressed phonation improved word recognition in noise the most.
    It was ahead of higher f0, higher F1/F2, and longer vowels (which slightly hurt in pink
    noise: 71.4 % → 69.6 %).

*Lungs.* A pressure source drives the bottom of a 23-section trachea (`Synthesizer.cpp:229–231`;
`include/.../Tube.h:68`) [code].

**CHIMERA.**

- **The fold model** is a parametric area waveform (`sources/glottis.rs:148–246`).
  - Pulse amplitude = 0.17 cm² × (0.45 + 0.75·effort), where effort comes from lung pressure, not
    transglottal pressure (`glottis.rs:214–216`; `human_voice.rs:497–499`).
  - Open quotient 0.564, closure sharpness 0.22, chink 0.0125 cm² (§14.1).
- **The voicing gate** is smoothstep(2–4 cmH₂O of Δp) × (1 − smoothstep(0.08–0.22 cm² of
  abduction)) × (1 − closure), with no hysteresis (`glottis.rs:171–176`).
- **Abduction targets** (`planner.rs:354–370`):
  - voiceless fricative 0.30, aspirated stop 0.36, unaspirated stop 0.22 cm²;
  - /h/ 0.33, voiced fricative 0.035 (strength 3), exhale 0.22 cm².
  - The blend min(1, w/2) saturates (`human_voice.rs:441–443`).
- **The lungs** are a fixed-pressure node behind 8 dyn·s/cm⁵ (`human_airway.rs:121`).

**Difference.**

1. **Amplitude.** CHIMERA's pulse area ignores the build-up of oral pressure until the gate cuts in.
   - VTL's shrinks as √Ptrans. Computed: from 7.7 to 3 cmH₂O the area amplitude falls ×0.62.
     Since flow goes as A·√Δp, that is about −8 dB in pulse flow.
   - In CHIMERA the same drop moves only the flow through a full-size area until Δp reaches the
     4 cmH₂O fade.
2. **The voiced-fricative posture.** VTL's is ~5× more open than CHIMERA's and still vibrating.
   The probe found what CHIMERA's posture does:
   - /ð/ holds 0.195 cm² with only 0.56 cmH₂O behind it;
   - /z/ is fully voiced with 0.8–1.9 cmH₂O;
   - "A voiced fricative in the model builds almost no oral pressure, so it voices fully and barely
     hisses" (`log.md:2257–2261, 2283–2286`).

   A half-open glottis passes more air, which builds oral pressure and frication and lowers
   Ptrans. Its non-closing pulses also carry less harmonic energy.
3. **Gate against no gate.** CHIMERA's voicing switches over a narrow window. VTL's fades, which
   matches real-voice gap 4 (`docs/deep-dive/real-voice.md:449–457`).
4. **The source spectrum.** Measured, CHIMERA's male vowels are −19.7 dB at 1–2 kHz against the
   speakers' −10.65, and −26.4 at 2–4 kHz against −18.6. H1−H2 is +0.7 dB against −4.0
   (`log.md:2255–2258`). That is a soft-closing, breathy-sounding source, the very fault VTL found
   in its own source.

**Clarity cost.**

- **High for voiced fricatives.** These are the largest scored level term (ð 4.08) and Whisper's
  "dropped fricatives" (54: z 24, ð 12, v 5).
- **Moderate for vowel presence.** It is a diagnostic, not scored, and the owner preferred the
  darker voice once (`docs/speech-comparison.md:126–131`). Even so, the VTL group's own data link a
  flatter tilt to better recognition.

### 1.5 Noise sources (frication, bursts, aspiration)

**VTL, current code** (`TdsModel.cpp:1201–1880`) [code].

*Where the sources are.*

- **The glottis** always has an aspiration source, 1.5 cm above the glottis.
  - Its gain is 1e-6·10^(AS/20). AS is −10 dB in every JD3 shape. Its spectrum is flat, with a
    10 kHz cutoff.
- **Constrictions** are found as the narrowest tongue section, a second tongue constriction if one
  exists, and the narrowest lower-lip section.
  - Each must be under 1 cm². Its extent is every neighbouring section within +0.2 cm².
- **Each constriction gets one source, placed at its obstacle** (`:1286–1300`, `:1640–1700`):
  - at the upper incisors if the jet leaves less than 2 cm behind them (/s ʃ ç/ and the /t d/
    bursts);
  - otherwise in the middle of the section downstream (/x k/, a "wall source");
  - in the middle of the constriction for the lips.

  The source is split between the two section ends by position.

*How loud.*

- Amplitude = G·|v|³·√A, citing "Stevens' book" (`:1628–1632`).
- v is the flow low-passed at 500 Hz, divided by the area (`:42`, `:2237–2247`). Only outgoing flow
  counts.
- There is no critical Reynolds number and no saturation.

*Spectrum and gain by place.* Each source is white noise through a 2nd-order Butterworth low-pass
(Q 0.707), with no high-pass (`:1838`).

| constriction | gain | cutoff |
|---|---|---|
| teeth source, fricative (tongue sides raised) | 1.0e-6 | 5 kHz |
| teeth source, plosive burst | 0.8e-6 | 1.5 kHz |
| labiodental (area at the teeth < ~0.15 cm²) | 2e-6 | 8 kHz |
| bilabial | 0.5e-6 | 500 Hz |
| velar or uvular wall source | 0.4e-6 | 800 Hz |

- The teeth source moves between its fricative and burst settings with the tongue-tip side
  elevation (`:1555–1585`). Labiodental and bilabial are told apart by the area at the teeth
  (`:1510–1530`).
- The gain is multiplied by (1000/fc)^1.5 "due to the radiation characteristics" (`:1840–1856`).
  So a source's radiated level does not depend on its cutoff.

*Area window and envelope.*

- The gain is flat from 0.15 to 0.5 cm² and fades linearly to 0 at 1.0 cm² (`:1600–1610`).
- It also fades linearly to 0 below 0.15 cm², "to prevent noise artifacts during implosions",
  which the code says does not touch release bursts (`:1612–1625`).
- The amplitude rises with a 3 ms time constant on its square root and falls instantly
  (`:1769–1800`).

**VTL's papers on its noise model.**

- **2006** (Birkholz & Jackèl) [full]. Fricatives were fitted with one monopole in the constriction
  (low-pass 1100 Hz) and one dipole at the obstacle (2.5–6 kHz). The monopoles' "contribution to
  the fricative spectra is small compared to the dipole sources". That model used an Re² − Re_c²
  law.
- **2014** (ISSP) [full]. This version already had one source per constriction, at the teeth for
  jets within 2 cm. The cutoff was 0.15·v/d, first order, with relative gains of 10 at the
  obstacle, 5 for a wall source and 3 for labiodental.
- **Since then** the monopole at the constriction and the Re threshold are gone. The current code
  is Stevens' law with one source.

**CHIMERA** (`voice/human_airway.rs:281–342`, `airway/network.rs:1097–1132`). There are up to
three series pressure sources:

- **Glottal**, 3.2e-6, band 300–3500 Hz (`:286`).
- **The narrowest section**, 2.2e-6, band 350–2600 Hz. It fades in from 0.9 to 0.35 cm² (`:301`,
  `:322`) and is injected 0.9 cm downstream.
- **Teeth**, 3.0e-6, high-pass 1200 Hz.
  - Its low-pass is 5000·√(0.2/A) Hz, bounded at A = 0.085 cm² (`:334`).
  - Its weight is smooth(0.15–0.5 cm behind the teeth) × (1 − smooth(2.6–4.0 cm)) × (1 −
    smooth(0.2–0.5 cm² of area)) (`:326–327`).

All three share one amplitude law and one filter:

- Amplitude = gain·(Re² − 1800²)/(1 + x/sat), with saturation at Re 12 000 (`network.rs:1100–1111`).
- The filters are one first-order high-pass and two identical one-pole low-passes in cascade
  (`network.rs:739, 1116–1119`, read). That cascade is −3 dB at 0.64·fc, so the constriction
  source's "2600 Hz" is −3 dB at ~1.7 kHz.
- There is no cutoff compensation and no taper at small areas.

**Difference.**

1. **Sibilants get one source in VTL and two in CHIMERA.**
   - Every CHIMERA /s z ʃ/ also excites the tract from the constriction exit, with noise
     concentrated below ~2 kHz.
   - Computed from the source filter times a +6 dB/oct radiation slope over 1–10 kHz, with no
     tract: the teeth source alone has a centroid near 6.6 kHz for /s/; the constriction source
     near 4.6 kHz.
   - VTL dropped this second source after finding it contributes little.
2. **CHIMERA's /ʃ/ noise is cut three ways that VTL's is not.** All three are computed:
   - Its teeth low-pass (5 kHz against 7.67 kHz for /s/) radiates ~3.6 dB less noise at equal
     amplitude, uncompensated.
   - The jet weight starts fading at 0.2 cm², exactly the /ʃ/ target. A /ʃ/ at 0.3 cm² loses
     2.6 dB, at 0.35 cm² 6 dB. VTL is flat to 0.5 cm².
   - At 4–6 cmH₂O across the constriction, saturation costs about 3–4.5 dB at 0.2 cm² and
     1.4–2.1 dB at /s/'s 0.085.

   One factor works the other way: CHIMERA's Re² law grows with area faster than VTL's √A at the
   same velocity. So the net imbalance has to be measured, not assumed.
3. **Bursts.** VTL makes bilabial release noise 4× weaker than /f/ and low-passed at 500 Hz, and
   mutes noise below 0.15 cm². CHIMERA releases /b p/ through the same constriction source as /f/.
   That may explain burst b −8.97 / −1.45 dB (1.28) and burst p −13.9 / −9.9 (1.21). This is
   inferred: the burst may be the pressure transient rather than the noise.

**Clarity cost.** High.

- The scored judge terms: centroid s (2.15), centroid z (2.49), level ʃ (2.55), level tʃ (2.14).
- Whisper misses /tʃ/ 18 of 30 times and /z/ 41 of 95 times.
- The tuning agent's current picks include the teeth-source gain (`log.md:2320–2323`), so
  coordinate with it.

### 1.6 Tube acoustics and losses

**VTL** [code]. A time-domain transmission line runs at 44.1 kHz with a θ = 0.505 implicit scheme,
solved as a matrix each step (`TdsModel.cpp:35`, `:1961–2500`).

*Sections* (`include/.../Tube.h:68–75`):

| part | sections |
|---|---|
| trachea | 23 × 1 cm |
| glottis | 2 |
| pharynx | 16 |
| mouth | 24 |
| nose | 19 |
| sinuses | 4 Helmholtz resonators |
| piriform fossa | 5 |

*Losses.*

- **Viscous.** A laminar elliptic-duct resistance. The larger half-axis is held at 0.6 cm or more,
  so narrow sections become slit-like (`:960–975`).
- **Kinetic.** Lossless Bernoulli flow at contractions and full loss of the kinetic pressure at
  expansions (`:1026–1055`). Birkholz & Häsner 2024 (Interspeech) [full] fitted physical replicas
  best with 29 % recovery at expansions and viscous loss ∝ A^−2.9.
- **Glottal entrance coefficient:** 1.0 (`:1089`).

*Walls and coupling.*

- Soft walls: 2.4 g/cm², 5000 dyn·s/cm³, 1e5 dyn/cm³ (`Tube.cpp:43–53`).
  - The code gives a higher resistance than the literature because "otherwise F1 increases very
    strongly".
  - The stiffness "mainly controls how long a voicebar lasts".
- Skin radiation near the glottis is on, transvelar coupling off (`TdsModel.cpp:61–64`).

*Area-rate limiter.* The fourth root of each section's area may change by at most 0.001 per
sample when closing and 0.002 when opening (`:660–720`). The comment on opening: "Must be > 0.001
... because otherwise the burst will get too strong in /utu/". Computed at 44.1 kHz:

| change | VTL |
|---|---|
| close 0.4 cm² → seal | 16 ms |
| close 1.0 → 0.4 cm² | 4.6 ms |
| open seal → 0.4 cm² | 7.9 ms |

**CHIMERA.**

- An explicit FDTD transmission line at 96 kHz, 18 + 18 sections (`airway/network.rs:769–1090`).
- Viscous resistance at a fixed 700 Hz reference. Borda–Carnot expansion loss plus 10 %
  contraction loss (`:914–930`).
- Walls 1.5 / 1600 / 3e5 (`physics.rs:28–32`), with a quarter of the wall flow radiated.
- Slew limits allow at least 27 ms from 0.4 cm² to a seal and at least 8 ms from 1.0 to 0.4 cm²
  (`voice/human_airway.rs:197–256`).

**Difference.**

- VTL's closures finish about 2× faster in their last 0.4 cm², and its openings are twice its
  closing rate.
- CHIMERA's walls are 3× stiffer, which by VTL's comment shortens voice bars.
- The two loss models are close.

**Clarity cost.**

- Low to moderate. The nasals run long (n 0.77 / 1.07, cost 1.99; ŋ 1.04 / 1.32, 1.77), with the
  slow last 0.4 cm² a candidate (real-voice gap 5). Inferred.
- Faster slewing alone made the rap vowels quieter by 1.0–1.3 dB (`slew3`), so it needs the leads
  re-fitted.

### 1.7 Radiation and output

**VTL** [code].

- Radiation impedance is Flanagan's parallel R–L load (`TdsModel.cpp:2042–2065`).
- The output is d/dt of the summed mouth, nostril and skin flow, then an 8th-order Chebyshev
  low-pass at 12 kHz (`Synthesizer.cpp:40, 245–251`; `include/.../Constants.h:43–44`).

**CHIMERA.**

- The same R–L load. The output is d/dt of lip, nose and wall flow (`network.rs:1064–1091`).
- Then a polyphase decimator, a DC blocker and a limiter (`human_voice.rs:368–395`).

**Difference.** Essentially none for clarity. VTL band-limits at 12 kHz, where CHIMERA passes
~22 kHz; the male synth already has too much energy at 4–8 kHz (−29.6 against −35.0 dB).

**Clarity cost.** None expected.

---

## Ideas ranked for talking-speed clarity

Each idea is a change in our own words, physically motivated, and testable with the existing
judges: TSP, Whisper WER and the singer guard. Sizes include re-blessing the goldens. "Judge term"
means the `out/tsp/best/report.md` male term the idea should move.

| # | idea | judge terms it should move | size | risk |
|---|---|---|---|---|
| 1 | Sibilant noise only at the teeth | centroid s (2.15), centroid z (2.49) | hours | ʃ centroid already high |
| 2 | VTL-style level law for the teeth source | level ʃ (2.55), level tʃ (2.14) | hours | bursts louder |
| 3 | Aerodynamic voicing for voiced obstruents | level ð (4.08), level v (1.74), voiced ð/z | 1 day | z→s, d→t voicing confusions |
| 4 | Coronals own the lateral channel | level ð, s/z centroids | hours | low (already experiment 37) |
| 5 | Affricate = stop + a real fricative, longer /dʒ/ | duration dʒ (4.23), duration tʃ (1.41), level tʃ | hours | low |
| 6 | Place-dependent VOT inside the stop, closure ≥ half | duration k (3.53), p (1.03), t (0.83) | hours | aspiration eats vowels |
| 7 | Glottal gestures graded by duration | vowel voicing, Whisper vowels and voicing | 1–2 days | experiment 14 precedent |
| 8 | Vowel-relative consonant secondary targets | F2 u (6.42), F2 ɑ (3.18), F2 æ (2.32), F1 ɔ (2.65) | 1 day | place cues |
| 9 | Flatter source tilt (fossae A/B, tenser closure) | vowel band 1–2k (3.70), 2–4k (1.86), H1−H2 | hours–days | owner's taste, unscored |
| 10 | Bilabial and labiodental lip noise, small-area taper | burst b (1.28), burst p (1.21), level p (1.08) | hours | weaker /p/ cue |
| 11 | Fourth-root area limiter, opening faster than closing | duration n (1.99), ŋ (1.77) | 1 day | `slew3` lowered vowels |
| 12 | Higher-order articulator dynamics | little | days | re-time everything |

### 1. Sibilant noise only at the teeth

- **Change.**
  - When the teeth source has weight (a jet leaving within ~2–3 cm of the incisors), fade the
    narrowest-section source by the same weight.
  - Re-balance the teeth gain to keep the level.
  - Keep the constriction source for non-sibilants (/f θ x/ and stop releases).
- **Why.**
  - In VTL, and in its 2006 fits, the noise of /s ʃ/ is the jet hitting the incisors. Noise at the
    constriction exit was found to contribute little.
  - CHIMERA's exit source, −3 dB at ~1.7 kHz, puts noise where the /s/ spectrum should be quiet.
    It pulls the 1–10 kHz centroid down; computed, its source-plus-radiation centroid is ~4.6 kHz
    against ~6.6 kHz for the teeth source.
- **Judge terms.** Centroid s 4424 → toward 5725 Hz and centroid z 4059 → toward 5117 Hz. It may
  also help Whisper's dropped /z/ (24) and /s/ (8).
- **Size.** 2–4 hours.
- **Risk.**
  - The male /ʃ/ centroid is already 330 Hz high (3461 against 3134). Losing its low band would
    raise it further, so expect to lower ʃ's teeth low-pass or rely on its front cavity.
  - The /ʃ/ level would also drop unless the gain is re-balanced. Pair this with idea 2.
  - The singer guard may notice sung sibilants.

### 2. A VTL-style level law for the teeth (obstacle) source

- **Change.** Three parts, each testable alone:
  - (a) drop the Re saturation, or move it far above speech Reynolds numbers;
  - (b) widen the area window so the teeth weight stays full up to ~0.5 cm² and fades to 0 by
    ~1.0 cm²;
  - (c) scale each source's gain by about (f_ref/fc)^1.5, so a lower cutoff does not lower the
    radiated level.

  Optionally, try Stevens' |v|³·√A in place of Re² − Re_c².
- **Why.** In this model /ʃ/ is wider, lower-cut and higher in Reynolds number than /s/, and each of
  those currently costs it level (§1.5, about 2–6 dB each, computed). VTL's law treats them
  neutrally.
- **Judge terms.**
  - Level ʃ −14.7 → toward −8.9 dB; level tʃ −15.6 → toward −10.9 dB.
  - Whisper's /tʃ/ misses (18 of 30; class 4: birch→bird, chopped→shopped).
- **Size.** Hours.
- **Risk.**
  - Stop bursts can get louder, because the window and saturation also tamed releases. Add VTL's
    linear fade below ~0.15 cm² (idea 10) at the same time.
  - /s/ may get too loud and need its own gain.

### 3. Aerodynamic voicing for voiced obstruents

- **Change.**
  - (a) Scale the vibratory area amplitude by √(Δp_sm/Δp_ref), with Δp_ref ≈ 7.7 cmH₂O, the
    open-vowel value. Do this on top of, or in place of, the hard pressure gate; the
    supraglottal-pressure low-pass already exists.
  - (b) Give voiced fricatives a partly abducted posture that still vibrates: roughly 0.10–0.15 cm²
    static, against 0.035 now.

  CHIMERA's abduction gate fades voicing from 0.08 cm² and stops it at 0.22 cm². So (b) needs
  either a target near 0.10–0.12 or the gate's window moved up for this gesture. VTL itself has no
  abduction gate.
- **Why.**
  - Real voiced fricatives trade voicing for frication as oral pressure builds. VTL does this
    through its √Ptrans amplitude and a half-open fricative glottis.
  - CHIMERA's /ð z/ are fully voiced with almost no oral pressure, so they read as approximants.
- **Judge terms.**
  - Level ð −10.4 → toward −21.0 dB (4.08, the largest level cost); level v −10.3 → toward −19.4.
  - Voiced ð 0.63 → 0.35, voiced z 0.76 → 0.34, voiced w 0.91 → 0.55.
  - Centroid z, through more frication.
  - Whisper's dropped fricatives (54).
- **Size.** About a day, including the gate interaction.
- **Risk.**
  - Whisper's voicing confusions (d→t 15, z→s 11) could grow if the fricatives devoice too far.
  - Voiced-stop voice bars shorten.
  - Vowels whose transglottal pressure is already low at speed (dt: median 4.5 cmH₂O) lose about
    2–4 dB more of their pulse amplitude (computed from the √ law).
  - Check the singer guard and the female voice.

### 4. Coronals own the lateral channel

- **Change.** Every tongue-tip consonant's dominant gesture also drives the lateral key to sealed.
  This is VTL's rule: tip consonants own TS3.
- **Why.** After /l/ the side channel stays 0.27–0.35 cm² open through the next /ð z s d/.
- **Judge terms.** Level ð, the s/z centroids and levels, /d/ closure; Whisper class 9 (19 errors).
- **Size.** Hours.
- **Risk.** Low. The tuning agent already picked this as experiment 37 (`log.md:2320`). VTL
  supports the direction; don't duplicate the work.

### 5. Affricates as a stop plus a real fricative

- **Change.**
  - Plan /tʃ dʒ/ as a closure taking ~0.33–0.4 of the segment, then a full fricative taking the
    rest: its own constriction target, held, with the fricative glottal posture (voiceless for
    /tʃ/, idea 3's posture for /dʒ/).
  - Raise /dʒ/'s planned duration. CHIMERA plans Klatt's 50/30 ms, which the speakers exceed by
    ~2.7× in relative terms. This half is a table change, not VTL.
- **Why.** VTL gives the frication most of the affricate, and the TSP probe finds /tʃ/'s middle
  half 18 dB down.
- **Judge terms.** Duration dʒ 0.48 → toward 1.28 (4.23, the largest cost), duration tʃ 1.20 →
  toward 1.52 (1.41), level tʃ; Whisper class 4 (~33 errors).
- **Size.** Hours.
- **Risk.** Low. The neighbouring vowels shorten in tight slots.

### 6. Place-dependent VOT inside the stop, closure at least half

- **Change.**
  - Set VOT by place, as VTL does from Klatt (1975): p 47, t 50, k 70 ms.
  - Cut it to 10–20 ms before a fricative.
  - Count it inside the stop's own segment, with the closure never under half the stop and never
    under 20 ms.
  - Keep the existing squeeze below Klatt minimums.
- **Why.**
  - VOT is a place cue: in VTL's 2013 test the longer-VOT /g/ was recognised ~10 % better.
  - The cap makes VOT shrink automatically with short stops.
  - CHIMERA's VOT is 50 ms for every stop and is counted in the vowel.
- **Judge terms.** Duration k 0.77 → toward 1.22 (3.53), p 0.93 → 1.14 (1.03), t 0.73 → 0.91
  (0.83); Whisper's k→g (10) and p→b (5).
  - Check first whether the forced aligner assigns the synth's aspiration to the stop or to the
    vowel. The judge says it gives release and aspiration to the stop, but the synth /k/ measures
    shorter than planned (0.77 against 0.85).
- **Size.** Hours.
- **Risk.**
  - Longer /k/ aspiration takes voicing from the next vowel. At rap pace, vowels after aspirated
    stops are 8.5 dB down (§15.2). At TSP's ~11–12 phones/s it is milder.
  - Keep the cap.

### 7. Glottal gestures graded by duration

- **Change.**
  - Make each voiceless obstruent's abduction gesture last exactly its segment, shifted earlier by
    the abduction channel's half-rise time.
  - Give abduction its own smooth dynamics (second order is enough), and stop the blend from
    saturating, for example by keeping strength ≤ 2 so min(1, w/2) stays linear.

  Abduction is then about half at both edges and peaks mid-consonant. A short fricative never
  fully opens. In VTL's dynamics that gives 46 / 58 / 77 / 89 % of full abduction for 30 / 40 /
  60 / 80 ms segments (computed).
- **Why.** This is VTL's design, and real-voice gap 1. CHIMERA holds the folds fully open from
  c0 − 35 to c1 + 25–29 ms at any duration.
- **Judge terms.** Whisper's vowel errors and dropped short vowels (ə 26, ɪ 14); the "voiced"
  diagnostics. Not directly a TSP scored term.
- **Size.** 1–2 days.
- **Risk.** Experiment 14 opened fricatives later and lost WER (36.09 → 38.08 %): the fricatives
  went weak or voiced. This idea is different. The opening is centred and graded rather than late.
  Even so, it partly voices fricative edges, so run it after idea 3, whose √Ptrans law also damps
  voicing in a fricative.

### 8. Vowel-relative consonant secondary targets

- **Change.** Compute each consonant's secondary and alveolar-fronting targets from the adjacent
  (following) vowel's own target: target = v + d·(c − v), with a small per-key dominance d. Fixed
  values stop. Optionally, also stop secondary gestures from ramping in across the vowel; ramp
  them only over its last third.
- **Why.**
  - VTL never averages vowel and consonant on one parameter. Its consonants' non-primary
    parameters come from the context vowel.
  - CHIMERA's fixed secondary targets pull every nearby vowel toward one place.
- **Judge terms.** The formant diagnostics (F2 u, ɑ, æ; F1 ɔ) and Whisper's vowel-identity class
  (113: i→ɪ, eɪ→ɪ, ɔ→ɑ). Indirectly, vowel level (`protect` +1.1 to +3.0 dB).
- **Size.** About a day.
- **Risk.** Weaker consonant place cues: velar jaw-raising helps the seal. The transitions into
  closure change, and experiment 32 showed transitions matter.

### 9. A flatter source tilt for vowel presence

- **Change.** Two cheap A/B tests, then one larger change:
  - (a) remove the piriform fossae;
  - (b) a tenser default: smaller open quotient, a sharper closing (closure_sharpness above 0.22)
    and a smaller chink;
  - (c) if those help, the larger change: model the glottis as two edges with a 50–70° phase lag
    and take the smaller area. That gives an abrupt closure from geometry.
- **Why.** VTL's group found that its synthetic source rolled off too fast, that the fossae cut
  2.5–5 kHz by up to 10 dB, and that tenser or pressed phonation flattened the tilt and gave the
  largest gain in recognition in noise.
- **Judge terms.** Vowel band 1–2k −19.7 → −10.7 dB (3.70), 2–4k −26.4 → −18.6 (1.86), H1−H2
  +0.7 → −4.0; perhaps Whisper's vowel errors.
- **Size.** Hours for (a) and (b); days for (c).
- **Risk.**
  - These terms are unscored diagnostics, and the owner once preferred the darker voice 7 to 0.
  - The male synth already has too much energy at 4–8 kHz.
  - Check the singer guard.

### 10. Bilabial and labiodental lip noise, with a small-area taper

- **Change.**
  - Give lip-to-lip releases a weaker, low-passed noise. Give a lip-to-teeth constriction (/f v/)
    the brighter one, chosen by the area at the incisors.
  - Fade all frication gain linearly to 0 below ~0.15 cm².
  - Limit the noise envelope's rise to ~3 ms.
- **Why.** These are VTL's rules for implosions and bursts.
- **Judge terms.** Burst b −1.45 → −8.97 dB (1.28), burst p −9.9 → −13.9 (1.21), level p (1.08),
  spectrum b (3.77).
- **Size.** Hours.
- **Risk.** A weaker /p/ release cue (p→b 5); the female /t k/ bursts are already 9 dB weak.
  Inferred: the excess burst may be the pressure transient, not the noise.

### 11. A fourth-root area limiter

- **Change.**
  - Limit the per-sample change of A^(1/4), not A, as VTL does.
  - Let opening run about twice as fast as closing.
  - Re-fit the class leads so acoustic closures still land on the plan.
- **Why.** This closes the last 0.4 cm² in ~16 ms, not 27, and opens faster than it closes.
  Real-voice gap 5 asks for the same.
- **Judge terms.** Duration n 1.07 → 0.77 (1.99) and ŋ 1.32 → 1.04 (1.77), if slow sealing and
  release lengthen the murmur (inferred).
- **Size.** About a day.
- **Risk.** `slew3` alone lowered vowels by 1.0–1.3 dB, and clicks may appear.

### 12. Higher-order articulator dynamics (not recommended now)

- **Change.** A 5th-order target approximation with full state carried across targets. It needs
  every lead re-timed, or found per token by forward search.
- **Why low.** Articulator speed explains ~0.3 dB of fv's vowel loss, and VTL's own listening tests
  found halving the time constants inaudible.
- **Size.** Days.

**Rap only, not talking speed.** VTL keeps one lung-pressure gesture for a whole utterance and
never abducts the folds at short gaps. For rap, merge breath groups across gaps under ~0.3 s and
drop the exhale abduction there (`bridge`: +0.7 to +3.3 dB).

---

## Would running VTL on our test sentences be a useful reference?

**License.** GPL-3.0 (the `LICENSE` file; source headers say "version 3 ... or any later
version").

- Running it locally to make reference audio is fine.
- No VTL code, and not its speaker file (`resources/JD3.speaker`, part of the GPL repo), may go
  into CHIMERA, which is MIT (`LICENSE`, `Cargo.toml:8`).
- Re-implementing ideas in our own words from the papers is fine. That is what this note proposes.

**Feasibility on macOS.**

- The backend is portable C++ with CMake. Its README lists Windows, Linux and macOS builds. I did
  not build it.
- The C API takes a segment file and returns audio:
  - `vtlInitialize(speaker)` (`include/VocalTractLabApi/VocalTractLabApi.h:63`);
  - `vtlSegmentSequenceToGesturalScore` (`:494`);
  - `vtlGesturalScoreToAudio` (`:521`).

  The output is 44.1 kHz. The example `examples/apfelsine.seg` shows the format.
- A Python package exists: `VocalTractLab` 0.5.8 (2025-04-08) on PyPI, GPL-3.0, marked alpha. Its
  only listed wheel is pure Python, so the native backend presumably builds from source
  (inferred).
- Expected effort: about 1 hour to build, if CMake behaves on arm64, plus ~2 hours to write segment
  files from the TSP speakers' MFA durations. A few tens of MB on `/Volumes/hd`.

**Limits that decide its value.**

- **It is German only.** The SAMPA inventory (`Sampa.cpp:27–43`) has no /w/ and no English /ɹ/,
  which maps to a uvular fricative. It has no /æ ʌ ɑ ɝ/.
- **The speaker is one German man.** His vowel targets are German.
- **So Whisper WER on English sentences would mostly measure accent,** not mechanism. VTL is not an
  intelligibility ceiling either. Krug, Stone & Birkholz 2021 (SSW 11) [full] put VTL-TTS and VTL
  re-synthesis among the five weaker systems under ASR:
  - that group's median WERs were 0.04–0.14 and its means 0.17–0.25;
  - VTL re-synthesis with natural durations did worse than its TTS with "longer and more uniform"
    durations;
  - the 2010 VTL plosive test had 20–59 % errors for /p t k/ [full].

**Verdict.** It is not useful as a WER reference. It could be a useful mechanism reference for a
few judge terms, at about half a day. Feed VTL the English-compatible consonants it has
(/s z ʃ f v ð θ p t k b d g m n l/ in /a/ or /i/ contexts), using the speakers' durations, then run
our TSP level, centroid, voiced and burst measures on the output. That would show:

- whether one teeth source with Stevens' law gives ~5.7 kHz /s/ centroids and a /ʃ/ level near the
  speakers' (ideas 1–2);
- whether a half-open vibrating glottis gives /ð v/ near −20 dB and voiced shares near 0.35
  (idea 3).

Do it only if those ideas stall in CHIMERA. Their own A/B tests are cheaper.

---

## Sources

### Opened in full

- **VTL backend source**, `TUD-STKS/VocalTractLabBackend-dev` at `df30392`: `GesturalScore.cpp`,
  `GeometricGlottis.cpp`, `TriangularGlottis.cpp`, `TdsModel.cpp`, `Tube.cpp`, `Synthesizer.cpp`,
  `Sampa.cpp`, `include/…/Tube.h`, `include/…/Constants.h`, `include/…/GesturalScore.h`,
  `include/VocalTractLabApi/VocalTractLabApi.h`, `resources/JD3.speaker`, `README.md`, `LICENSE`.
  Cloned to `/Volumes/hd/tmp/vtl-study/src/backend`.
- **Birkholz, Kröger & Neuschaefer-Rube (2011).** Model-based reproduction of articulatory
  trajectories for consonant-vowel sequences. IEEE TASLP 19(5). Preprint,
  `/Volumes/hd/tmp/real-voice/pdf/birkholz2011_ieee.pdf`.
- **Birkholz & Hoole (2012).** Intrinsic velocity differences of lip and jaw movements: preliminary
  results. Interspeech. `/Volumes/hd/tmp/real-voice/pdf/birkholz2012_ema.pdf`.
- **Birkholz (2013).** Modeling consonant-vowel coarticulation for articulatory speech synthesis.
  PLoS ONE 8(4) e60603. journals.plos.org (printable PDF).
- **Birkholz (2007).** Control of an articulatory speech synthesizer based on dynamic approximation
  of spatial articulatory targets. Interspeech. vocaltractlab.de/publications.
- **Birkholz, Kröger & Neuschaefer-Rube (2010).** Articulatory synthesis and perception of
  plosive-vowel syllables with virtual consonant targets. Interspeech. vocaltractlab.de.
- **Birkholz, Kröger & Neuschaefer-Rube (2011).** Synthesis of breathy, normal, and pressed
  phonation using a two-mass model with a triangular glottis. Interspeech. vocaltractlab.de.
- **Birkholz, Drechsel & Stone (2019).** Perceptual optimization of an enhanced geometric vocal
  fold model for articulatory speech synthesis. Interspeech. vocaltractlab.de.
- **Zhang, Huang & Birkholz (2026).** Improved modeling of vocal fold contacting and de-contacting
  in a geometric vocal fold model. Interspeech. vocaltractlab.de.
- **Birkholz & Jackèl (2006).** Noise sources and area functions for the synthesis of fricative
  consonants. Rostocker Informatik Berichte 30. vocaltractlab.de.
- **Birkholz (2014).** Enhanced area functions for noise source modeling in the vocal tract. ISSP.
  vocaltractlab.de.
- **Birkholz & Häsner (2024).** Measurement and simulation of pressure losses due to airflow in
  vocal tract models. Interspeech. vocaltractlab.de.
- **Birkholz & Drechsel (2021).** Effects of the piriform fossae, transvelar acoustic coupling, and
  laryngeal wall vibration on the naturalness of articulatory speech synthesis. Speech
  Communication 132. Preprint, vocaltractlab.de.
- **Birkholz, Martin, Xu, Scherbaum & Neuschaefer-Rube (2017).** Manipulation of the prosodic
  features of vocal tract length, nasality and articulatory precision using articulatory synthesis.
  Computer Speech & Language 41. UCL preprint.
- **Ngo, Akagi & Birkholz (2020).** Effect of articulatory and acoustic features on the
  intelligibility of speech in noise: an articulatory synthesis study. Speech Communication 117.
  JAIST author version.
- **Krug, Stone & Birkholz (2021).** Intelligibility and naturalness of articulatory synthesis with
  VocalTractLab compared to established speech synthesis technologies. SSW 11. vocaltractlab.de.
- **Xu, Birkholz & Xu (2019).** Coarticulation as synchronized dimension-specific sequential target
  approximation: an articulatory synthesis simulation. ICPhS. vocaltractlab.de.
- **Web pages:** the vocaltractlab.de publication list and the PyPI page for `VocalTractLab`.

### Abstract or summary only

- **Kleiner, Mooshammer, Belz & Birkholz (2026).** Timing of tongue body movements in V1-C-V2
  sequences with respect to segment boundaries in German. JASA 159(5). OpenAlex record, closed
  access.

### Not opened (titles from the publication list; not relied on)

- Birkholz, Jackèl & Kröger 2007, IEEE TASLP (turbulence losses).
- Birkholz & Häsner 2026, IEEE Access (viscous and kinetic losses).
- Birkholz, Blandin & Kürbis 2023, JASA (bandwidths).
- Birkholz & Pape 2019, Speech Communication (two-mass entrance loss).
- The VTL 2.x manual.
- van Niekerk et al. 2020, Interspeech. Downloaded and skimmed; not used.

PDFs and their text conversions are in `/Volumes/hd/tmp/vtl-study/pdf/` and
`/Volumes/hd/tmp/vtl-study/txt/`.

---

## After the study: what batch 4 found (2026-11-08)

- **Idea 1 (sibilant noise only at the teeth)** was probed on the batch 4 branch but not judged: the
  /s/ centroid barely moved (4397 → 4385 Hz) and /ʃ/ fell 150 Hz. The second source is not what
  holds the centroids down. See `docs/hill-climb/log.md`, "## Batch 4".
- **The voiced-fricative half of idea 3** became experiment 39 (the voiced fricatives' glottal opening
  0.035 → 0.09 cm²): TSP training 1.342 → 1.246 with level ð male 4.08 → 1.95, but reverted on two
  /g/ terms because the opening starts 15 ms early and devoices a /g/ before /z/. Next lead: the same
  opening, starting at the fricative.
