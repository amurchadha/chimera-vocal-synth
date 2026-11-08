//! `chimera render rap` (a timed score of words, as `tools/performance` uses, through the Rust
//! engine) and `chimera rap score` (a test score on a beat grid).

use crate::js::fixed;
use crate::render::{g2p, render_blocks, render_tracked};
use crate::{Ctx, FS, arg, body, wav_name};
use chimera::math::js_round;
use chimera::phonetics::Intonation;
use chimera::phonetics::{Plan, Segment};
use chimera::phonetics::english::EnglishG2P;
use chimera::phonetics::durations::klatt_durations;
use chimera::phonetics::planner::{PlanOptions, is_vowel, plan_utterance, seg_info};
use chimera::phonetics::rap::{RapTiming, RapWord, fit_rap_group};
use chimera::phonetics::sing::{SongOptions, SungNote, plan_song};
use chimera::phonetics::syllables::lyrics_to_syllables;
use chimera::voice::human_voice::{HumanVoice, SourcePatch, VoiceTelemetry};
use serde_json::{Value, json};

fn word_segments(g: &EnglishG2P, text: &str) -> Vec<Segment> {
    g.to_phrases(text).into_iter().flat_map(|p| p.segments).collect()
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
/// [--base-hz hz] [--tele voice.tele] [--dump]`. `--tele` also records the voice's telemetry, which
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
    let dump = a.iter().any(|x| x == "--dump");
    a.retain(|x| x != "--dump");
    let name = arg(&a, 0, "out/rap");
    let score_path = arg(&a, 1, "");
    let body_name = arg(&a, 2, "male");
    let b = body(body_name)?;
    let score: Value = serde_json::from_str(&std::fs::read_to_string(score_path).map_err(|e| format!("{score_path}: {e}"))?).map_err(|e| format!("{score_path}: {e}"))?;
    let lines = score.get("lines").and_then(Value::as_array).ok_or("the score needs \"lines\"")?;
    let g = g2p()?;
    let mut plans: Vec<Plan> = Vec::new();
    let mut overfull: Vec<String> = Vec::new();
    let mut last_end = 0.0f64;
    for line in lines {
        let words = line.get("words").and_then(Value::as_array).filter(|w| !w.is_empty()).ok_or("each line needs words")?;
        let sung = line.get("sung").and_then(Value::as_bool) == Some(true);
        let mut batch: Vec<&Value> = Vec::new();
        let mut flush = |batch: &mut Vec<&Value>| -> Result<(), String> {
            if batch.is_empty() {
                return Ok(());
            }
            let start = num(batch[0], "start", "word")?;
            if sung {
                // as tools/performance: one [midi, weight] per syllable dividing the word's span
                let mut notes = Vec::new();
                for w in batch.iter() {
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
                for w in batch.iter() {
                    let text = w.get("pronunciation").or(w.get("text")).and_then(Value::as_str).unwrap_or("");
                    let segments = word_segments(&g, text);
                    if segments.is_empty() {
                        return Err(format!("no pronunciation for {text:?}"));
                    }
                    rap.push(RapWord { segments, start: num(w, "start", text)?, end: num(w, "end", text)?, f0: num(w, "hz", text)? });
                }
                let group = fit_rap_group(&rap, body_name.into(), timing);
                if dump {
                    let s: Vec<String> = group.segments.iter().map(|s| format!("{}{}{}:{:.0}", if s.stress == Some(1) { "ˈ" } else { "" }, s.ipa, if s.word_end == Some(true) { "|" } else { "" }, 1000.0 * s.dur.unwrap_or(0.0))).collect();
                    println!("t0 {:.3}  {}", group.t0, s.join(" "));
                }
                for &i in &group.overfull {
                    overfull.push(batch[i].get("text").and_then(Value::as_str).unwrap_or("?").to_string());
                }
                plans.push(plan_utterance(&group.segments, &PlanOptions { body: body_name.into(), t0: group.t0, f0: Some(rap[0].f0), intonation: Some(Intonation::Flat), speedup, ..Default::default() }));
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
            batch.push(w);
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
    if !overfull.is_empty() {
        println!("too fast to say in full (respell with \"pronunciation\"): {}", overfull.join(", "));
    }
    Ok(())
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
