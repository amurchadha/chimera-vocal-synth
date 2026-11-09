// A rap score and its beat heads as a 3D show on the duet page, captured to video: the lead (from
// `chimera render rap`) large on the left with its words at the mouth, each beat head beside it,
// all replayed from their telemetry by the duet page (?show=<id>) and recorded frame-exact by
// tools/duet-video.ts on this machine's GPU.
// usage: bun tools/performance/show-heads.mjs score.json out.mp4 --head Label:voice.tele:voice.wav[:gain[:offset s]] [--head …]
//        [--panel Label:hits.json[:kit[:sound.wav[:gain]]]]
//        [--beat-gain g] [--fps 25] [--workers 4] [--no-video] [-- render rap options]
// The show goes in public/shows/<out's name>/ (gitignored: shows are often of songs we can't publish).
// offset: seconds of a head's start to skip (sound and picture), so a late first hit lands on time.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mixGraph } from './mix.mjs';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash < 0 ? argv : argv.slice(0, dash);
const rapArgs = dash < 0 ? [] : argv.slice(dash + 1);
const heads = [];
const panels = [];
let beatGain = 0.55, fps = '25', workers = '4', video = true;
const positional = [];
for (let i = 0; i < own.length; i++) {
  const a = own[i];
  if (a === '--head') {
    const [label, tele, wav, gain = '1', offset = '0'] = (own[++i] ?? '').split(':');
    if (!label || !tele || !wav) throw new Error('--head needs Label:voice.tele:voice.wav[:gain[:offset s]]');
    heads.push({ label, tele: resolve(tele), wav: resolve(wav), gain: Number(gain), offset: Number(offset) });
  } else if (a === '--panel') {
    // an instrument panel (the drum kit: a hit list .json), with its sound if it has one
    const [label, json, kind = 'kit', wav = '', gain = '1'] = (own[++i] ?? '').split(':');
    if (!label || !json) throw new Error('--panel needs Label:hits.json[:kind[:sound.wav[:gain]]]');
    panels.push({ label, json: resolve(json), kind, wav: wav ? resolve(wav) : '', gain: Number(gain) });
  } else if (a === '--beat-gain') beatGain = Number(own[++i]);
  else if (a === '--fps') fps = own[++i];
  else if (a === '--workers') workers = own[++i];
  else if (a === '--no-video') video = false;
  else positional.push(a);
}
const [scorePath, outputPath] = positional;
if (!scorePath || !outputPath) throw new Error('usage: bun show-heads.mjs score.json out.mp4 --head Label:tele:wav[:gain[:offset]] … [-- render rap options]');
if (heads.length + panels.length > 8) throw new Error('at most eight heads and panels fit beside the lead');
const repo = resolve(new URL('../..', import.meta.url).pathname);
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const id = basename(outputPath).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-');
const dir = join(repo, 'public/shows', id);
mkdirSync(dir, { recursive: true });

const wavPeak = path => {
  const wav = readFileSync(path);
  let at = 12, peak = 0;
  while (at + 8 <= wav.length && wav.toString('ascii', at, at + 4) !== 'data') at += 8 + wav.readUInt32LE(at + 4);
  for (let k = at + 8; k + 1 < wav.length; k += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(k)) / 32768);
  return peak;
};

// the lead, with its telemetry
const score = JSON.parse(readFileSync(scorePath, 'utf8'));
const lead = join(dir, 'lead');
const r = spawnSync(join(repo, 'target/release/chimera'), ['render', 'rap', lead, resolve(scorePath), 'male', '--tele', lead + '.tele', ...rapArgs], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
if (r.status !== 0) throw new Error('chimera render rap failed');
const leadPeak = wavPeak(lead + '.wav');
if (!(leadPeak >= 1e-4)) throw new Error('The voice rendered silent.');

// the mix (mix.mjs): the lead and each head treated by its role, the beat glued and ducked under the lead
const sounding = [...heads, ...panels.filter(p => p.wav).map(p => ({ label: p.label, wav: p.wav, gain: p.gain, offset: 0 }))];
const args = ['-nostdin', '-v', 'error', '-y', '-i', lead + '.wav', ...sounding.flatMap(h => ['-i', h.wav])];
const graph = mixGraph({ lead: { index: 0, peak: leadPeak }, heads: sounding.map((h, k) => ({ ...h, index: k + 1, peak: wavPeak(h.wav) })), beatGain });
args.push('-filter_complex', graph.filter, '-map', `[${graph.label}]`, '-c:a', 'aac', '-b:a', '192k', join(dir, 'mix.m4a'));
const mix = spawnSync(ffmpeg, args, { stdio: 'inherit' });
if (mix.status !== 0) throw new Error('the mix failed');

// the lead's words at its mouth, and the show
const words = score.lines.flatMap(l => l.words).map(w => ({ text: String(w.text ?? '').replace(/[^\p{L}\p{N}'-]+$/u, ''), start: w.start, end: w.end }));
writeFileSync(join(dir, 'words.json'), JSON.stringify(words));
const voices = [{ name: 'Lead', tele: 'lead.tele', words: 'words.json' }];
heads.forEach(h => {
  // a head's telemetry, or the 808's track (a .json from 808.mjs): drawn as its panel
  const drum = h.tele.endsWith('.json');
  const file = h.label.toLowerCase() + (drum ? '.json' : '.tele');
  copyFileSync(h.tele, join(dir, file));
  voices.push({ name: h.label, tele: file, ...(drum ? { kind: '808' } : {}), ...(h.offset > 0 ? { offset: +h.offset.toFixed(4) } : {}) });
});
// the instrument panels first among the band, so the kit sits next to the lead
for (const p of panels) {
  const file = p.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
  copyFileSync(p.json, join(dir, file));
  voices.splice(1, 0, { name: p.label, tele: file, kind: p.kind });
}
const bpm = Number(score.bpm) || 120;
writeFileSync(join(dir, 'show.json'), JSON.stringify({ title: score.title ?? id, audio: 'mix.m4a', bpm: bpm / 2, downbeat: 0, layout: 'lead', voices }, null, 1));
console.log(`show ${id}: public/shows/${id}/ (lead + ${heads.length} heads${panels.length ? ` + ${panels.map(p => p.label).join(', ')}` : ''})`);
if (!video) process.exit(0);

// capture: the app served from this checkout (vite's dev server serves public/ as it is), then
// tools/duet-video.ts on the GPU; frames go under TMPDIR (point it at a roomy disk)
// a free port of our own, so two captures at once don't share (and lose) one server
const port = await new Promise((done, fail) => { const t = createServer(); t.once('error', fail); t.listen(0, '127.0.0.1', () => { const { port } = t.address(); t.close(() => done(port)); }); });
const server = spawn(join(repo, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: repo, stdio: 'ignore' });
try {
  const url = `http://127.0.0.1:${port}/`;
  for (let k = 0; ; k++) {
    try { if ((await fetch(`${url}shows/${id}/show.json`)).ok) break; } catch {}
    if (k > 120) throw new Error('the app server did not start');
    await new Promise(done => setTimeout(done, 500));
  }
  const cap = spawnSync(process.execPath, [join(repo, 'tools/duet-video.ts'), id, resolve(outputPath), '--url', url, '--fps', fps, '--workers', workers], { cwd: repo, stdio: 'inherit' });
  if (cap.status !== 0) throw new Error('the capture failed');
} finally {
  server.kill();
}
