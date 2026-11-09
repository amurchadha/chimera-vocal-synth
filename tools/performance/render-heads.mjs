// The performance video with a beat behind the lead: like render-new.mjs (the lead's sound and
// telemetry from `chimera render rap`), plus up to four more heads drawn small under the lyrics,
// each replayed from its own telemetry (`chimera render beatbox … --tele`) and mixed into the sound.
// usage: bun tools/performance/render-heads.mjs score.json out.mp4 --head Label:voice.tele:voice.wav [--head …] [--beat-gain g] [-- render rap options]
// The heads' files start at the score's time 0. Needs `bun run wasm` and `cargo build --release -p chimera-cli`.
import { mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { initChimera } from '../../src/wasm/chimera.ts';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash < 0 ? argv : argv.slice(0, dash);
const rapArgs = dash < 0 ? [] : argv.slice(dash + 1);
const heads = [];
let beatGain = 0.55;
const positional = [];
for (let i = 0; i < own.length; i++) {
  if (own[i] === '--head') {
    const [label, tele, wav] = (own[++i] ?? '').split(':');
    if (!label || !tele || !wav) throw new Error('--head needs Label:voice.tele:voice.wav');
    heads.push({ label, tele: resolve(tele), wav: resolve(wav) });
  } else if (own[i] === '--beat-gain') beatGain = Number(own[++i]);
  else positional.push(own[i]);
}
const [scorePath, outputPath] = positional;
if (!scorePath || !outputPath) throw new Error('usage: bun render-heads.mjs score.json out.mp4 --head Label:voice.tele:voice.wav [--head …] [--beat-gain g] [-- render rap options]');
if (heads.length > 4) throw new Error('at most four heads fit under the lyrics');
const repo = resolve(new URL('../..', import.meta.url).pathname);
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const fps = 25, sampleRate = 48000;

await initChimera(readFileSync(join(repo, 'src/wasm/chimera.wasm')));
const { VoiceModel } = await import('../../src/ui/analysis.ts');
const { TeleTrack } = await import('../../src/show/tele.ts');
const { createPicture } = await import('./picture.mjs');
const loadTrack = path => {
  const buf = readFileSync(path);
  return new TeleTrack(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const wavPeak = path => {
  const wav = readFileSync(path);
  let at = 12, peak = 0;
  while (at + 8 <= wav.length && wav.toString('ascii', at, at + 4) !== 'data') at += 8 + wav.readUInt32LE(at + 4);
  for (let k = at + 8; k + 1 < wav.length; k += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(k)) / 32768);
  return peak;
};

const score = JSON.parse(readFileSync(scorePath, 'utf8'));
const parent = dirname(resolve(outputPath));
const tmp = mkdtempSync(join(parent, '.chimera-heads-'));
let encoder;
try {
  const stem = join(tmp, 'voice');
  const r = spawnSync(join(repo, 'target/release/chimera'), ['render', 'rap', stem, resolve(scorePath), 'male', '--tele', stem + '.tele', ...rapArgs], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  if (r.status !== 0) throw new Error('chimera render rap failed');
  const track = loadTrack(stem + '.tele');
  const model = new VoiceModel(track.body, sampleRate);
  const extras = heads.map(h => {
    const t = loadTrack(h.tele);
    return { label: h.label, track: t, model: new VoiceModel(t.body, sampleRate) };
  });
  const captions = score.lines.flatMap(l => l.words).map((w, key) => ({ ...w, key }));
  const duration = track.duration;
  const count = Math.ceil(duration * fps);
  const picture = createPicture(model, score, captions, count / fps, extras);
  encoder = spawn(ffmpeg, ['-nostdin','-v','error','-f','rawvideo','-pix_fmt','rgba','-s','1280x720','-r',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','17','-pix_fmt','yuv420p', join(tmp,'silent.mp4')], { stdio: ['pipe','ignore','inherit'] });
  const closed = once(encoder, 'close');
  closed.catch(() => {});
  let writeError;
  encoder.stdin.on('error', e => { writeError = e; });
  for (let i = 0; i < count; i++) {
    const m = track.message(track.indexAt((i + 1) / fps));
    const pixels = picture(i, m.t, VoiceModel.articFromArray(m.t.artic));
    if (writeError || encoder.stdin.destroyed) throw writeError ?? new Error('Video encoder stopped.');
    await new Promise((done, fail) => encoder.stdin.write(pixels, e => e ? fail(e) : done()));
  }
  encoder.stdin.end();
  if ((await closed)[0] !== 0) throw new Error('Video encoding failed.');
  // the lead normalized as render-new.mjs does (peak 0.86); each head normalized the same, then
  // scaled by --beat-gain; all start at 0 and the mix is as long as the lead
  const leadPeak = wavPeak(stem + '.wav');
  if (!(leadPeak >= 1e-4)) throw new Error('The voice rendered silent.');
  const args = ['-nostdin','-v','error','-i',join(tmp,'silent.mp4'),'-i',stem + '.wav'];
  const parts = [`[1:a]volume=${(0.86 / leadPeak).toFixed(5)}[l]`];
  heads.forEach((h, k) => {
    args.push('-i', h.wav);
    const p = Math.max(1e-4, wavPeak(h.wav));
    parts.push(`[${k + 2}:a]volume=${(0.86 * beatGain / p).toFixed(5)}[h${k}]`);
  });
  const ins = ['[l]', ...heads.map((_, k) => `[h${k}]`)].join('');
  parts.push(`${ins}amix=inputs=${heads.length + 1}:duration=first:normalize=0,alimiter=limit=0.95:level=false[a]`);
  args.push('-filter_complex', parts.join(';'), '-map', '[a]');
  const movie = join(tmp,'final.mp4');
  args.push('-map','0:v:0','-c:v','copy','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',movie);
  const mux = spawnSync(ffmpeg,args,{stdio:'inherit'});
  if (mux.error || mux.status !== 0) throw mux.error ?? new Error('Audio mux failed.');
  renameSync(movie, resolve(outputPath));
  console.log('Rendered', count, 'frames with', heads.length, 'beat heads to', resolve(outputPath));
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill();
  rmSync(tmp, { recursive: true, force: true });
}
