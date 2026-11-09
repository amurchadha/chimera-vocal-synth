// A rap score performed with a beat behind it, in one step: four beatbox heads (kick, snare,
// hats, hummed bass) play a half-time beat at the score's bpm for as long as the score runs,
// each recorded with its telemetry, then render-heads.mjs draws the lead and the four heads.
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

// the beat: half-time at the score's bpm, two bars of pattern repeated past the last word
const half = bpm / 2;
const bar = 4 * 60 / half;
const end = Math.max(...words.map(w => w.end));
const repeats = Math.ceil((end + bar) / (2 * bar));
const kit = {
  Kick: 'B . . . | . . . B | . . B . | . . . . | B . . . | . . . . | . B B . | . . . .',
  Snare: '. . . . | Pf . . . | . . . . | Pf . . . | . . . . | Pf . . . | . . . . | Pf . . K',
  Hats: 't . t . | t . t . | t . t . | t . t t | t . t . | t . tss . | t . t . | t t t .',
  Bass: 'm:40 . . . | . . . m:40 | . . m:43 . | . . . . | m:38 . . . | . . . m:38 | . . m:41 . | m:43 . . .',
};
const heads = [];
for (const [label, pattern] of Object.entries(kit)) {
  const dir = join(parts, label.toLowerCase());
  const tele = dir + '.tele';
  const r = spawnSync(chimera, ['render', 'beatbox', dir, pattern, 'male', String(half), String(repeats), '--tele', tele], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error(`the ${label} head failed to render`);
  heads.push('--head', `${label}:${tele}:${join(dir, 'pattern.wav')}`);
}
console.log(`beat: ${half} BPM half-time, ${repeats * 2} bars, four heads`);

const r = spawnSync(process.execPath, [join(repo, 'tools/performance/render-heads.mjs'), workScore, resolve(outputPath), ...heads, '--', ...rapArgs], { stdio: 'inherit' });
process.exit(r.status ?? 1);
