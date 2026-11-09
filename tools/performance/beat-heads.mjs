// A rap score performed with a beat behind it, in one step: six heads (kick, snare, hats, a
// three-voice choir) and a modeled 808 play an original half-time beat at the score's bpm for as long as the
// score runs, each recorded with its telemetry, then render-heads.mjs draws the lead and the five.
// --snap moves every word's start onto the 16th-note grid of the score's bpm first (one offset
// fitted for the whole score, then each start rounded), so a score whose timing drifts sits on
// the beat. The working files (the heads, the snapped score) go in <out>.parts/ and are kept.
// --3d: the heads in 3D on the duet page (show-heads.mjs: the lead large, the band beside it),
// captured on the GPU, instead of the side view with the band in tiles (render-heads.mjs).
// usage: bun tools/performance/beat-heads.mjs score.json out.mp4 [--snap] [--3d] [--build] [--breath 0.25] [--beat <onlinesequencer link | notes.json>] [-- render rap options]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { render808 } from './808.mjs';
import { arrange, findLoops, loadSequence } from './sequence.mjs';
// 16-bit mono WAV at 48 kHz
const writeWav = (path, x) => {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(48000, 24); b.writeUInt32LE(96000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, x[i]))), 44 + 2 * i);
  writeFileSync(path, b);
};

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash < 0 ? argv : argv.slice(0, dash);
const rapArgs = dash < 0 ? [] : argv.slice(dash + 1);
const snap = own.includes('--snap');
const threeD = own.includes('--3d');
const build = own.includes('--build');
const beatAt = own.indexOf('--beat');
const beatSource = beatAt >= 0 ? own[beatAt + 1] : null;
const [scorePath, outputPath] = own.filter((a, i) => a !== '--snap' && a !== '--3d' && a !== '--build' && a !== '--breath' && own[i - 1] !== '--breath' && a !== '--beat' && own[i - 1] !== '--beat');
if (!scorePath || !outputPath) throw new Error('usage: bun beat-heads.mjs score.json out.mp4 [--snap] [--3d] [-- render rap options]');
const repo = resolve(new URL('../..', import.meta.url).pathname);
const chimera = join(repo, 'target/release/chimera');
const parts = resolve(outputPath) + '.parts';
mkdirSync(parts, { recursive: true });

const score = JSON.parse(readFileSync(scorePath, 'utf8'));
const bpm = Number(score.bpm) || 120;
const step = 60 / bpm / 4;
// syllables in a written word (vowel groups, a silent final e dropped): enough to tell slow from fast
const syllables = text => {
  const t = String(text).toLowerCase().replace(/[^a-z]/g, '');
  let n = (t.match(/[aeiouy]+/g) ?? []).length;
  if (n > 1 && t.endsWith('e') && !/(le|ee)$/.test(t)) n--;
  return Math.max(1, n);
};
if (build) {
  // --build: the score's sections (runs of lines with one section name) slowest first, so it builds
  // to its fastest; each keeps its own timing and starts on a half-time bar line, a bar of beat first
  const secs = [];
  for (const l of score.lines) {
    if (!secs.length || secs.at(-1).name !== (l.section ?? '')) secs.push({ name: l.section ?? '', lines: [] });
    secs.at(-1).lines.push(l);
  }
  const bar = 4 * 60 / (bpm / 2);
  const ranked = secs.map((sec, i) => {
    const ws = sec.lines.flatMap(l => l.words);
    const a = ws[0].start, b = Math.max(...ws.map(w => w.end));
    return { sec, i, a, b, rate: ws.reduce((n, w) => n + syllables(w.text), 0) / Math.max(0.1, b - a) };
  }).sort((x, y) => x.rate - y.rate || x.i - y.i);
  let at = bar;
  for (const r of ranked) {
    const shift = at - r.a;
    for (const l of r.sec.lines) for (const w of l.words) { w.start = +(w.start + shift).toFixed(4); w.end = +(w.end + shift).toFixed(4); }
    at = Math.ceil((r.b + shift + 60 / bpm) / bar) * bar;
  }
  score.lines = ranked.flatMap(r => r.sec.lines);
  console.log(`built: ${ranked.length} sections slowest first (${ranked.map(r => r.rate.toFixed(1)).join(' → ')} syllables/s)`);
}
const words = score.lines.flatMap(l => l.words);
// `render rap` starts a new breath group at every gap between two words: the voice stops, breathes
// out and in again. A rapper runs on for many lines on one breath (in a fast recorded verse, a
// silence over 0.25 s comes about every 4.6 s, ~20 words), so only a real pause in the score, over
// --breath seconds, stays a gap; every other word runs on into the next.
const breathAt = own.indexOf('--breath');
const breath = breathAt >= 0 ? Number(own[breathAt + 1]) : 0.25;
const pauseAfter = words.map((w, i) => i + 1 < words.length && words[i + 1].start - w.end > breath);

if (snap) {
  // the grid offset that puts the starts closest to it, judged on the circle of one step
  let sx = 0, sy = 0;
  for (const w of words) { const a = 2 * Math.PI * (w.start / step); sx += Math.cos(a); sy += Math.sin(a); }
  const offset = ((Math.atan2(sy, sx) / (2 * Math.PI)) * step + step) % step;
  // shift right so the grid starts at 0 (the beat's first downbeat), then round each start
  const shift = step - offset;
  let last = -Infinity;
  const starts = words.map(w => {
    let k = Math.round((w.start + shift) / step);
    if (k * step <= last + 1e-9) k = Math.round(last / step) + 1;   // never two words on one step
    last = k * step;
    return +(k * step).toFixed(4);
  });
  words.forEach((w, i) => {
    const length = Math.max(step, w.end - w.start);
    const next = i + 1 < words.length ? starts[i + 1] : Infinity;
    w.start = starts[i];
    w.end = +Math.min(starts[i] + length, next).toFixed(4);
  });
  console.log(`snapped ${words.length} words to the ${bpm} BPM 16th grid (moved by ${shift.toFixed(3)} s, then rounded)`);
}
words.forEach((w, i) => { if (i + 1 < words.length && !pauseAfter[i]) w.end = words[i + 1].start; });
const groups = 1 + pauseAfter.filter(Boolean).length;
const said = Math.max(...words.map(w => w.end)) - Math.min(...words.map(w => w.start));
console.log(`breaths: ${groups} (one every ${(said / groups).toFixed(1)} s); gaps under ${breath} s run on`);
const workScore = join(parts, 'score.json');
writeFileSync(workScore, JSON.stringify(score, null, 1));

// The beat (original). With --build it follows the rap: every 6.5 s (two half-time bars at the score's bpm) takes
// a level from the lead's syllables per second there: 0 no words (kick, 808, choir), 1 under 5.5
// (backbeat, 8th hats), 2 under 8 (accents, hats rolling in 16ths of the full bpm), 3 at 8 or more
// (doubled kick, snare fills, every hat, the bass jumping octaves). Before the first level-3 phrase
// after a slower one the beat drops out for a bar, the choir alone. Each head's sequencer lead-in is
// measured once from its first sound alone and skipped (render-heads' offset).
const half = bpm / 2;
const bar = 4 * 60 / half;                     // one half-time bar
const unit = 2 * bar;                          // one phrase of the beat
const end = Math.max(...words.map(w => w.end));
const span = end + bar;                        // the beat runs a bar past the last word
const units = Math.ceil(span / unit);
const rateAt = k => words.filter(w => w.start >= k * unit && w.start < (k + 1) * unit).reduce((n, w) => n + syllables(w.text), 0) / unit;
// without --build the beat is the same phrase throughout (level 2), as before
const level = Array.from({ length: units }, (_, k) => { if (!build) return 2; const r = rateAt(k); return r === 0 ? 0 : r < 5.5 ? 1 : r < 8 ? 2 : 3; });
const drop = level.map((l, k) => build && k + 1 < units && level[k + 1] === 3 && l < 3);
const wavStart = path => {
  const wav = readFileSync(path);
  let at = 12;
  while (at + 8 <= wav.length && wav.toString('ascii', at, at + 4) !== 'data') at += 8 + wav.readUInt32LE(at + 4);
  const rate = wav.readUInt32LE(24);
  let peak = 0;
  for (let k = at + 8; k + 1 < wav.length; k += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(k)));
  for (let k = at + 8; k + 1 < wav.length; k += 2) if (Math.abs(wav.readInt16LE(k)) > 0.25 * peak) return (k - at - 8) / 2 / rate;
  return 0;
};
// one phrase per level; kick, snare, bass in 16ths of the half-time bpm (32 = two bars), hats in 16ths of the full bpm (64)
const KIT = {
  Kick: [
    'B> . . . | . . . . | . . . . | . . . . | B> . . . | . . . . | . . . . | . . . .',
    'B> . . . | . . . B | . . B . | . . . . | B> . . . | . . . . | . B B . | . . . .',
    'B> . . . | . . . B | . . B> . | . . . . | B> . . . | . . . . | . B B> . | . . . B',
    'B> . B . | . . . B | B . B> . | . B . . | B> . B . | . . . B | B B B> . | B B B B',
  ],
  Snare: [
    '. . . . | . . . . | . . . . | . . . . | . . . . | . . . . | . . . . | . . . .',
    '. . . . | Pf . . . | . . . . | Pf . . . | . . . . | Pf . . . | . . . . | Pf . . .',
    '. . . . | Pf> . . . | . . . . | Pf> . . . | . . . . | Pf> . . . | . . . . | Pf> . K .',
    '. . . . | Pf> . . . | . . . . | Pf> . . K | . . . . | Pf> . . . | . . K . | Pf> K Pf> K',
  ],
  Hats: [
    Array(64).fill('.').join(' '),
    Array.from({ length: 64 }, (_, i) => (i % 4 === 0 ? 't' : '.')).join(' '),
    't t t t | t t t t | t t tss . | t t t t | t t t t | t . t t | t t t t | tss . t t | '.repeat(2).slice(0, -3),
    Array.from({ length: 64 }, (_, i) => (i % 8 === 4 ? 'tss>' : i % 2 === 0 ? 't>' : 't')).join(' '),
  ],
  // the 808 holds the low end (C minor roots, octave jumps when it's fastest)
  808: [
    'm:36> . . . | . . . . | . . . . | . . . . | m:34> . . . | . . . . | . . . . | . . . .',
    'm:36 . . . | . . . m:36 | . . m:39 . | . . . . | m:34 . . . | . . . m:34 | . . m:36 . | m:39 . . .',
    'm:36 . . . | . . . m:36 | . . m:39 . | . . . . | m:34 . . . | . . . m:34 | . . m:36 . | m:39 . . .',
    'm:36> . m:36 . | m:48 . m:36 . | m:39> . m:39 . | m:51 . m:39 . | m:34> . m:34 . | m:46 . m:34 . | m:36> . m:36 . | m:39 . m:43 .',
  ],
};
const rests = n => Array(n).fill('.');
const beatHeads = [
  { label: 'Kick', bpm: half, gain: 1.0 },
  { label: 'Snare', bpm: half, gain: 0.9 },
  { label: 'Hats', bpm, gain: 0.42 },
  { label: '808', bpm: half, gain: 1.0 },
];
const heads = [];
const leadIns = [];
// --beat: someone's sequence of the beat (sequence.mjs): its bass on the 808, its chords on the
// choir, looped under the performance (its busiest block where the rap is fastest); drums stay ours
let seqParts = null;
if (beatSource) {
  const seq = await loadSequence(beatSource, join(parts, 'sequence.pb'));
  const loops = findLoops(seq);
  const steps = Math.ceil(span / step);
  seqParts = arrange(seq, steps, k => (level[Math.floor((k * step) / unit)] === 3 ? loops.busy : loops.main), { bars: loops.bars });
  // the drop before the fastest part takes the 808 out too
  const bassSteps = seqParts.bass.split(' ').map((x, k) => { const u = Math.floor((k * step) / unit); return drop[u] && k * step - u * unit >= unit / 2 ? '.' : x; });
  seqParts.bass = bassSteps.join(' ');
  console.log(`sequence: ${seq.notes.length} notes at ${seq.bpm} BPM, played at ${bpm}; main loop bars ${loops.main + 1}-${loops.main + loops.bars}, busiest ${loops.busy + 1}-${loops.busy + loops.bars}`);
}
for (const h of beatHeads) {
  const dir = join(parts, h.label.toLowerCase());
  const tele = dir + '.tele';
  const phrases = KIT[h.label].map(p => p.split(/[\s|]+/).filter(Boolean));
  const steps = level.flatMap((l, k) => {
    const p = phrases[l];
    return drop[k] ? [...p.slice(0, p.length / 2), ...rests(p.length / 2)] : p;
  });
  if (h.label === '808') {
    // the modeled 808 (808.mjs): no sequencer, its first hit at exactly 0, a track for its panel
    const { samples, track } = seqParts ? render808(seqParts.bass, bpm, { decay: 0.7, drive: 1.5 }) : render808(steps.join(' '), h.bpm, { decay: 0.9, drive: 1.5 });
    writeWav(dir + '.wav', samples);
    writeFileSync(dir + '.json', JSON.stringify(track));
    leadIns.push(0);
    heads.push('--head', `${h.label}:${dir}.json:${dir}.wav:${h.gain}:0`);
    continue;
  }
  // the lead-in: its first sound alone, from silence
  const first = steps.find(x => x !== '.' && x !== '-') ?? phrases.flat().find(x => x !== '.');
  const probe = join(parts, h.label.toLowerCase() + '-leadin');
  if (spawnSync(chimera, ['render', 'beatbox', probe, `${first} . . .`, 'male', String(h.bpm), '1'], { stdio: 'ignore' }).status !== 0) throw new Error(`the ${h.label} lead-in probe failed`);
  const offset = Math.max(0, wavStart(join(probe, 'pattern.wav')));
  const r = spawnSync(chimera, ['render', 'beatbox', dir, steps.join(' '), 'male', String(h.bpm), '1', '--tele', tele], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error(`the ${h.label} head failed to render`);
  leadIns.push(offset);
  heads.push('--head', `${h.label}:${tele}:${join(dir, 'pattern.wav')}:${h.gain}:${offset.toFixed(4)}`);
}
// the choir (original): three heads singing a four-bar chord loop over the bass's C and Bb, one
// chord a bar, voices moving by step: Cm (G C Eb), Bb (F Bb D), Ab over C (Ab C Eb), Bb
const CHOIR = [
  { label: 'Tenor', body: 'male', notes: [55, 53, 56, 53], gain: 0.42 },
  { label: 'Alto', body: 'female', notes: [60, 58, 60, 58], gain: 0.4 },
  { label: 'Soprano', body: 'child', notes: [63, 62, 63, 62], gain: 0.34 },
];
CHOIR.forEach((v, i) => {
  const count = Math.ceil(span / bar);
  const notes = seqParts ? seqParts.melodies[i] : Array.from({ length: count }, (_, k) => [v.notes[k % v.notes.length], 4]);
  const sounding = notes.filter(([m]) => m > 0).length;
  if (!sounding) return;
  const melody = join(parts, v.label.toLowerCase() + '.json');
  const t0 = 0.3;
  writeFileSync(melody, JSON.stringify({ bpm: seqParts ? bpm : half, t0, lyrics: Array(sounding).fill('oo').join(' '), notes, vibrato: 0.12 }));
  const stem = join(parts, v.label.toLowerCase());
  const r = spawnSync(chimera, ['render', 'notes', melody, stem, v.body, '--tele', stem + '.tele'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error(`the ${v.label} head failed to render`);
  leadIns.push(t0);
  heads.push('--head', `${v.label}:${stem}.tele:${stem}.wav:${v.gain}:${t0}`);
});
console.log(`beat: ${half} BPM half-time over ${span.toFixed(1)} s; levels per 6.5 s: ${level.map((l, k) => (drop[k] ? l + 'v' : l)).join(' ')} (v = drop); lead-ins skipped: ${leadIns.map(x => x.toFixed(3)).join(', ')} s`);

const tool = threeD ? 'tools/performance/show-heads.mjs' : 'tools/performance/render-heads.mjs';
const r = spawnSync(process.execPath, [join(repo, tool), workScore, resolve(outputPath), ...heads, '--', ...rapArgs], { stdio: 'inherit' });
process.exit(r.status ?? 1);
