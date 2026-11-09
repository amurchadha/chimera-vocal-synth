//! `chimera render rap` (a timed score of words, as `tools/performance` uses, through the Rust
//! engine) and `chimera rap score` (a test score on a beat grid).

use crate::js::fixed;
use crate::render::{g2p, render_blocks, render_tracked};
use crate::{Ctx, FS, arg, body, wav_name};
use chimera::anatomy::human::BodyMix;
use chimera::math::js_round;
use chimera::phonetics::Intonation;
use chimera::phonetics::{Plan, Segment};
use chimera::phonetics::english::EnglishG2P;
use chimera::phonetics::durations::klatt_durations;
use chimera::phonetics::planner::{PlanOptions, is_vowel, plan_utterance, seg_info};
use chimera::phonetics::ipa::tokenize_ipa;
use chimera::phonetics::english::apply_allophones;
use chimera::phonetics::rap::{REDUCE_LOAD, RapTiming, RapWord, fit_rap_group, reduce_fast_keeping};
use chimera::phonetics::sing::{SongOptions, SungNote, plan_song};
use chimera::phonetics::spoken::{self, DICT, Variant};
use chimera::phonetics::syllables::lyrics_to_syllables;
use chimera::voice::human_voice::{HumanVoice, SourcePatch, VoiceTelemetry};
use serde_json::{Value, json};
use std::collections::BTreeMap;

fn word_segments(g: &EnglishG2P, text: &str) -> Vec<Segment> {
    g.to_phrases(text).into_iter().flat_map(|p| p.segments).collect()
}

/// The version of the spoken-form rules a choice file was made with (`rap spoken`).
const SPOKEN_RULES: &str = "spoken-1";

/// A score word's text as said: its "pronunciation" if it has one, else its text.
fn said_text(w: &Value) -> &str {
    w.get("pronunciation").or(w.get("text")).and_then(Value::as_str).unwrap_or("")
}

/// A word as the G2P says it before allophones, for the spoken-form rules: the words it looked
/// up and their dictionary segments (a "/ipa/" spelling has none).
fn dict_form(g: &EnglishG2P, text: &str) -> spoken::Word {
    if text.starts_with('/') {
        return spoken::Word::default();
    }
    let words: Vec<String> = g.to_phrases(text).into_iter().flat_map(|p| p.words).collect();
    let mut segments = Vec::new();
    for w in &words {
        let mut s = g.word(w, true);
        if let Some(l) = s.last_mut() {
            l.word_end = Some(true);
        }
        segments.extend(s);
    }
    spoken::Word { text: words.join(" "), segments }
}

/// A form's segments as the renderer says them (allophones applied, as `word_segments` does).
fn render_form(v: &Variant) -> Vec<Segment> {
    let mut s = v.segments.clone();
    if let Some(l) = s.last_mut() {
        l.word_end = Some(true);
    }
    apply_allophones(&mut s);
    s
}

/// Every word's forms (`phonetics::spoken::variants`, each word in its line), in score order;
/// a sung word has only its dictionary form.
fn score_forms(g: &EnglishG2P, lines: &[Value]) -> Vec<Vec<Variant>> {
    let mut out = Vec::new();
    for line in lines {
        let words = line.get("words").and_then(Value::as_array).cloned().unwrap_or_default();
        let sung = line.get("sung").and_then(Value::as_bool) == Some(true);
        let forms: Vec<spoken::Word> = words.iter().map(|w| dict_form(g, said_text(w))).collect();
        for i in 0..forms.len() {
            out.push(if sung { vec![Variant { id: DICT.into(), segments: forms[i].segments.clone() }] } else { spoken::variants(&forms, i) });
        }
    }
    out
}

/// `rap spoken <score.json> <out.json>`: every word's forms in ARPAbet, for an aligner's
/// dictionary (tools/rap/spoken_align.py): {"rules", "words", "tokens": [{"line", "forms":
/// [{"id", "arpa"}]}]}, in score order. Private when the score is: it spells the words' sounds.
pub fn spoken_forms(a: &[String]) -> Result<(), String> {
    let score_path = arg(a, 0, "");
    let out = arg(a, 1, "");
    if out.is_empty() {
        return Err("usage: chimera rap spoken <score.json> <out.json>".into());
    }
    let score: Value = serde_json::from_str(&std::fs::read_to_string(score_path).map_err(|e| format!("{score_path}: {e}"))?).map_err(|e| format!("{score_path}: {e}"))?;
    let lines = score.get("lines").and_then(Value::as_array).ok_or("the score needs \"lines\"")?;
    let g = g2p()?;
    let forms = score_forms(&g, lines);
    let mut tokens = Vec::new();
    let mut k = 0;
    let mut mismatch = 0;
    for (li, line) in lines.iter().enumerate() {
        for w in line.get("words").and_then(Value::as_array).into_iter().flatten() {
            let text = said_text(w);
            // the dictionary form, said, is what the renderer says without --spoken
            if !text.starts_with('/') && render_form(&forms[k][0]) != word_segments(&g, text) {
                mismatch += 1;
            }
            let fs: Result<Vec<Value>, String> = forms[k]
                .iter()
                .map(|v| {
                    let arpa: Result<Vec<String>, String> = v.segments.iter().map(crate::compare::tsp::to_arpa).collect();
                    Ok(json!({ "id": v.id, "arpa": arpa?.join(" ") }))
                })
                .collect();
            tokens.push(json!({ "line": li, "forms": fs.map_err(|e| format!("word {k}: {e}"))? }));
            k += 1;
        }
    }
    if mismatch > 0 {
        return Err(format!("{mismatch} words' dictionary forms differ from what render rap says"));
    }
    let n_var: usize = forms.iter().map(|f| f.len() - 1).sum();
    std::fs::write(out, serde_json::to_string(&json!({ "rules": SPOKEN_RULES, "words": k, "tokens": tokens })).unwrap()).map_err(|e| format!("{out}: {e}"))?;
    println!("wrote {out}  {k} words, {} with variants, {n_var} variants", forms.iter().filter(|f| f.len() > 1).count());
    Ok(())
}

/// `--spoken <choice.json>`: {"rules", "words", "choice": {word index: form id}} for a score
/// of `words` words (tools/rap/spoken_align.py writes it from a recording).
fn read_choice(path: &str, words: usize) -> Result<BTreeMap<usize, String>, String> {
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?).map_err(|e| format!("{path}: {e}"))?;
    let n = v.get("words").and_then(Value::as_u64).ok_or(format!("{path}: no \"words\""))?;
    if n as usize != words {
        return Err(format!("{path} is for a score of {n} words; this one has {words}"));
    }
    if v.get("rules").and_then(Value::as_str) != Some(SPOKEN_RULES) {
        return Err(format!("{path} was made with other rules than {SPOKEN_RULES}"));
    }
    let mut out = BTreeMap::new();
    for (k, id) in v.get("choice").and_then(Value::as_object).ok_or(format!("{path}: no \"choice\""))? {
        let i: usize = k.parse().map_err(|_| format!("{path}: bad index {k:?}"))?;
        out.insert(i, id.as_str().ok_or(format!("{path}: bad id for {k}"))?.to_string());
    }
    Ok(out)
}

fn num(v: &Value, key: &str, what: &str) -> Result<f64, String> {
    v.get(key).and_then(Value::as_f64).filter(|x| x.is_finite()).ok_or_else(|| format!("{what}: missing or bad {key:?}"))
}

/// Remove `--name value` from the arguments and return the value.
fn take_opt(a: &mut Vec<String>, name: &str) -> Option<String> {
    let i = a.iter().position(|x| x == name)?;
    let v = a.get(i + 1).cloned();
    a.drain(i..(i + 2).min(a.len()));
    v
}

/// `render rap <out> <score.json> [male|female|child] [--timing even|klatt] [--speedup x]
/// [--base-hz hz] [--tele voice.tele] [--lively] [--reduce] [--spoken choice.json] [--dump]`.
/// `--spoken`: each word in the form a recording chose for it (`phonetics::spoken`;
/// `tools/rap/spoken_align.py` makes the choice); `--reduce` then leaves those words alone. The
/// timing stays the score's own. `--reduce`: words too
/// fast for their slot are said the way fast talkers say them (weak forms, then
/// `phonetics::rap::reduce_fast`). A word's "pronunciation" can also be "/ipa/". `--lively`: stressed syllables
/// louder and pitch-accented, a fall across each breath group, pitch kicks after obstruents. `--tele` also records the voice's telemetry, which
/// tools/performance/render-new.mjs draws the vocal tract from.
pub fn render(ctx: &Ctx, a: &[String]) -> Result<(), String> {
    let mut a = a.to_vec();
    // even measured better than klatt on tools/rap/rap_wer.py (40 vs 50 % at natural timing)
    let timing = match take_opt(&mut a, "--timing").as_deref() {
        Some("even") | None => RapTiming::Even,
        Some("klatt") => RapTiming::Klatt,
        other => return Err(format!("--timing must be even or klatt, not {other:?}")),
    };
    let speedup: Option<f64> = take_opt(&mut a, "--speedup").map(|s| s.parse().map_err(|_| "--speedup must be a number")).transpose()?;
    let base_hz: Option<f64> = take_opt(&mut a, "--base-hz").map(|s| s.parse().map_err(|_| "--base-hz must be a number")).transpose()?;
    let tele_out = take_opt(&mut a, "--tele");
    let probe_out = take_opt(&mut a, "--probe");
    let spoken_path = take_opt(&mut a, "--spoken");
    let reduce = a.iter().any(|x| x == "--reduce");
    a.retain(|x| x != "--reduce");
    let mut reduced = 0usize;
    let lively = a.iter().any(|x| x == "--lively");
    a.retain(|x| x != "--lively");
    let dump = a.iter().any(|x| x == "--dump");
    a.retain(|x| x != "--dump");
    let name = arg(&a, 0, "out/rap");
    let score_path = arg(&a, 1, "");
    let body_name = arg(&a, 2, "male");
    let b = body(body_name)?;
    let score: Value = serde_json::from_str(&std::fs::read_to_string(score_path).map_err(|e| format!("{score_path}: {e}"))?).map_err(|e| format!("{score_path}: {e}"))?;
    let lines = score.get("lines").and_then(Value::as_array).ok_or("the score needs \"lines\"")?;
    let g = g2p()?;
    // --spoken: words said in the form a recording chose for each (word index → form id)
    let spoken_choice = match &spoken_path {
        Some(p) => {
            let n = lines.iter().map(|l| l.get("words").and_then(Value::as_array).map_or(0, Vec::len)).sum();
            Some((read_choice(p, n)?, score_forms(&g, lines)))
        }
        None => None,
    };
    let (mut said_other, mut stale) = (0usize, 0usize);
    let mut word_index = 0usize;
    let mut plans: Vec<Plan> = Vec::new();
    let mut overfull: Vec<String> = Vec::new();
    let mut last_end = 0.0f64;
    for line in lines {
        let words = line.get("words").and_then(Value::as_array).filter(|w| !w.is_empty()).ok_or("each line needs words")?;
        let sung = line.get("sung").and_then(Value::as_bool) == Some(true);
        let mut batch: Vec<(usize, &Value)> = Vec::new();
        let mut flush = |batch: &mut Vec<(usize, &Value)>| -> Result<(), String> {
            if batch.is_empty() {
                return Ok(());
            }
            let start = num(batch[0].1, "start", "word")?;
            if sung {
                // as tools/performance: one [midi, weight] per syllable dividing the word's span
                let mut notes = Vec::new();
                for (_, w) in batch.iter() {
                    let text = w.get("pronunciation").or(w.get("text")).and_then(Value::as_str).unwrap_or("");
                    let syl = lyrics_to_syllables(text, &g);
                    let ns = w.get("notes").and_then(Value::as_array).ok_or("a sung word needs notes")?;
                    if syl.len() != ns.len() {
                        return Err(format!("syllable/note mismatch for {text:?}"));
                    }
                    let span = num(w, "end", text)? - num(w, "start", text)?;
                    let total: f64 = ns.iter().map(|n| n[1].as_f64().unwrap_or(0.0)).sum();
                    for (n, s) in ns.iter().zip(syl) {
                        notes.push(SungNote { midi: n[0].as_f64().unwrap_or(60.0), beats: span * n[1].as_f64().unwrap_or(0.0) / total, syl: s });
                    }
                }
                plans.push(plan_song(&notes, &SongOptions { body: body_name.into(), bpm: 60.0, t0: start, vibrato: 22.0 }));
            } else {
                let mut rap: Vec<RapWord> = Vec::new();
                let mut keep: Vec<bool> = Vec::new();
                for &(k, w) in batch.iter() {
                    let text = w.get("pronunciation").or(w.get("text")).and_then(Value::as_str).unwrap_or("");
                    // "/ipa/" spells the sounds themselves
                    let mut segments = match text.strip_prefix('/').and_then(|s| s.strip_suffix('/')) {
                        Some(ipa) => tokenize_ipa(ipa),
                        None => word_segments(&g, text),
                    };
                    if segments.is_empty() {
                        return Err(format!("no pronunciation for {text:?}"));
                    }
                    let (start, end) = (num(w, "start", text)?, num(w, "end", text)?);
                    let mut chosen = false;
                    if let Some((choice, forms)) = &spoken_choice
                        && let Some(id) = choice.get(&k)
                    {
                        // a chosen word is said as chosen, and --reduce leaves it alone
                        chosen = true;
                        if id != DICT {
                            match forms[k].iter().find(|v| v.id == *id) {
                                Some(v) => {
                                    segments = render_form(v);
                                    said_other += 1;
                                }
                                None => stale += 1,
                            }
                        }
                    }
                    if reduce
                        && !chosen
                        && segments.len() as f64 / (end - start).max(1e-3) > REDUCE_LOAD
                        && let Some(weak) = weak_form(text)
                    {
                        segments = tokenize_ipa(weak);
                        reduced += 1;
                    }
                    rap.push(RapWord { segments, start, end, f0: num(w, "hz", text)? });
                    keep.push(chosen);
                }
                if reduce {
                    reduced += reduce_fast_keeping(&mut rap, body_name.into(), &keep);
                }
                let mut group = fit_rap_group(&rap, body_name.into(), timing);
                if lively {
                    shape_pitch(&mut group.segments, body_name.into());
                }
                if dump {
                    let s: Vec<String> = group.segments.iter().map(|s| format!("{}{}{}:{:.0}", if s.stress == Some(1) { "ˈ" } else { "" }, s.ipa, if s.word_end == Some(true) { "|" } else { "" }, 1000.0 * s.dur.unwrap_or(0.0))).collect();
                    println!("t0 {:.3}  {}", group.t0, s.join(" "));
                }
                for &i in &group.overfull {
                    overfull.push(batch[i].1.get("text").and_then(Value::as_str).unwrap_or("?").to_string());
                }
                plans.push(plan_utterance(&group.segments, &PlanOptions { body: body_name.into(), t0: group.t0, f0: Some(rap[0].f0), intonation: Some(Intonation::Flat), speedup, lively: lively.then_some(true), ..Default::default() }));
            }
            batch.clear();
            Ok(())
        };
        for w in words {
            let (s, e) = (num(w, "start", "word")?, num(w, "end", "word")?);
            if s < last_end - 1e-6 || e <= s {
                return Err(format!("invalid or overlapping time for {}", w.get("text").unwrap_or(&Value::Null)));
            }
            if s > last_end + 1e-6 {
                flush(&mut batch)?;
            }
            batch.push((word_index, w));
            word_index += 1;
            last_end = e;
        }
        flush(&mut batch)?;
    }
    if plans.is_empty() {
        return Err("the score is empty".into());
    }
    let mut voice = HumanVoice::new(FS, b, 2);
    // a word's pitch holds only through its vowels; between them the voice returns to the source
    // pitch, so a source pitch far from the words' (the performance renderer's fixed 125 Hz) makes
    // the pitch dip and snap back on every syllable. Default: the first word's pitch.
    let first_hz = lines.iter().flat_map(|l| l.get("words").and_then(Value::as_array).into_iter().flatten()).find_map(|w| w.get("hz").and_then(Value::as_f64));
    let base_f0 = base_hz.or(first_hz).unwrap_or(110.0);
    voice.set_source(&SourcePatch { pressure: Some(9.0), tension: Some(0.55), ..SourcePatch::f0(base_f0) });
    for p in &plans {
        voice.schedule(&p.gestures);
    }
    let end = plans.iter().map(|p| p.end).fold(last_end, f64::max) + 0.35;
    let mut out = vec![0f32; js_round(FS * end) as usize];
    if let Some(path) = &probe_out {
        // per planned segment, the narrowest and widest the mouth got (smallest oral-cavity
        // section, cm², sampled each ms) while the segment was planned
        let mut t = VoiceTelemetry::default();
        let mut series: Vec<f64> = Vec::new();
        let mut lips: Vec<String> = Vec::new();
        for chunk in out.chunks_mut(48) {
            render_blocks(&mut voice, chunk);
            voice.telemetry(&mut t);
            series.push(t.or_areas.iter().fold(f64::INFINITY, |m, &x| m.min(x as f64)));
            lips.push(format!("{:.3}\t{:.3}", voice.artic.x.lip_ap, voice.artic.effective.lip_ap));
        }
        let mut tsv = String::from("ipa\tt0\tt1\tmin\tmax\n");
        for s in plans.iter().flat_map(|p| &p.segments) {
            let (ipa, t0, t1) = (&s.ipa, s.t0, s.t1);
            let (i0, i1) = ((t0 * 1000.0) as usize, ((t1 * 1000.0).ceil() as usize).min(series.len()));
            let w = &series[i0.min(i1)..i1];
            let (lo, hi) = w.iter().fold((f64::INFINITY, 0f64), |(lo, hi), &x| (lo.min(x), hi.max(x)));
            tsv += &format!("{ipa}\t{t0:.3}\t{t1:.3}\t{lo:.4}\t{hi:.4}\n");
        }
        std::fs::write(path, tsv).map_err(|e| format!("{path}: {e}"))?;
        let s: Vec<String> = series.iter().zip(&lips).map(|(x, l)| format!("{x:.4}\t{l}")).collect();
        std::fs::write(format!("{path}.ms"), s.join("\n")).map_err(|e| format!("{path}.ms: {e}"))?;
        println!("wrote {path}");
    }
    let (_, rec) = if probe_out.is_some() { (Vec::new(), None) } else { render_tracked(&mut voice, &mut out, false, tele_out.is_some())? };
    let file = wav_name(name);
    ctx.write_wav(&file, &out)?;
    if let (Some(path), Some(rec)) = (&tele_out, rec) {
        std::fs::write(path, rec.bytes(body_name.into())).map_err(|e| format!("{path}: {e}"))?;
        println!("wrote {path}");
    }
    println!("wrote {file}  {} s", fixed(end, 2));
    if reduce {
        println!("fast-talk reductions: {reduced}");
    }
    if let Some((choice, _)) = &spoken_choice {
        println!("spoken forms: {} of {word_index} words chosen, {said_other} said otherwise than the dictionary", choice.len());
        if stale > 0 {
            println!("{stale} chosen forms are not among the words' forms now (other rules?); said as the dictionary's");
        }
    }
    if !overfull.is_empty() {
        println!("too fast to say in full (respell with \"pronunciation\"): {}", overfull.join(", "));
    }
    Ok(())
}

/// `--reduce`: the weak forms fast talkers use for these words (the dictionary's are the
/// careful ones; the speech planner already reduces their vowels, not their consonants).
fn weak_form(text: &str) -> Option<&'static str> {
    let w: String = text.to_lowercase().replace('’', "'").chars().filter(|c| c.is_ascii_lowercase() || *c == '\'').collect();
    Some(match w.trim_matches('\'') {
        "and" | "n" => "ən",
        "them" | "em" => "əm",
        "you" | "ya" => "jə",
        "your" | "you're" => "jɚ",
        "to" => "tə",
        "for" => "fɚ",
        "because" | "cause" => "kəz",
        _ => return None,
    })
}

/// `--lively` pitch over a breath group's words (each vowel holds its word's pitch): stressed
/// vowels 8 % up, a 6 % fall across the group, and its last stressed vowel 6 % down instead
/// (the line lands). A flat pitch per word was a monotone over everything the score left flat.
fn shape_pitch(segs: &mut [Segment], body: BodyMix) {
    let vowels: Vec<usize> = (0..segs.len()).filter(|&i| is_vowel(&segs[i].ipa, body)).collect();
    let n = vowels.len();
    let last_stressed = vowels.iter().rev().find(|&&i| segs[i].stress == Some(1)).copied();
    for (k, &i) in vowels.iter().enumerate() {
        let Some(f0) = segs[i].f0 else { continue };
        let decl = 1.0 - 0.06 * if n > 1 { k as f64 / (n - 1) as f64 } else { 0.0 };
        let accent = if n >= 3 && Some(i) == last_stressed { 0.94 } else if segs[i].stress == Some(1) { 1.08 } else { 1.0 };
        segs[i].f0 = Some(f0 * decl * accent);
    }
}

/// `rap score <out.json> <bpm> <syllables per beat> <hz> "<line> / <line>"`: every syllable one
/// grid step, words back to back, two beats of rest between lines. 0 syllables per beat: natural
/// speech timing instead.
pub fn score(a: &[String]) -> Result<(), String> {
    let out = arg(a, 0, "out/rap-score.json");
    let bpm: f64 = arg(a, 1, "148").parse().map_err(|_| "bpm must be a number")?;
    let per_beat: f64 = arg(a, 2, "2").parse().map_err(|_| "syllables per beat must be a number")?;
    let hz: f64 = arg(a, 3, "110").parse().map_err(|_| "hz must be a number")?;
    let text = arg(a, 4, "");
    let g = g2p()?;
    let step = 60.0 / bpm / per_beat;
    let mut t = 0.5;
    let mut lines = Vec::new();
    for line in text.split('/').map(str::trim).filter(|l| !l.is_empty()) {
        let mut words = Vec::new();
        if per_beat <= 0.0 {
            // natural speech timing: Klatt's durations for the whole line, each word starting at
            // its first vowel (a control: `render rap` should then say it as `render text` would)
            let ws: Vec<&str> = line.split_whitespace().collect();
            let mut segs: Vec<Segment> = Vec::new();
            let mut word_of = Vec::new();
            for (i, w) in ws.iter().enumerate() {
                let mut s = word_segments(&g, w);
                if let Some(l) = s.last_mut() {
                    l.word_end = Some(true);
                }
                word_of.extend(std::iter::repeat(i).take(s.len()));
                segs.extend(s);
            }
            let body: chimera::anatomy::human::BodyMix = "male".into();
            let d = klatt_durations(&segs, |s| seg_info(s, body));
            let mut starts = vec![f64::NAN; ws.len()];
            let mut at = t;
            for (i, s) in segs.iter().enumerate() {
                if starts[word_of[i]].is_nan() && is_vowel(&s.ipa, body) {
                    starts[word_of[i]] = at;
                }
                at += d[i];
            }
            for (i, w) in ws.iter().enumerate() {
                let end = if i + 1 < ws.len() { starts[i + 1] } else { at };
                words.push(json!({ "text": w, "start": starts[i], "end": end, "hz": hz }));
            }
            t = at;
        } else {
            for w in line.split_whitespace() {
                let syl = word_segments(&g, w).iter().filter(|s| is_vowel(&s.ipa, "male".into())).count().max(1);
                let end = t + step * syl as f64;
                words.push(json!({ "text": w, "start": t, "end": end, "hz": hz }));
                t = end;
            }
        }
        lines.push(json!({ "section": "test", "words": words }));
        t += 2.0 * 60.0 / bpm;
    }
    let score = json!({ "title": "rap test", "credit": "", "bpm": bpm, "lines": lines });
    std::fs::write(out, serde_json::to_string_pretty(&score).unwrap()).map_err(|e| format!("{out}: {e}"))?;
    println!("wrote {out}  {} lines, {} s", lines.len(), fixed(t, 2));
    Ok(())
}
