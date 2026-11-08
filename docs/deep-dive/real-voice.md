# The real voice, compared with CHIMERA

What the human voice does, subsystem by subsystem, as deep as the engine models it, and where the
engine differs. Written 2026-11-08 for the fast-rap problem: at ~9 syllables/s the male voice is
unintelligible, and the measured cause is the vowels (−4.8 dB against the same lines three times
slower), not the consonants (`docs/hill-climb/log.md`, "Rap contrast", lines 1882–2020).

How to read the citations:

- **[full]**: I opened the full text at the URL given.
- **[abstract]**: I read only the abstract (the publisher page or the OpenAlex record,
  `https://api.openalex.org/works?filter=title.search:<title>`). Numbers from an abstract are
  marked as such.
- **[via X]**: the work is quoted or summarised inside paper X, which I opened. I did not open it
  myself.

"Model" lines give `file:line` in this repo. Timelines marked *computed* are my arithmetic from
the code (cosine ramps, the gesture blend and the voicing gate). They are not measurements of
rendered audio.

---

## 1. Vocal folds

### What the real folds do

- **Self-oscillation.** The two-mass model makes the folds two stiffness-coupled masses driven by
  Bernoulli flow. It reproduces the main features of human phonation: F0 rises 2–3 Hz per cmH₂O
  of subglottal pressure, and the *rest (phonation-neutral) area* "is shown to be a critical factor
  in establishing self-oscillation" (Ishizaka & Flanagan 1972, *Bell Syst. Tech. J.*,
  doi:10.1002/j.1538-7305.1972.tb02651.x) [abstract]. Story & Titze (1995, *JASA* 97,
  doi:10.1121/1.412234) [abstract] extend it to three masses (two cover masses on a body mass), so
  thyroarytenoid and cricothyroid contraction act on the body and cover stiffness separately.
- **Glottal flow shape.** The LF model fits the flow derivative with four parameters. Its return
  phase (time constant Ta after the main excitation) acts like a first-order low-pass with cutoff
  Fa = 1/(2πTa) (Fant, Liljencrants & Lin 1985, "A four-parameter model of glottal flow",
  STL-QPSR; read via its OpenAlex record, which carries the paper's opening text) [abstract-level].
  The flow pulse is skewed to the right by the inertance of the vocal tract. The maximum flow
  declination rate largely sets the output level. Incomplete closure makes the flow smooth and
  weakens the higher harmonics. The closed quotient rises as the folds are brought together (Zhang
  2016, "Mechanics of human voice production and control", *JASA* 140:2614,
  https://pmc.ncbi.nlm.nih.gov/articles/PMC5412481) [full, first 100k characters].
- **Subglottal pressure in speech.** About 800 Pa (≈ 8 cmH₂O) is "typical of normal speech
  production". Source intensity "is controlled primarily by the subglottal pressure" (Zhang 2016)
  [full]. Stevens' HLsyn teaching example uses ps ≈ 8 cmH₂O, lower at the start and end of the
  utterance (Stevens, Perkell & Shattuck-Hufnagel, MIT 6.542J Lab 16, 2005,
  https://ocw.mit.edu/courses/6-542j-laboratory-on-the-physiology-acoustics-and-perception-of-speech-fall-2005/ae79ce4df174c5ec9f8403f99a0c9837_lab16.pdf)
  [full].
- **Phonation threshold pressure (PTP).**
  - Theory: the threshold falls when the mucosal wave is slower, when the folds are brought closer
    together, and when the glottal convergence is smaller. Vocal-tract inertance lowers it and
    tract resistance raises it (Titze 1988, *JASA* 83, doi:10.1121/1.395910) [abstract]. In the
    body-cover form, Pth = c·B·x₀·k_t / T: it is linear in the glottal half-width x₀ (quoted as
    Eq. 1 in Koenig, Mencl & Lucero 2005, *JASA* 118:2535,
    https://lucerojc.github.io/assets/pdf/KoeEtAlJASA2005.pdf) [full]. Measured on physical models,
    the relation is nonlinear, with a minimum at a small positive width. Viscous losses explain
    the rise at very small widths (Lucero 1996, *JASA*,
    https://lucerojc.github.io/assets/pdf/LucJASA1996a.pdf) [full].
  - Living adults: onset PTP is **4.22 ± 1.02 cmH₂O** in 100 vocally normal adults (Zhuang et al.
    2013, *Ann. Otol. Rhinol. Laryngol.* 122:555, https://pmc.ncbi.nlm.nih.gov/articles/PMC4583103)
    [full].
  - Excised human larynges (n = 9): onset 4.3–5.3 cmH₂O and offset 3.5–4.3 cmH₂O across
    posterior glottal widths of 0–3 mm. The **offset/onset ratio is 0.78 ± 0.09**, and it is below
    1 in 98.5 % of trials (Mau et al. 2011, *Laryngoscope* 121:1743,
    https://pmc.ncbi.nlm.nih.gov/articles/PMC3146025) [full]. Starting voicing takes more than
    keeping it going.
- **Voicing offset and onset during an abduction (/h/).** In six women, voicing stopped
  **4–22 ms before** the peak glottal flow (mean per speaker) and restarted **25–47 ms after** it.
  Offsets happened at higher baseline flow than onsets: this is hysteresis. Between 28 and 86 % of
  each speaker's /h/ were devoiced, so the rest kept voicing through the abduction (Koenig, Mencl &
  Lucero 2005, Table I, Table III) [full]. Men devoice /h/ least: "Fully voiced /h/ was most
  common in men" (Koenig 2000, *JSLHR* 43:1211, doi:10.1044/jslhr.4305.1211) [abstract].
  Subglottal pressure falls about 1.2–2 cmH₂O while the glottis is open for /h/ (Löfqvist 1975;
  Lucero & Koenig 2005) [via Koenig et al. 2005].
- **Voicing carried into voiceless obstruents.** In read American English (37 speakers), of the
  phrase-medial voiceless obstruents that are partly phonated, 67 % show "bleed" (phonation
  carried over from the preceding sonorant into the constriction) and 29 % a "trough" (voicing
  dies out and returns before the end), which is more common in fricatives (Davidson 2018, *JIPA*,
  manuscript at
  https://www.dropbox.com/s/my1hnijadvjcrg3/Davidson_2017_JIPA_ms.pdf) [full]. Two studies are
  quoted there: Docherty (1992) found 14–18 % of a voiceless stop's closure voiced after a vowel
  (15–24 % word-finally) and 3.5–11 % of a fricative's. Pirello et al. (1997) found that
  phonation in a voiceless fricative is "almost always within the first 30ms" [via Davidson 2018].
- **Keeping voicing going in voiced stops.** /b d g/ closures were "always accompanied … by
  significant intervals of vocal fold vibration … and relatively large increases in supraglottal
  volume", made by lowering the larynx and moving the soft palate and tongue. /p t k/ closures
  were silent, sometimes with a volume decrease (Westbury 1983, *JASA* 74, doi:10.1121/1.389236)
  [abstract].

### What the model does

- The source is a parametric glottal **area** pulse; the airway network computes the flow
  (`sources/glottis.rs:1-8`). The two-mass folds are not built (`docs/architecture.md:11-12`).
  F0 is exact and does not depend on pressure.
- Voicing is a product of two separate gates on the vibratory amplitude
  (`sources/glottis.rs:171-176`):
  - Pressure: smoothstep on the transglottal pressure (low-passed at 30 Hz,
    `sources/glottis.rs:126`) from 0.8× to 1.6× a **2.5 cmH₂O** threshold
    (`sources/glottis.rs:130`), so it runs from 2.0 to 4.0 cmH₂O.
  - Abduction: off by smoothstep as the static opening above the chink goes from **0.08 to 0.22
    cm²** (`sources/glottis.rs:173`).
  - The gate is smoothed at 25 Hz (τ ≈ 6 ms, `sources/glottis.rs:127`) and the static area over
    4 ms (`sources/glottis.rs:134`).
  - Onset and offset use the **same** criterion. The pressure gate does not depend on the opening.
- Male vibratory area is 0.17 cm² × fold size (`voice/human_voice.rs:314`). The chink is
  (0.008 + 0.03·breathiness) cm² (`voice/human_voice.rs:321`) and OQ = 0.78 − 0.36·tension
  (`voice/human_voice.rs:322`).
- The lungs are a prescribed-pressure node feeding the trachea through ρc/2A
  (`voice/human_airway.rs:119-121`). Pressure is 8 cmH₂O by default (`voice/human_voice.rs:49`)
  and 9 in `render rap` (`chimera-cli/src/rap.rs:161`).
- Voiced obstruents: a voiced fricative gets a 0.035 cm² opening (`phonetics/planner.rs:369`).
  Voiced stops get no active cavity enlargement, only the passive yielding walls
  (`physics.rs:28`).

### Gap

1. **No coupling between abduction and pressure, and no hysteresis.** In the real folds the
   threshold rises with the opening (Pth ∝ x₀), and offset needs less than onset (ratio ≈ 0.78).
   So voicing survives well into an abduction and restarts late. The model switches vibration off
   at a fixed opening (0.22 cm²), whatever the pressure, and back on at the same point. The male
   voice's /h/ (0.33 cm², `planner.rs:357`) is therefore always voiceless, while real men usually
   voice it.
2. The threshold (2.5 cmH₂O, fully on at 4.0) sits below the measured onset PTP (4.2 ± 1.0). This
   makes the model voice *more* easily, so it does not explain the lost vowels.
3. F0 does not follow pressure (real: 2–3 Hz/cmH₂O in the two-mass model). Voiced stops get no
   active cavity expansion. Neither bears on the vowel symptom.

---

## 2. Glottal gestures for voiceless consonants

### What the real larynx does

- **Timing against the oral constriction.** German, videofiberendoscopy plus transillumination
  (Hoole & Bombien 2014, *J. Phonetics* 44:8–24,
  https://www.phonetik.uni-muenchen.de/~hoole/pdf/hoolebombien_jphon_44_2014.pdf) [full]:
  - **Fricatives:** abduction starts about **0 ms (±5)** after the start of frication (Fig. 12).
    Peak opening falls at about the middle of the frication (relative timing ≈ 0.5). Voicing
    returns about 10–15 ms after the frication ends (Fig. 13).
  - **Stops:** abduction starts **22–30 ms after the closure** (22.1 ± 2.8 ms later than in
    fricatives, "probably one of the most stable features of laryngeal–oral coordination ever
    encountered"). Peak opening comes at the release for /p/ (relative timing ≈ 1.1) and
    0.2–0.3 later for /t k/. About 60 % of the glottal gesture lies after the release.
  - The glottal gesture's duration is nearly the same for /p t k/, while closure duration varies,
    so VOT changes with the closure. Fricative gestures are 17.9 ms longer than stop gestures.
    Stop VOT is 51.7 ms longer than fricative VOT. In the schematic of mean patterns (Fig. 13)
    the whole opening–closing gesture spans about 150 ms at a comfortable rate.
  - Prosodic strengthening mainly enlarges the opening, not its duration.
- American English (Löfqvist & McGarr 1987, quoted): "the onset of glottal abduction occurs
  10–20ms before the formation of the oral constriction in voiceless fricatives, while the same
  event coincides with, or lags behind 10–15ms, the onset of oral closure in voiceless stops". The
  fricative opening is the larger [via Davidson 2018].
- **Clusters.** The glottal opening has one, two or more peaks in regular patterns. Each
  aspirated stop or fricative tends to get its own peak, while "an unaspirated stop embedded in a
  voiceless environment can be produced within the opening gesture attributed to an adjacent
  aspirated stop or fricative" (Yoshioka, Löfqvist & Hirose 1981, *JASA* 70,
  doi:10.1121/1.387227) [abstract]. "Several laryngeal movements may occur in a cluster" (Löfqvist
  & Yoshioka 1980, *JASA* 68, doi:10.1121/1.384774) [abstract]. In German clusters, VOT after C1
  is longer than after a singleton, and speakers get there by different routes (Hoole & Bombien
  2014) [full].
- **VOT is not only timing.** Single-token VOT correlates only weakly with laryngeal–oral phasing.
  Glottal opening, transglottal pressure and flow, and fold tension also matter. In vowels after
  voiceless consonants, peak and minimum flow per pulse first fall and then rise (Löfqvist 1992,
  *Lang. Speech* 35, doi:10.1177/002383099203500203) [abstract].
- **Size.** Stevens' recipe for /p/ in HLsyn: the glottal area grows linearly from the modal
  4 mm² (0.04 cm²), starting 20 ms before the closure, to about **30 mm² (0.30 cm²) at the
  release**. It is back to 4 mm² 50 ms after the release (MIT 6.542J Lab 16) [full]. This is a
  synthesis recipe by an expert, not a measurement.
- **Rate.** "Such changes [more overlap at faster rates] have been shown for sequences of
  laryngeal gestures by Löfqvist & Yoshioka (1981) and Munhall & Löfqvist (1992)" [via Byrd & Tan
  1996]. Laryngeal gestures follow the same kinematic scaling as the tongue: the ratio of peak
  velocity to amplitude rises as movement duration falls (Munhall, Ostry & Parush 1985, *J. Exp.
  Psychol. HPP* 11:457, doi:10.1037/0096-1523.11.4.457; Ostry & Munhall 1985, *JASA* 77:640,
  doi:10.1121/1.391882) [abstracts]. So a glottal gesture shortens when its consonant does.
- **What listeners need.** An intervocalic fricative is judged voiceless when its unvoiced
  interval exceeds about **60 ms** (in their VCV stimuli), less a small correction for
  truncated F1 transitions (Stevens et al. 1992, *JASA* 91:2979, doi:10.1121/1.402933)
  [abstract].

### What the model does

Each voiceless consonant gets one ABDUCTION gesture (`phonetics/planner.rs:355-370`):

| consonant | active (plateau) | ramps in / out | opening | strength |
|---|---|---|---|---|
| voiceless fricative | t0 − 15 ms … t1 + 5 ms | 30 / 30 ms | 0.30 cm² | 6 (`:366`) |
| aspirated stop / affricate | t0 + 0.25·dur … t1 + 0.4·VOT | 35 / 45 ms ÷ squeeze | 0.36 cm² | 6 (`:364`) |
| unaspirated stop | same | 35 / 20 ms | 0.22 cm² | 6 (`:364`) |
| /h/ | t0 − 10 ms … t1 | 30 / 35 ms | 0.33 cm² | 5 (`:357`) |

- The blend turns a gesture's weight into opening as `min(1, weight/2)`
  (`voice/human_voice.rs:442-443`). At strength 6 the opening is therefore **full once the gesture
  is one third active**: the cosine ramps act as near-steps at their outer ends.
- The ramps are fixed in ms. Only the aspirated release ramp and VOT shrink with `squeeze`, and
  `squeeze` is the Klatt-minimum boost (`planner.rs:266-272`, `:309-310`).

*Computed* voicing timeline, with the gate edges at 0.08 and 0.22 cm² and about 6 ms more for the
gate's smoothing:

| | voicing starts to fall | voicing off | voicing fully back |
|---|---|---|---|
| before a voiceless fricative | 39 ms before frication | **35 ms before frication** | |
| after a voiceless fricative | | | **25–29 ms after frication** |
| before an aspirated stop (gesture start a = t0 + 0.25·dur) | a − 29 ms | a − 25 ms (≈ t0 − 12 ms for a 50 ms stop) | |
| after an aspirated stop, VOT = 50 ms | | | **52–57 ms after release** |

The real voice, by contrast:

- Before a fricative, voicing typically runs **into** the frication: abduction starts −20 to 0 ms
  from the constriction and voicing dies within the first ~30 ms.
- After a fricative, voicing is back about 10–15 ms after it ends (German, comfortable rate).
- Before a stop, phonation bleeds 14–24 % into the closure.

### Gap

- **Too early.** A fricative's opening starts before the constriction and devoices the vowel for
  about 35 ms ahead of it, where speakers keep voicing up to and into the frication.
- **Too square.** Saturating at a third of activation makes the opening a plateau with steep
  edges. The real gesture is a single rise and fall, peaking at mid-fricative or at the release.
- **Too long at speed.** The real gesture scales with duration; the model's ramps don't. With
  rap vowels of 33–60 ms (median 33 ms in the fast section), a vowel between two voiceless
  consonants can lose all of its voicing.
- The model makes stops open wider (0.36 cm²) than fricatives (0.30). The American data say the
  reverse (Löfqvist & McGarr); the German data find no manner difference in peak opening. This is
  minor.

---

## 3. Speaking rate

### What real talkers do

- **VOT follows rate.**
  - As syllables lengthen, VOT lengthens, "especially that of the voiceless /p/" (Miller, Green &
    Reeves 1986, *Phonetica* 43, doi:10.1159/000261764) [abstract].
  - The rate effect holds across places of articulation (Volaitis & Miller 1992, *JASA* 92,
    doi:10.1121/1.403997) [abstract].
  - Per-talker slopes are **8–21 ms of VOT per 100 ms of syllable duration** for /ti/ (10
    talkers, r = 0.60–0.88) and 4–24 ms per 100 ms for /pi/ and /ki/ (Theodore, Miller & DeSteno,
    ICPhS 2007, Tables 1–2, https://www.icphs2007.de/conference/Papers/1541/1541.pdf) [full].
  - Kessinger & Blumstein (1997, *J. Phonetics* 25:143, doi:10.1006/jpho.1996.0039) is the
    standard cross-language reference. I found no abstract or full text; secondary papers say
    VOT moves toward zero at faster rates for aspirated categories [not opened].
- **What shortens, and how.**
  - Rate changes "segmental duration, articulatory displacement, articulatory velocity, and
    intrasyllabic coarticulation", nonlinearly (Gay 1981, *Phonetica* 38,
    doi:10.1159/000260020) [abstract].
  - In EPG data from 5 talkers, consonants shorten and their overlap grows roughly linearly
    with rate. Coda stops lose contact, coronals more than velars; onset /s/ hardly reduces (Byrd
    & Tan 1996, *J. Phonetics* 24:263,
    https://ccstan99.github.io/docs/1996%20JPhon%20-%20Saying%20consonant%20clusters%20quickly.pdf)
    [full].
- **Undershoot vs. overlap.**
  - Formants approach their targets exponentially with vowel duration (100–300 ms). As the vowel
    shortens, they are displaced toward the adjacent consonant's locus, most in F2 (Lindblom
    1963, *JASA* 35:1773, doi:10.1121/1.1918816) [abstract].
  - Clear speech limits that undershoot by **moving the formants faster**, not by lengthening
    the vowel (Moon & Lindblom 1994, *JASA* 96, doi:10.1121/1.410492) [abstract].
  - Articulatory Phonology and task dynamics treat coarticulation as blending among temporally
    overlapping gestures (Browman & Goldstein 1992, *Phonetica* 49, doi:10.1159/000261913;
    Saltzman & Munhall 1989, *Ecol. Psychol.* 1, doi:10.1207/s15326969eco0104_2) [abstracts].
- **Stiffness rises as movements shorten.**
  - Peak velocity / amplitude ("mass-normalized stiffness") varies inversely with movement
    duration, for the tongue and for vocal-fold abduction and adduction alike (Ostry & Munhall
    1985; Munhall, Ostry & Parush 1985) [abstracts].
  - At metronome rates of 90–480 syllables/min (1.5–8 syl/s), peak velocity stays proportional to
    amplitude, and the slope rises linearly with rate. Ranges: tongue body /ka/ amplitude
    0.89–21 mm, peak velocity 21–270 mm/s; tongue tip /ta/ 0.23–16 mm, 7.5–210 mm/s (Kuberski &
    Gafos, ICPhS 2023,
    https://www.ling.uni-potsdam.de/~kuberski/files/index/kuberski2023assessing.pdf) [full].
- **Time constants.** Fitting a 6th-order target-approximation model to EMA of lips and jaw in
  vowel alternations (375–500 ms per vowel) gives median τ of **20.5–27.6 ms**. The lower lip
  relative to the jaw is fastest (Birkholz & Hoole 2012, Interspeech,
  https://tu-dresden.de/ing/elektrotechnik/ias/stks/ressourcen/dateien/forschung/publikationen/birkholz-2012-interspeech-ema.pdf)
  [full].
- **Maximum rates.**
  - /pataka/ diadochokinesis in US English adults (18–43 years): **6.23 ± 0.82 syl/s** (Icht &
    Ben-David 2014) [via Camargo-Mendoza et al. 2023].
  - Across languages, 5.3–7.1 syl/s. Single speakers reach 9.4–9.7 (Camargo-Mendoza et al. 2023,
    *Rev. Investig. Logop.* 13(2), https://dialnet.unirioja.es/descarga/articulo/9147605.pdf)
    [full].
  - "Fast" in the German metronome study tops out at 8 syl/s (Kuberski & Gafos 2023).

### What the model does

- **Articulators.** Each is a critically damped 2nd-order system at 10–13 Hz
  (`control/articulators.rs:24-46`): τ = 1/ω ≈ 12–16 ms, and a 10–90 % rise of 41–53 ms
  (*computed*). Stop closures move ×1.55 (`planner.rs:320`).
- **Speed-up.** Speeds rise only when a segment is **below its Klatt minimum** (`boost`,
  `planner.rs:266-272`), up to `--speedup`. The judge uses 2.
- **Consonant gestures.** The dominant gesture has strength 40, ramps in over 30 ms ÷ squeeze,
  and starts `early` = 22–31 ms × latency (`planner.rs:561-563`). Other articulators get
  strength 2.2 (`:578`), and alveolars front the tongue body at strength 1.2 (`:568`).
- **VOT** = 50 ms ÷ rate ÷ squeeze (`planner.rs:310`). In `render rap` the rate is 1, so only a
  below-minimum boost shortens it.
- **Durations.** Klatt's MIN/INH rules (`phonetics/durations.rs:14-91`). Rap words are fitted to
  beat slots by one k per slot (`phonetics/rap.rs:120-143`).

### Gap

- Real talkers scale VOT, glottal gestures and articulator stiffness **continuously** with
  syllable duration. The model scales almost nothing until a segment is below its Klatt minimum.
  Most of the fast verse's consonants are not below it (the log reports 64–76 % of each group
  under boost 1.2).
- At 9 syl/s a syllable lasts ~110 ms. The real VOT slopes predict VOT some 20–40 ms shorter than
  at a careful rate (an extrapolation beyond the measured range). The model keeps ~55–63 ms of
  aspiration (*computed*, gate included).
- The engine's 2nd-order articulators are, if anything, faster than the fitted lip and jaw
  movements (2nd order at τ ≈ 13 ms against 6th order at τ ≈ 20–28 ms). The vowels' problem is the
  blended **targets** and the glottis, not articulator sluggishness.

---

## 4. Breathing during speech

### What real talkers do

- **Pressure through the breath group.** Measured by tracheal puncture, subglottal pressure is
  "relatively constant and slightly decreasing between an initial rising phase and a final
  falling phase", with local rises on stressed syllables (Yu, Hassid & Demolin, ICPhS 2019, one
  speaker, https://assta.org/proceedings/ICPhS2019Microsite/pdf/full-paper_738.pdf) [full].
  Stressed syllables run 1–2 cmH₂O above unstressed ones [via Koenig et al. 2005].
- **Breaths.** Inspirations last **0.53–0.56 s** in reading and monologue (older control
  speakers, mean age ~71). Breath groups average ~13 syllables, at 3.9–4.6 syl/s (Huber & Darling
  2011, *JSLHR* 54:33, https://pmc.ncbi.nlm.nih.gov/articles/PMC3454440) [full]. Pre-speech
  inhalations are shorter and deeper than quiet ones. Grosjean & Collins (1979) found that
  "inhalations at minor breaks disappeared" at faster reading rates [via Włodarczak & Heldner
  2017, *Front. Psychol.* 8:708,
  https://www.frontiersin.org/articles/10.3389/fpsyg.2017.00708/full] [full].
- **Rap breathing.** I found **no** peer-reviewed respiratory study of rappers. The search
  results were coaching blogs and studies of singers.

### What the model does

- `render rap` plans **every gap between words, and every line,** as its own breath group
  (`chimera-cli/src/rap.rs:144`). The log counts 21 groups in the fast section and 41 in the next
  verse, though many line boundaries have no gap and the inner gaps are 20–280 ms.
- Each group:
  - ramps its own breath in and out (`planner.rs:379`): the gate attacks with τ 25 ms and
    releases with τ 20 ms (`voice/human_voice.rs:487-493`);
  - ends with an "exhale" abduction of 0.22 cm² (exactly the full-devoicing edge) from 15–45 ms
    after its last sound to ~160 ms (`planner.rs:391-396`).
- Measured: 36 of the fast section's 165 vowels lie under the previous group's exhale (mean
  voicing 0.18) (log.md:1909-1912).
- The lungs are a prescribed pressure (`voice/human_airway.rs:119-121`), so pressure does not
  sag as the glottis opens.

### Gap

A real talker does not let the pressure collapse or part the folds in a 20–280 ms gap. Even a full
inspiration takes about half a second, and at fast rates the minor-break breaths disappear. The
model breathes out, devoices and rebuilds pressure at every gap, so the next group's first vowels
start devoiced.

---

## 5. Rap and very fast speech

- **Rates.** The "typical pace of rap deliveries" is about **4.5 syllables per second**
  (Condit-Schultz 2016) [via Komaniecki 2017, *Music Theory Online* 23.4,
  https://mtosmt.org/issues/mto.17.23.4/mto.17.23.4.komaniecki.pdf]. Our target line at ~9 syl/s
  is twice that, above the US English /pataka/ maximum-performance mean (6.2 syl/s), and in the
  range only the fastest individuals reach on DDK (§3).
- **Articulatory or respiratory studies of rap.** I found **none**, by MRI, EMA or respiratory
  kinematics. How rappers stay intelligible at 9 syl/s is unmeasured. What follows is from fast
  and clear speech, not from rap.
- **How fast speech stays intelligible.**
  - Clear speech keeps its intelligibility advantage over conversational speech at normal and
    faster rates (Krause & Braida 2002, *JASA* 112:2165, doi:10.1121/1.1509432) [abstract].
  - At normal rates, clear speech has more energy at 1–3 kHz, **deeper low-frequency modulation
    of the intensity envelope**, more stop-burst releases, changed VOT of word-initial voiceless
    stops, and different short-term vowel spectra (Krause & Braida 2004, *JASA* 115:362,
    doi:10.1121/1.1635842; Krause 2001 thesis abstract, https://dspace.mit.edu/handle/1721.1/8762)
    [abstracts].
  - Moon & Lindblom (1994) show that clear speech compensates undershoot with faster formant
    movement [abstract].
  - Janse (2004, *Speech Commun.* 42:155) compares natural fast speech with time-compressed speech;
    the full text was blocked [not opened].
- **What this means for us.** Deep envelope modulation means the vowels much louder than the
  consonants. That is exactly what our fast render lost: in the fastest section the consonants
  measure *louder* than the vowels (log.md:1904-1905).

---

## 6. Other findings that bear on the symptoms

- **Closures are fast at contact.** "The lips were moving at a high velocity when the oral closure
  occurred", with tissue compression after contact. The lips aim at a *negative* aperture
  (Löfqvist & Gracco 1997, *JSLHR* 40:877, doi:10.1044/jslhr.4004.877) [abstract].
  - The model slows the last part of every closure. Below 0.4 cm² the closing rate eases from
    45 cm²/s to 5 cm²/s at 0.03 cm², then slows as √A (`voice/human_airway.rs:158-163, 220-233`).
  - *Computed*: even at the slew limit, a section takes **≥ 28 ms to go from 0.4 cm² to
    sealed**, but 8 ms from 1.0 to 0.4 cm².
  - The planner compensates by starting closing gestures early (`early`, `planner.rs:561`). The
    log measures stops and nasals sealing 5–15 ms before their planned onset, slow and fast alike
    (log.md:1918-1919).
  - A lip closing at the 7.5–210 mm/s peak velocities above, with an aperture width of ~4.6 cm,
    spends a few ms to ~10 ms between 0.4 cm² and contact (my estimate).
- **Glottal opening lowers subglottal pressure** by ~1–2 cmH₂O (§1). This is a second route to
  devoicing near an opening that the prescribed-pressure lung omits. It works against voicing, so
  adding it would need the hysteresis in §1 to keep the vowels voiced.

---

## Gaps ranked

Ranked by how much of the measured loss each likely explains: 4.8 dB on the vowels; voicing lost
next to voiceless consonants and under exhales; vowel ends cut. Each comes with a change grounded
in the physiology above, to test with the existing probes (voicing per vowel by neighbour, the
level contrast, Whisper WER) and the hill-climb rules.

1. **The voiceless consonants' glottal gesture is too early, too square and fixed in length.**
   This loses voicing in ~35 ms of the vowel before /s f θ ʃ/, 25–29 ms after them, ~10–25 ms
   before stops, and 52–57 ms after aspirated releases. At rap speed that is most of every vowel
   next to a voiceless consonant.
   - *Change:* replace the plateau gesture with a single abduction–adduction movement.
     - **Fricatives:** start at the constriction onset (−10…0 ms), peak at mid-frication, finish
       adducting so voicing restarts 10–15 ms after frication.
     - **Stops:** start 10–25 ms after closure; peak at the release (/p/) or just after (/t k/).
     - Give ABDUCTION its own second-order dynamics, or keep its strength ≤ 2 so `min(1, w/2)`
       never saturates (`human_voice.rs:442`).
     - Scale its duration with the consonant's planned duration (stiffness ∝ 1/duration).
   - Experiment 29 only scaled the existing early, saturated gesture by the Klatt boost. It still
     opened before the fricative and missed most of the fast verse.

2. **VOT stays at ~55–63 ms whatever the syllable length.**
   - *Change:* set VOT from the planned syllable duration D with a talker slope:
     VOT = VOT_ref − s·(D_ref − D), s ≈ 0.1–0.2 (the 8–21 ms per 100 ms measured range), with a
     floor around 15–20 ms. Realise it by shortening the stop's adduction phase, keeping peak
     opening at the release, not by delaying the vowel.
   - At ~110 ms syllables this gives roughly 20–35 ms instead of 55–63. The aspirated vowels after
     /p t k/ (27 of the fast section's unvoiced vowels) regain about half their length.

3. **Breath groups at every gap, each ending with an exhale abduction and a pressure collapse.**
   - *Change:*
     - Plan a breath only where a breath fits: gaps ≥ ~0.3 s, or where the artist audibly
       breathes. Real inspirations run ~0.5 s, and minor-break breaths vanish at fast rates.
     - Inside a breath group, hold the subglottal pressure across short gaps and keep the folds
       adducted (a closed-glottis pause).
     - When a breath is taken, model it as an inspiration (wide glottis, no expiratory pressure),
       not as an abduction overlapping the next word.
   - Experiment 30 did the planning half and raised the fast section's median vowel by 4.7 dB.

4. **The voicing criterion has no pressure–abduction coupling and no hysteresis.**
   - *Change:* gate vibration on Ptrans > Pth(x), with Pth rising linearly with the static
     half-width (Titze 1988, Pth ∝ x₀). Use separate onset and offset thresholds, offset ≈ 0.78 ×
     onset (Mau et al. 2011).
   - Calibrate against the /h/ data: voicing ends near the abduction peak (4–22 ms before it),
     restarts 25–47 ms after it, and stays on through a male /h/ at speech pressure.
   - Voicing then survives the edges of every glottal gesture, which compounds with gap 1. A
     two-mass or body-cover fold would produce this by itself (Ishizaka & Flanagan: the rest area
     decides self-oscillation), at more cost.

5. **Closures approach contact slowly and start early, so they cut the vowel's end.**
   - *Change:* keep the closing rate high down to near contact. Lower `seal_hi` from 0.4 cm²
     toward ~0.05 cm², so the easing models the spreading contact and tissue compression after
     the lips meet, not the approach. Then re-fit `early`/`lead` so the acoustic closure lands on
     the planned boundary.
   - Experiment 32 sharpened the gesture *ramps* instead, which shortened the place-carrying
     transitions and hurt WER. This change leaves the ramps and transitions alone and only shortens
     the last 0.4 cm² of travel.

6. **Articulator speed only rises below the Klatt minimum.**
   - *Change:* scale every gesture's speed with planned duration
     (speed ∝ (D_ref / D)^α, α to be fitted), including the glottal and velic gestures. This
     follows the measured v/A ∝ 1/T law and Kuberski & Gafos' rising slope with rate.
   - This lets the vowel targets be reached within short vowels without sharpening the far ends
     of consonant ramps.

7. **Consonant targets dominate mid-vowel.** At mid-vowel, consonant gestures weigh 3.7 on the
   tongue body against the vowel's 1, so its formants undershoot.
   - *Change:* follow the clear-speech result. Keep the vowel's target and reach it faster, rather
     than averaging it with the next consonant's secondary targets. For example, ramp the
     secondary (strength 2.2) and alveolar-fronting (1.2) gestures in from the vowel's last third
     rather than across it.
   - This is a task-dynamics blending choice, not a rate effect. It probably matters at all rates,
     and more when vowels are short.

8. **Lower priority for these symptoms.**
   - Voiced stops lack active cavity enlargement (Westbury 1983).
   - The pressure threshold (2.5 cmH₂O) is below the measured 4.2 ± 1.0.
   - F0 does not follow pressure.
   - Stops open wider than fricatives (the American data say the reverse).

## Not found or not opened

- **Not found:** any rap study with articulatory (MRI, EMA) or respiratory data; glottal-area
  measurements in cm² for English voiceless consonants (Stevens' textbook values were not
  reachable).
- **No abstract or full text available:** Kessinger & Blumstein 1997 and Munhall & Löfqvist 1992.
  They are cited above only through other papers.
- **Blocked:** Janse 2004.
- The rap rate of 4.5 syl/s is Condit-Schultz's figure as quoted by Komaniecki. I did not open
  the original.
