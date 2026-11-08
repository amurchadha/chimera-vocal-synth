//! Rap: words timed to a beat, said rather than sung.
//!
//! A rapper's syllable lands on the beat at its vowel onset (its perceptual centre), with the
//! onset consonants just before. So each word's slot runs from its first vowel to the next word's
//! first vowel, and holds the rest of the word plus the next word's onset. The segments in a slot
//! are fitted by Klatt's rule DUR = MIN + (INH − MIN)·k with one k per slot, so vowels and long
//! consonants give up their stretchable part first and a stop keeps the closure it needs. Only a
//! slot shorter than its sounds' minimums squeezes the minimums too; those words are reported,
//! since a rapper would say a reduced form of them ("n" for "and").
//!
//! `RapTiming::Even` is the earlier split (each word's own span, every consonant one share and
//! every vowel two), kept to measure against.

use super::Segment;
use super::durations::{SegInfo, klatt_durations, klatt_min};
use super::planner::seg_info;
use crate::anatomy::human::BodyMix;

/// One word of a rap line: its segments (word ends marked), its time span and its pitch.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RapWord {
    pub segments: Vec<Segment>,
    /// the beat the word lands on (s): its first vowel's onset
    pub start: f64,
    pub end: f64,
    pub f0: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum RapTiming {
    /// each word's segments split its own span: a consonant one share, an unstressed vowel 1.9, a
    /// stressed vowel 2.5 (the performance renderer's split)
    Even,
    /// vowel onsets on the beats, segments fitted by Klatt's minimum and inherent durations
    #[default]
    Klatt,
}

/// A breath group fitted to its beats: segments with `dur` and `f0` set, ready for
/// `plan_utterance` at `t0`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RapGroup {
    pub segments: Vec<Segment>,
    /// plan start (s), so the first word lands on its beat
    pub t0: f64,
    /// words whose slot was shorter than the sum of their sounds' minimum durations
    pub overfull: Vec<usize>,
}

/// The planner's breath-onset lead: `plan_utterance` starts its first segment this long after t0.
const PLAN_LEAD: f64 = 0.06;
/// Onset consonants of the first word come before its beat, but at most this long.
const MAX_PRE_ROLL: f64 = 0.15;

pub fn fit_rap_group(words: &[RapWord], body: BodyMix, timing: RapTiming) -> RapGroup {
    let mut segs: Vec<Segment> = Vec::new();
    let mut word_of: Vec<usize> = Vec::new();
    for (w, word) in words.iter().enumerate() {
        for s in &word.segments {
            let mut s = s.clone();
            s.dur = None;
            s.f0 = Some(word.f0);
            segs.push(s);
            word_of.push(w);
        }
        if let Some(last) = segs.last_mut() {
            last.word_end = Some(true);
        }
    }
    let n = segs.len();
    if n == 0 {
        return RapGroup::default();
    }
    let info: Vec<_> = segs.iter().map(|s| seg_info(s, body)).collect();
    let mut overfull = Vec::new();
    let mut d = vec![0.0; n];
    let t0;
    match timing {
        RapTiming::Even => {
            for (w, word) in words.iter().enumerate() {
                let idx: Vec<usize> = (0..n).filter(|&i| word_of[i] == w).collect();
                let wt = |i: usize| if info[i].vowel { if segs[i].stress == Some(1) { 2.5 } else { 1.9 } } else { 1.0 };
                let sum: f64 = idx.iter().map(|&i| wt(i)).sum();
                for &i in &idx {
                    d[i] = (word.end - word.start) * wt(i) / sum;
                }
            }
            t0 = words[0].start - PLAN_LEAD;
        }
        RapTiming::Klatt => {
            let inh = klatt_durations(&segs, |s| seg_info(s, body));
            let min: Vec<f64> = segs.iter().zip(&info).map(|(s, i)| klatt_min(s, *i)).collect();
            // each word's anchor: its first vowel (a word with none anchors at its first sound)
            let anchor: Vec<usize> = (0..words.len())
                .map(|w| {
                    let first = (0..n).find(|&i| word_of[i] == w).unwrap_or(n);
                    (first..n).take_while(|&i| word_of[i] == w).find(|&i| info[i].vowel).unwrap_or(first)
                })
                .collect();
            let pre = fit(&inh[..anchor[0]], &min[..anchor[0]], &info[..anchor[0]], None, MAX_PRE_ROLL);
            d[..anchor[0]].copy_from_slice(&pre.0);
            for w in 0..words.len() {
                let (lo, hi) = (anchor[w], if w + 1 < words.len() { anchor[w + 1] } else { n });
                let slot = if w + 1 < words.len() { words[w + 1].start - words[w].start } else { words[w].end - words[w].start };
                let (part, squeezed) = fit(&inh[lo..hi], &min[lo..hi], &info[lo..hi], Some(slot), slot);
                d[lo..hi].copy_from_slice(&part);
                if squeezed {
                    overfull.push(w);
                }
            }
            t0 = words[0].start - d[..anchor[0]].iter().sum::<f64>() - PLAN_LEAD;
        }
    }
    for (s, d) in segs.iter_mut().zip(d) {
        s.dur = Some(d);
    }
    RapGroup { segments: segs, t0, overfull }
}

/// Durations for segments with inherent (Klatt) and minimum durations that should fill `slot`
/// seconds (no slot: keep their own lengths, capped at `cap`). Returns them and
/// whether the minimums had to be squeezed.
fn fit(inh: &[f64], min: &[f64], info: &[SegInfo], slot: Option<f64>, cap: f64) -> (Vec<f64>, bool) {
    let (sk, sm): (f64, f64) = (inh.iter().sum(), min.iter().sum());
    let target = slot.unwrap_or(sk.min(cap));
    if inh.is_empty() || target <= 0.0 {
        return (vec![0.0; inh.len()], !inh.is_empty());
    }
    if target >= sk {
        // longer than natural: the vowels take the extra time (a held note in a rap is a vowel)
        let sv: f64 = inh.iter().zip(info).filter(|(_, i)| i.vowel).map(|(k, _)| k).sum();
        if sv > 0.0 {
            let extra = target - sk;
            return (inh.iter().zip(info).map(|(k, i)| if i.vowel { k + extra * k / sv } else { *k }).collect(), false);
        }
        return (inh.iter().map(|k| k * target / sk).collect(), false);
    }
    if target >= sm {
        let k = if sk > sm { (target - sm) / (sk - sm) } else { 0.0 };
        return (inh.iter().zip(min).map(|(i, m)| m + (i - m) * k).collect(), false);
    }
    (min.iter().map(|m| m * target / sm).collect(), true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::phonetics::ipa::tokenize_ipa;

    fn word(ipa: &str, start: f64, end: f64) -> RapWord {
        RapWord { segments: tokenize_ipa(ipa), start, end, f0: 110.0 }
    }

    #[test]
    fn slots_are_filled_exactly_and_vowels_land_on_the_beats() {
        crate::phonetics::planner::init();
        let words = [word("ˈstɹits", 1.0, 1.2), word("ˈkɪk", 1.2, 1.35), word("ˈtæp", 1.35, 1.6)];
        let g = fit_rap_group(&words, BodyMix::default(), RapTiming::Klatt);
        let ds: Vec<f64> = g.segments.iter().map(|s| s.dur.unwrap()).collect();
        // vowel onset of each word = t0 + lead + durations before it
        let onset = |i: usize| g.t0 + PLAN_LEAD + ds[..i].iter().sum::<f64>();
        let vowels: Vec<usize> = g.segments.iter().enumerate().filter(|(_, s)| seg_info(s, BodyMix::default()).vowel).map(|(i, _)| i).collect();
        for (v, w) in vowels.iter().zip(&words) {
            assert!((onset(*v) - w.start).abs() < 1e-9, "vowel at {} for a beat at {}", onset(*v), w.start);
        }
        let end = g.t0 + PLAN_LEAD + ds.iter().sum::<f64>();
        assert!((end - 1.6).abs() < 1e-9);
    }

    #[test]
    fn a_stop_keeps_more_of_its_length_than_the_vowel_when_squeezed() {
        crate::phonetics::planner::init();
        // "tap" in a slot shorter than its natural length: the vowel gives up its stretchable part first
        let tight = fit_rap_group(&[word("ˈtæp", 0.5, 0.68)], BodyMix::default(), RapTiming::Klatt);
        let even = fit_rap_group(&[word("ˈtæp", 0.5, 0.68)], BodyMix::default(), RapTiming::Even);
        let p = |g: &RapGroup| g.segments[2].dur.unwrap();
        assert!(p(&tight) > p(&even), "klatt p {} vs even p {}", p(&tight), p(&even));
        assert!(tight.overfull.is_empty());
    }

    #[test]
    fn an_impossible_slot_is_reported() {
        crate::phonetics::planner::init();
        let g = fit_rap_group(&[word("ˈstɹɛŋkθs", 0.5, 0.56)], BodyMix::default(), RapTiming::Klatt);
        assert_eq!(g.overfull, vec![0]);
    }
}
