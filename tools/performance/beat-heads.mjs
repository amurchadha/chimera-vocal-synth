// A rap score performed with a beat behind it, in one step: five heads (kick, snare, hats, a
// hummed bass, a sung pad) play an original half-time beat at the score's bpm for as long as the
// score runs, each recorded with its telemetry, then render-heads.mjs draws the lead and the five.
// --snap moves every word's start onto the 16th-note grid of the score's bpm first (one offset
// fitted for the whole score, then each start rounded), so a score whose timing drifts sits on
// the beat. The working files (the heads, the snapped score) go in <out>.parts/ and are kept.
// usage: bun tools/performance/beat-heads.mjs score.json out.mp4 [--snap] [-- render rap options]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash < 0 ? argv : argv.slice(0, dash);
const rapArgs = dash < 0 ? [] : argv.slice(dash + 1);
const snap = own.includes('--snap');
const [scorePath, outputPath] = own.filter(a => a !== '--snap');
if (!scorePath || !outputPath) throw new Error('usage: bun beat-heads.mjs score.json out.mp4 [--snap] [-- render rap options]');
const repo = resolve(new URL('../..', import.meta.url).pathname);
const chimera = join(repo, 'target/release/chimera');
const parts = resolve(outputPath) + '.parts';
mkdirSync(parts, { recursive: true });

const score = JSON.parse(readFileSync(scorePath, 'utf8'));
const bpm = Number(score.bpm) || 120;
const step = 60 / bpm / 4;
const words = score.lines.flatMap(l => l.words);

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
const workScore = join(parts, 'score.json');
writeFileSync(workScore, JSON.stringify(score, null, 1));

// The beat (original): a half-time groove at the score's bpm. Kick and snare accented, hats rolling
// in 16ths of the full bpm, a low hummed bass in C minor, and a pad singing a slow line over it.
// Each head's first hit comes late by its sequencer's lead-in; that lead-in is measured from its
// sound and skipped (render-heads' offset), so every head lands on the score's grid.
const half = bpm / 2;
const bar = 4 * 60 / half;                     // one half-time bar
const end = Math.max(...words.map(w => w.end));
const span = end + bar;                        // the beat runs a bar past the last word
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
const beatHeads = [
  { label: 'Kick', bpm: half, gain: 1.0, pattern: 'B> . . . | . . . B | . . B> . | . . . . | B> . . . | . . . . | . B B> . | . . . B' },
  { label: 'Snare', bpm: half, gain: 0.9, pattern: '. . . . | Pf> . . . | . . . . | Pf> . . . | . . . . | Pf> . . . | . . . . | Pf> . K .' },
  { label: 'Hats', bpm, gain: 0.42, pattern: 't t t t | t t t t | t t tss . | t t t t | t t t t | t . t t | t t t t | tss . t t' },
  { label: 'Bass', bpm: half, gain: 0.85, pattern: 'm:36 . . . | . . . m:36 | . . m:39 . | . . . . | m:34 . . . | . . . m:34 | . . m:36 . | m:39 . . .' },
];
const heads = [];
for (const h of beatHeads) {
  const dir = join(parts, h.label.toLowerCase());
  const tele = dir + '.tele';
  const steps = h.pattern.split(/[\s|]+/).filter(Boolean);
  const stepDur = 60 / h.bpm / 4;
  const repeats = Math.ceil(span / (steps.length * stepDur));
  const r = spawnSync(chimera, ['render', 'beatbox', dir, h.pattern, 'male', String(h.bpm), String(repeats), '--tele', tele], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error(`the ${h.label} head failed to render`);
  const wav = join(dir, 'pattern.wav');
  const firstHit = steps.findIndex(x => x !== '.' && x !== '-') * stepDur;
  const offset = Math.max(0, wavStart(wav) - firstHit);
  heads.push('--head', `${h.label}:${tele}:${wav}:${h.gain}:${offset.toFixed(4)}`);
}
// the pad: one sung note a bar (Eb4 D4 C4 Bb3 over the bass's C and Bb), repeated past the end
{
  const line = [63, 62, 60, 58];
  const count = Math.ceil(span / bar);
  const notes = Array.from({ length: count }, (_, i) => [line[i % line.length], 4]);
  const melody = join(parts, 'pad.json');
  writeFileSync(melody, JSON.stringify({ bpm: half, lyrics: notes.map(() => 'oo').join(' '), notes, vibrato: 0.1 }));
  const stem = join(parts, 'pad');
  const r = spawnSync(chimera, ['render', 'notes', melody, stem, 'female', '--tele', stem + '.tele'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error('the pad head failed to render');
  const offset = wavStart(stem + '.wav');
  heads.push('--head', `Pad:${stem}.tele:${stem}.wav:0.45:${offset.toFixed(4)}`);
}
console.log(`beat: ${half} BPM half-time over ${span.toFixed(1)} s, five heads (lead-ins skipped: ${heads.filter((_, i) => i % 2).map(h => h.split(':').at(-1)).join(', ')} s)`);

const r = spawnSync(process.execPath, [join(repo, 'tools/performance/render-heads.mjs'), workScore, resolve(outputPath), ...heads, '--', ...rapArgs], { stdio: 'inherit' });
process.exit(r.status ?? 1);
