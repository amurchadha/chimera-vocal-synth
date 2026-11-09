//! As-spoken forms: the ways people say words in running speech beside the dictionary's careful
//! one. CMUdict says "running" [ɹʌnɪŋ], "and" [ænd], "kept" [kɛpt]; a fast talker says [ɹʌnɪn],
//! [ən] or [n], [kɛp]. [`variants`] lists the forms these rules allow for a word in its line,
//! each with an id naming the rules it took, so that a renderer told which form a speaker used
//! (`chimera render rap --spoken`, the choice made by aligning a recording against every form)
//! says that one. Nothing here runs unless asked: the dictionary form is unchanged.
//!
//! The rules (ids), all general English (Gimson's weak forms; Cruttenden 2014; Johnson 2004 on
//! the reductions of conversational American English):
//! - `in`: -ing as -in' ("running" → ɹʌnɪn): a final unstressed /ɪŋ/ in a word of two or more
//!   syllables
//! - `td`: a final /t d/ after a consonant other than /ɹ t d/, not before a vowel ("kept" → kɛp,
//!   "fast" → fæs); never in "-n't", which would turn "won't" into "woan"
//! - `h`: /h/ dropped from a function word inside a line ("him" → ɪm, "has" → æz)
//! - `syn`: syncope in a word of three or more syllables: an unstressed /ə ɪ/ between a consonant
//!   and /ɹ l n/ + vowel goes ("family" → fæmli), an unstressed /ɚ/ before a vowel becomes /ɹ/
//!   ("camera" → kæmɹə)
//! - `gem`: a final consonant the next word starts with is said once ("red door" → ɹɛ dɔɹ)
//! - `pal`: /t d s z/ + /j/ across a word boundary coalesce ("met you" → mɛtʃ u, "did you" →
//!   dɪdʒ u, "miss you" → mɪʃ u): the first word's consonant becomes /tʃ dʒ ʃ ʒ/, the second
//!   word loses its /j/
//! - `fuse`: fused pairs: going to → gʌn ə, want to → wɑn ə, got to → gɑt ə, have to → hæf tə,
//!   has to → hæs tə, let me → lɛ mi, give me → gɪ mi
//! - `weak`, `weak2`: function words' weak forms beyond the planner's schwa ("and" → ən, n; "of"
//!   → əv, ə; "them" → ðəm, əm; "to" → tə; "you" → jə; "for" → fɚ, fə)
//!
//! A variant may take several rules ("h+td"); each rule fires on the form the earlier ones left,
//! in [`RULES`] order, at most one of `weak`/`weak2`/`fuse` and one of `td`/`gem`.

use super::Segment;
use super::english::{is_function_word, is_vowel};

/// A word of a line as the G2P says it, before allophones (no flaps or dark /l/).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Word {
    /// the lowercase spelling the G2P looked up ("you're", "and")
    pub text: String,
    pub segments: Vec<Segment>,
}

/// One way of saying a word.
#[derive(Clone, Debug, PartialEq)]
pub struct Variant {
    /// [`DICT`] for the dictionary form, else the rules taken, in [`RULES`] order, joined by '+'
    pub id: String,
    pub segments: Vec<Segment>,
}

/// The id of the dictionary form.
pub const DICT: &str = "dict";
/// The rules, in the order they apply (a whole-word form first, then the sound changes).
pub const RULES: [&str; 9] = ["weak", "weak2", "fuse", "h", "in", "syn", "td", "gem", "pal"];
/// Which rules name a form two sets of rules both make: fewest rules first, then the sound
/// changes before the whole-word forms ("him" → ɪm is `h`, not `weak`).
const PRIORITY: [&str; 9] = ["h", "in", "syn", "td", "gem", "pal", "fuse", "weak", "weak2"];
/// At most this many forms per word (the dictionary's included), the simplest first.
pub const MAX_FORMS: usize = 10;

fn seg(ipa: &str, stress: u8) -> Segment {
    Segment { ipa: ipa.to_string(), stress: Some(stress), ..Default::default() }
}

/// "ð ə m" → segments; "ˈʌ" is a stressed vowel, everything else unstressed.
fn parse(form: &str) -> Vec<Segment> {
    form.split(' ').filter(|p| !p.is_empty()).map(|p| match p.strip_prefix('ˈ') {
        Some(v) => seg(v, 1),
        None => seg(p, 0),
    }).collect()
}

/// Function words' weak forms (all unstressed). The planner already gives one-vowel function
/// words a schwa ("and" → ənd); these go further, as running speech does.
fn weak_forms(w: &str) -> &'static [&'static str] {
    match w {
        "am" => &["ə m", "m"],
        "an" => &["ə n", "n"],
        "and" | "n" => &["ə n", "n"],
        "are" => &["ɚ"],
        "as" => &["ə z"],
        "at" => &["ə t"],
        "been" => &["b ɪ n"],
        "but" => &["b ə t"],
        "can" => &["k ə n", "k n"],
        "could" => &["k ə d"],
        "do" => &["d ə"],
        "does" => &["d ə z"],
        "for" => &["f ɚ", "f ə"],
        "from" => &["f ɹ ə m"],
        "had" => &["h ə d", "ə d"],
        "has" => &["h ə z", "ə z"],
        "have" => &["h ə v", "ə v"],
        "he" => &["i"],
        "her" => &["h ɚ", "ɚ"],
        "him" => &["ɪ m", "ə m"],
        "his" => &["ɪ z", "ə z"],
        "i'm" => &["ə m"],
        "into" => &["ɪ n t ə"],
        "just" => &["dʒ ə s t", "dʒ ə s"],
        "must" => &["m ə s t", "m ə s"],
        "of" => &["ə v", "ə"],
        "or" => &["ɚ"],
        "should" => &["ʃ ə d"],
        "some" => &["s ə m"],
        "than" => &["ð ə n"],
        "that" => &["ð ə t"],
        "them" | "'em" | "em" => &["ð ə m", "ə m"],
        "there" => &["ð ɚ"],
        "to" => &["t ə"],
        "us" => &["ə s"],
        "was" => &["w ə z"],
        "were" => &["w ɚ"],
        "what" => &["w ə t"],
        "will" => &["w ə l", "ə l"],
        "would" => &["w ə d", "ə d"],
        "you" | "ya" => &["j ə"],
        "your" | "you're" => &["j ɚ"],
        "because" => &["b ɪ k ə z", "k ə z"],
        "cause" | "'cause" => &["k ə z"],
        _ => &[],
    }
}

/// (first word, second word, the first's fused form, the second's); "" leaves that word as it is.
const FUSED: [(&str, &str, &str, &str); 7] = [
    ("going", "to", "g ˈʌ n", "ə"),
    ("want", "to", "w ˈɑ n", "ə"),
    ("got", "to", "", "ə"),
    ("have", "to", "h ˈæ f", "t ə"),
    ("has", "to", "h ˈæ s", "t ə"),
    ("let", "me", "l ˈɛ", ""),
    ("give", "me", "g ˈɪ", ""),
];

fn vowel(s: &Segment) -> bool {
    is_vowel(&s.ipa)
}
fn consonant(s: &Segment) -> bool {
    !vowel(s)
}

/// Rule `r` on `segs` (the form so far) of `line[i]`, or None where it doesn't apply.
fn apply(r: &str, segs: &[Segment], line: &[Word], i: usize) -> Option<Vec<Segment>> {
    let w = &line[i];
    let prev = i.checked_sub(1).map(|k| &line[k]);
    let next = line.get(i + 1);
    let next_first = next.and_then(|n| n.segments.first());
    let n = segs.len();
    let mut out = segs.to_vec();
    match r {
        "weak" | "weak2" => {
            let f = *weak_forms(&w.text).get(usize::from(r == "weak2"))?;
            // a form without the dictionary's /h/ is said only inside a line, as `h`
            if prev.is_none() && segs.first().is_some_and(|s| s.ipa == "h") && !f.starts_with('h') {
                return None;
            }
            out = parse(f);
        }
        "fuse" => {
            let first = next.and_then(|nx| FUSED.iter().find(|f| f.0 == w.text && f.1 == nx.text)).map(|f| f.2);
            let second = prev.and_then(|p| FUSED.iter().find(|f| f.0 == p.text && f.1 == w.text)).map(|f| f.3);
            out = parse(first.or(second).filter(|f| !f.is_empty())?);
        }
        "h" => {
            if prev.is_none() || n < 2 || segs[0].ipa != "h" || !is_function_word(&w.text) {
                return None;
            }
            out.remove(0);
        }
        "in" => {
            let nv = segs.iter().filter(|s| vowel(s)).count();
            if nv < 2 || n < 3 || segs[n - 1].ipa != "ŋ" || segs[n - 2].ipa != "ɪ" || segs[n - 2].stress.unwrap_or(0) != 0 {
                return None;
            }
            out[n - 1].ipa = "n".into();
        }
        "syn" => {
            if segs.iter().filter(|s| vowel(s)).count() < 3 {
                return None;
            }
            let weak = |s: &Segment| s.stress.unwrap_or(0) == 0;
            let k = (1..n.saturating_sub(1)).find(|&k| {
                let (a, s, b) = (&segs[k - 1], &segs[k], &segs[k + 1]);
                consonant(a)
                    && weak(s)
                    && ((matches!(s.ipa.as_str(), "ə" | "ɪ") && matches!(b.ipa.as_str(), "ɹ" | "l" | "n") && segs.get(k + 2).is_some_and(vowel))
                        || (s.ipa == "ɚ" && vowel(b)))
            })?;
            if out[k].ipa == "ɚ" {
                out[k] = seg("ɹ", 0);
            } else {
                out.remove(k);
            }
        }
        "td" => {
            if n < 3 || w.text.ends_with("n't") || !matches!(segs[n - 1].ipa.as_str(), "t" | "d") || next_first.is_some_and(vowel) {
                return None;
            }
            let before = &segs[n - 2];
            if vowel(before) || matches!(before.ipa.as_str(), "ɹ" | "t" | "d") {
                return None;
            }
            out.pop();
        }
        "gem" => {
            let f = next_first?;
            if n < 2 || vowel(f) || segs[n - 1].ipa != f.ipa {
                return None;
            }
            out.pop();
        }
        "pal" => {
            // this word's last sound with the next word's /j/, or the next word's /j/ after this one's
            let joined = |a: &str| match a {
                "t" => Some("tʃ"),
                "d" => Some("dʒ"),
                "s" => Some("ʃ"),
                "z" => Some("ʒ"),
                _ => None,
            };
            if n >= 2 && next_first.is_some_and(|f| f.ipa == "j") && let Some(j) = joined(&segs[n - 1].ipa) {
                out[n - 1].ipa = j.into();
            } else if n >= 2 && segs[0].ipa == "j" && prev.and_then(|p| p.segments.last()).is_some_and(|l| joined(&l.ipa).is_some()) {
                out.remove(0);
            } else {
                return None;
            }
        }
        _ => return None,
    }
    // a form needs a sound and changes something
    (!out.is_empty() && out != segs).then_some(out)
}

/// Every form of `line[i]` the rules allow: the dictionary form first ([`DICT`]), then the
/// variants with distinct sounds, fewest rules first (see `PRIORITY`), at most [`MAX_FORMS`] in all.
pub fn variants(line: &[Word], i: usize) -> Vec<Variant> {
    let w = &line[i];
    let mut out = vec![Variant { id: DICT.into(), segments: w.segments.clone() }];
    if w.segments.is_empty() {
        return out;
    }
    let same = |a: &[Segment], b: &[Segment]| a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.ipa == y.ipa && x.stress == y.stress);
    let bit = |r: &str| 1u32 << RULES.iter().position(|x| *x == r).unwrap();
    let mut subsets: Vec<u32> = (1..1u32 << RULES.len()).collect();
    subsets.sort_by_key(|&m| (m.count_ones(), PRIORITY.iter().enumerate().filter(|(_, r)| m & bit(r) != 0).map(|(k, _)| k).collect::<Vec<_>>()));
    for m in subsets {
        let has = |r: &str| m & bit(r) != 0;
        if usize::from(has("weak")) + usize::from(has("weak2")) + usize::from(has("fuse")) > 1 || (has("td") && has("gem")) {
            continue;
        }
        let mut segs = w.segments.clone();
        let mut ok = true;
        for r in RULES.iter().filter(|r| has(r)) {
            match apply(r, &segs, line, i) {
                Some(s) => segs = s,
                None => {
                    ok = false;
                    break;
                }
            }
        }
        if !ok || out.iter().any(|v| same(&v.segments, &segs)) {
            continue;
        }
        let id: Vec<&str> = RULES.iter().copied().filter(|r| has(r)).collect();
        out.push(Variant { id: id.join("+"), segments: segs });
        if out.len() == MAX_FORMS {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::phonetics::english::arpabet_to_segments;

    fn word(text: &str, arpa: &str) -> Word {
        Word { text: text.into(), segments: arpabet_to_segments(arpa) }
    }
    fn ipa(s: &[Segment]) -> String {
        s.iter().map(|s| s.ipa.as_str()).collect()
    }
    /// id → sounds of every variant of line[i]
    fn forms(line: &[Word], i: usize) -> Vec<(String, String)> {
        variants(line, i).into_iter().map(|v| (v.id, ipa(&v.segments))).collect()
    }
    fn has(line: &[Word], i: usize, id: &str, sounds: &str) -> bool {
        forms(line, i).iter().any(|(a, b)| a == id && b == sounds)
    }

    #[test]
    fn ing_as_in_and_cluster_t_d_before_a_consonant_only() {
        let line = [word("dogs", "D AA1 G Z"), word("running", "R AH1 N IH0 NG"), word("kept", "K EH1 P T"), word("fast", "F AE1 S T"), word("again", "AH0 G EH1 N")];
        assert!(has(&line, 1, "in", "ɹʌnɪn"));
        assert!(has(&line, 2, "td", "kɛp"), "{:?}", forms(&line, 2));
        // before a vowel the /t/ stays
        assert!(!forms(&line, 3).iter().any(|(id, _)| id.contains("td")), "{:?}", forms(&line, 3));
        // one-syllable "-ing" words ("sing") are not -ing
        let sing = [word("sing", "S IH1 NG")];
        assert_eq!(forms(&sing, 0).len(), 1);
        // "-n't" keeps its /t/
        let wont = [word("won't", "W OW1 N T"), word("swim", "S W IH1 M")];
        assert!(!forms(&wont, 0).iter().any(|(id, _)| id.contains("td")));
    }

    #[test]
    fn h_drops_only_inside_a_line_and_only_from_function_words() {
        let line = [word("ask", "AE1 S K"), word("him", "HH IH0 M"), word("happy", "HH AE1 P IY0")];
        assert!(has(&line, 1, "h", "ɪm") && has(&line, 1, "weak2", "əm"), "{:?}", forms(&line, 1));
        assert!(!forms(&line, 2).iter().any(|(id, _)| id == "h"));
        let first = [word("his", "HH IH0 Z"), word("car", "K AA1 R")];
        assert!(forms(&first, 0).iter().all(|(_, s)| s.starts_with('h')), "{:?}", forms(&first, 0));
    }

    #[test]
    fn weak_forms_syncope_fusions_and_coalescence() {
        let line = [word("salt", "S AO1 L T"), word("and", "AH0 N D"), word("pepper", "P EH1 P ER0")];
        // before a consonant "and" loses its /d/ (td), and has the weak form [n]
        assert!(has(&line, 1, "td", "ən") && has(&line, 1, "weak2", "n"), "{:?}", forms(&line, 1));
        let syn = [word("camera", "K AE1 M ER0 AH0"), word("family", "F AE1 M AH0 L IY0")];
        assert!(has(&syn, 0, "syn", "kæmɹə"), "{:?}", forms(&syn, 0));
        assert!(has(&syn, 1, "syn", "fæmli"), "{:?}", forms(&syn, 1));
        let gonna = [word("going", "G OW1 IH0 NG"), word("to", "T UW1"), word("swim", "S W IH1 M")];
        assert!(has(&gonna, 0, "fuse", "gʌn") && has(&gonna, 1, "fuse", "ə") && has(&gonna, 0, "in", "goʊɪn"));
        let met = [word("met", "M EH1 T"), word("you", "Y UW1")];
        assert!(has(&met, 0, "pal", "mɛtʃ") && has(&met, 1, "pal", "u"), "{:?} {:?}", forms(&met, 0), forms(&met, 1));
        let red = [word("red", "R EH1 D"), word("door", "D AO1 R")];
        assert!(has(&red, 0, "gem", "ɹɛ"));
    }

    #[test]
    fn the_dictionary_form_comes_first_and_ids_and_sounds_are_distinct() {
        let line = [word("ask", "AE1 S K"), word("him", "HH IH0 M"), word("and", "AH0 N D"), word("them", "DH EH1 M"), word("camera", "K AE1 M ER0 AH0"), word("noon", "N UW1 N")];
        for i in 0..line.len() {
            let v = variants(&line, i);
            assert_eq!(v[0].id, DICT);
            assert_eq!(v[0].segments, line[i].segments);
            assert!(v.len() <= MAX_FORMS);
            for a in 0..v.len() {
                for b in a + 1..v.len() {
                    assert_ne!(v[a].id, v[b].id);
                    assert_ne!(ipa(&v[a].segments), ipa(&v[b].segments));
                }
            }
        }
        // a content word nothing applies to has only its dictionary form
        let cat = [word("cat", "K AE1 T")];
        assert_eq!(variants(&cat, 0).len(), 1);
    }
}
