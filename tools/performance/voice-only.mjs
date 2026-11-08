// The performance renderer's voice alone (no picture): the same TypeScript engine, the same
// scheduling and the same normalization as render.mjs, written to a WAV. For comparing the old
// voice with `chimera render rap` on one score.
// usage: CHIMERA_TS_ENGINE=… bun tools/performance/voice-only.mjs score.json out.wav
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createVoice, fps, sampleRate } from './voice.mjs';

const [scorePath, outputPath] = process.argv.slice(2);
if (!scorePath || !outputPath || !process.env.CHIMERA_TS_ENGINE) {
  throw new Error('Set CHIMERA_TS_ENGINE, then run: bun voice-only.mjs score.json out.wav');
}
const score = JSON.parse(readFileSync(scorePath, 'utf8'));
const state = await createVoice(resolve(process.env.CHIMERA_TS_ENGINE), score);
const count = Math.ceil(state.duration * fps), samplesPerFrame = sampleRate / fps;
const samples = new Float32Array(count * samplesPerFrame);
let plan = 0;
for (let i = 0; i < count; i++) {
  while (plan < state.plans.length && state.plans[plan].segments[0].t0 < i / fps + .4) state.voice.schedule(state.plans[plan++].gestures);
  const end = (i + 1) * samplesPerFrame;
  for (let k = i * samplesPerFrame; k < end; k += 128) state.voice.render(samples, k, Math.min(128, end - k));
}
let peak = 0;
for (const s of samples) peak = Math.max(peak, Math.abs(s));
if (!(peak >= 1e-4)) throw new Error('The voice rendered silent or non-finite.');
for (let i = 0; i < samples.length; i++) samples[i] *= .86 / peak;
state.writeWav(resolve(outputPath), [samples], sampleRate);
console.log('wrote', resolve(outputPath));
