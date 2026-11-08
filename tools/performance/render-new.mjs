// The performance video with the current engine's voice: `chimera render rap` makes the sound
// and records the voice's telemetry (--tele), and the same picture as render.mjs is drawn from
// that recording with the current app's vocal-tract model (the wasm build), so the tract moves
// exactly as the engine did for the sound.
// usage: bun tools/performance/render-new.mjs score.json out.mp4 [aligned-backing.wav] [-- render rap options]
// Needs `bun run wasm` (src/wasm/chimera.wasm) and `cargo build --release -p chimera-cli`.
import { mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { initChimera } from '../../src/wasm/chimera.ts';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const [scorePath, outputPath, backingPath] = dash < 0 ? argv : argv.slice(0, dash);
const rapArgs = dash < 0 ? [] : argv.slice(dash + 1);
if (!scorePath || !outputPath) throw new Error('usage: bun render-new.mjs score.json output.mp4 [aligned-backing.wav] [-- render rap options]');
const repo = resolve(new URL('../..', import.meta.url).pathname);
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const fps = 25, sampleRate = 48000;

await initChimera(readFileSync(join(repo, 'src/wasm/chimera.wasm')));
const { VoiceModel } = await import('../../src/ui/analysis.ts');
const { TeleTrack } = await import('../../src/show/tele.ts');
const { createPicture } = await import('./picture.mjs');

const score = JSON.parse(readFileSync(scorePath, 'utf8'));
const parent = dirname(resolve(outputPath));
const tmp = mkdtempSync(join(parent, '.chimera-render-'));
let encoder;
try {
  const stem = join(tmp, 'voice');
  const r = spawnSync(join(repo, 'target/release/chimera'), ['render', 'rap', stem, resolve(scorePath), 'male', '--tele', stem + '.tele', ...rapArgs], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  if (r.status !== 0) throw new Error('chimera render rap failed');
  process.stdout.write(r.stdout.split('\n').filter(l => l.startsWith('too fast')).map(l => l + '\n').join(''));
  const buf = readFileSync(stem + '.tele');
  const track = new TeleTrack(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const model = new VoiceModel(track.body, sampleRate);
  const captions = score.lines.flatMap(l => l.words).map((w, key) => ({ ...w, key }));
  const duration = track.duration;
  const count = Math.ceil(duration * fps);
  const picture = createPicture(model, score, captions, count / fps);
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
  // the voice normalized as render.mjs does (peak 0.86), then muxed, over the backing if given
  const wav = readFileSync(stem + '.wav');
  let at = 12, peak = 0;
  while (at + 8 <= wav.length && wav.toString('ascii', at, at + 4) !== 'data') at += 8 + wav.readUInt32LE(at + 4);
  for (let k = at + 8; k + 1 < wav.length; k += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(k)) / 32768);
  if (!(peak >= 1e-4)) throw new Error('The voice rendered silent.');
  const args = ['-nostdin','-v','error','-i',join(tmp,'silent.mp4'),'-i',stem + '.wav'];
  const norm = `[1:a]volume=${(0.86 / peak).toFixed(5)}[v]`;
  if (backingPath) args.push('-i',resolve(backingPath),'-filter_complex',norm + ';[2:a]volume=0.27[bed];[v][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false[a]','-map','[a]');
  else args.push('-filter_complex',norm,'-map','[v]');
  const movie = join(tmp,'final.mp4');
  args.push('-map','0:v:0','-c:v','copy','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',movie);
  const mux = spawnSync(ffmpeg,args,{stdio:'inherit'});
  if (mux.error || mux.status !== 0) throw mux.error ?? new Error('Audio mux failed.');
  renameSync(movie, resolve(outputPath));
  console.log('Rendered', count, 'frames to', resolve(outputPath));
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill();
  rmSync(tmp, { recursive: true, force: true });
}
