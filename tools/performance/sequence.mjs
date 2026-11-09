// A beat's notes from someone's sequence, for the heads to play: an Online Sequencer link
// (onlinesequencer.net/<id>, its notes fetched as the site's own player fetches them) or a notes
// file ({ "bpm", "notes": [{ "midi", "time", "length" }] }, time and length in 16ths). The notes are
// split by register: the low ones (under --split, MIDI 48 = C3) are the bass line, for the 808;
// the rest are voiced onto three singers (the lowest, the middle and the highest note sounding at
// each onset) for the choir. A transcription of the song itself (transcribe-beat.py: notes with a
// `part`, `song: true`) also has its drums, and plays where the song does (beat-heads maps each
// section of the score to its place in the song). Any other sequence is looped under the performance: its main loop (the 8
// bars, on a 4-bar line, where its most frequent bar recurs most) wherever the beat isn't at its fastest, and its busiest 8-bar
// block where it is, both at the performance's bpm.
import { readFileSync, writeFileSync } from 'node:fs';

/** protobuf wire format, enough for Online Sequencer's Sequence message */
function* fields(b) {
  let i = 0;
  const varint = () => { let r = 0, s = 0, c; do { c = b[i++]; r += (c & 0x7f) * 2 ** s; s += 7; } while (c >= 0x80); return r; };
  while (i < b.length) {
    const key = varint(), f = Math.floor(key / 8), w = key & 7;
    if (w === 0) yield [f, varint()];
    else if (w === 5) { yield [f, new DataView(b.buffer, b.byteOffset + i, 4).getFloat32(0, true)]; i += 4; }
    else if (w === 1) { yield [f, new DataView(b.buffer, b.byteOffset + i, 8).getFloat64(0, true)]; i += 8; }
    else if (w === 2) { const n = varint(); yield [f, b.subarray(i, i + n)]; i += n; }
    else throw new Error(`unsupported protobuf wire type ${w}`);
  }
}

/** Online Sequencer's Sequence: settings (1: bpm), notes (2: type = semitones from C0, time, length, instrument, volume) */
export function decodeOnlineSequencer(bytes) {
  let bpm = 110;
  const notes = [];
  for (const [f, v] of fields(bytes)) {
    if (f === 1) for (const [g, x] of fields(v)) { if (g === 1) bpm = x; }
    if (f === 2) {
      const n = { midi: 12, time: 0, length: 0, instrument: 0 };
      for (const [g, x] of fields(v)) {
        if (g === 1) n.midi = 12 + x;
        else if (g === 2) n.time = x;
        else if (g === 3) n.length = x;
        else if (g === 4) n.instrument = x;
      }
      notes.push(n);
    }
  }
  return { bpm, notes };
}

/** a sequence from a link or a file; a fetched link is saved beside the working files */
export async function loadSequence(source, saveTo) {
  const id = /onlinesequencer\.net\/(\d+)/.exec(source)?.[1];
  if (id) {
    const r = await fetch(`https://onlinesequencer.net/app/api/get_proto.php?v=2&id=${id}&r=1`, { headers: { 'User-Agent': 'chimera-beat-heads' } });
    if (!r.ok) throw new Error(`onlinesequencer ${id}: ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (saveTo) writeFileSync(saveTo, bytes);
    return decodeOnlineSequencer(bytes);
  }
  if (source.endsWith('.pb')) return decodeOnlineSequencer(new Uint8Array(readFileSync(source)));
  return JSON.parse(readFileSync(source, 'utf8'));
}

/** the main loop (the 8 bars, on a 4-bar line, holding the most common bar most often) and the busiest 8-bar block */
export function findLoops(seq, bars = 8) {
  const total = Math.ceil(Math.max(...seq.notes.map(n => n.time + n.length)) / 16);
  const inBar = Array.from({ length: total }, () => []);
  for (const n of seq.notes) inBar[Math.min(total - 1, Math.floor(n.time / 16))].push(`${n.midi}@${(n.time % 16).toFixed(2)}`);
  const sig = inBar.map(x => x.sort().join(','));
  const count = new Map();
  sig.forEach(k => k && count.set(k, (count.get(k) ?? 0) + 1));
  const common = [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  // on a phrase line (every 4 bars), the 8 bars holding that bar most often
  let main = 0, best = -1;
  for (let b = 0; b + bars <= total; b += 4) {
    const n = sig.slice(b, b + bars).filter(k => k === common).length;
    if (n > best) { best = n; main = b; }
  }
  let busy = 0, most = -1;
  for (let b = 0; b + bars <= total; b++) {
    const n = inBar.slice(b, b + bars).reduce((s, x) => s + x.length, 0);
    if (n > most) { most = n; busy = b; }
  }
  return { main, busy, bars };
}

const fit = (m, lo, hi) => { while (m > hi) m -= 12; while (m < lo) m += 12; return m; };

// a transcription's drum parts: the head that plays each and its sound (beatbox tokens)
const DRUM = { kick: ['Kick', 'B'], snare: ['Snare', 'Pf'], ghost: ['Snare', 'K'], hats: ['Hats', 't'], open: ['Hats', 'tss'] };

/**
 * The beat's parts over `steps` 16ths of the performance: for each step, the step of the sequence
 * that plays there (`sourceAt(step)`, null for none), then the bass as an 808 pattern (one token a
 * 16th), three choir melodies ([midi, beats] at the performance's bpm, rests 0) and, when the
 * sequence has drum parts (a transcription: notes with `part`), the drum heads' patterns and the
 * hits for the kit panel. Without parts, the register decides: under `split` is bass, the rest chords.
 */
export function arrange(seq, steps, sourceAt, { split = 48 } = {}) {
  const at = new Map();
  for (const n of seq.notes) {
    const s = Math.round(n.time);
    if (!at.has(s)) at.set(s, []);
    at.get(s).push(n);
  }
  const parted = seq.notes.some(n => n.part);
  const isBass = n => (parted ? n.part === 'bass' : n.midi < split);
  const isChord = n => (parted ? n.part === 'chord' : n.midi >= split);
  const drums = parted && seq.notes.some(n => DRUM[n.part]) ? { Kick: [], Snare: [], Hats: [] } : null;
  const hits = [];
  const bass = [];
  const voices = [[], [], []];          // tenor, alto, soprano: [start step, midi, length]
  for (let k = 0; k < steps; k++) {
    const src = sourceAt(k);
    const ns = src == null || src < 0 ? [] : at.get(src) ?? [];
    const low = ns.filter(isBass).sort((a, b) => a.midi - b.midi);
    bass.push(low.length ? `m:${fit(low[0].midi, 28, 43)}${k % 16 === 0 || low[0].accent ? '>' : ''}` : '.');
    if (drums) {
      for (const h of Object.values(drums)) h.push('.');
      for (const n of ns) {
        const d = DRUM[n.part];
        if (!d || (n.part === 'ghost' && drums[d[0]][k] !== '.')) continue;
        drums[d[0]][k] = d[1] + (n.accent ? '>' : '');
        hits.push({ step: k, part: n.part, accent: !!n.accent });
      }
    }
    const up = ns.filter(isChord).sort((a, b) => a.midi - b.midi);
    if (!up.length) continue;
    const pick = [up[0], up[Math.floor((up.length - 1) / 2)], up[up.length - 1]];
    const range = [[48, 64], [55, 72], [62, 79]];
    pick.forEach((n, v) => voices[v].push([k, fit(n.midi, ...range[v]), Math.max(1, Math.round(n.length))]));
  }
  // each voice as a melody: a note lasts its length or until the voice's next note
  const melodies = voices.map(list => {
    const notes = [];
    let t = 0;
    list.forEach(([start, midi, length], i) => {
      if (start > t) notes.push([0, (start - t) / 4]);
      const next = i + 1 < list.length ? list[i + 1][0] : steps;
      const d = Math.max(1, Math.min(length, next - start));
      notes.push([midi, d / 4]);
      t = start + d;
    });
    return notes;
  });
  return { bass: bass.join(' '), melodies, drums: drums && Object.fromEntries(Object.entries(drums).map(([h, x]) => [h, x.join(' ')])), hits };
}

/**
 * Where each section of a score sits in the song: the offset (song time minus score time) most
 * words agree on, a word agreeing when the song's vocal (Whisper words, [{w, s}]) has the same word
 * within 0.25 s of it. A hook sung several times takes the take most words agree with.
 */
export function songOffset(words, songWords) {
  const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]/g, '');
  const by = new Map();
  for (const w of songWords) {
    const k = norm(w.w ?? w.text);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(w.s ?? w.start);
  }
  const d = words.flatMap(w => (by.get(norm(w.text)) ?? []).map(s => s - w.start));
  if (!d.length) return null;
  const bins = new Map();
  for (const x of d) bins.set(Math.round(x / 0.25), (bins.get(Math.round(x / 0.25)) ?? 0) + 1);
  let peak = 0, most = -1;
  for (const [b] of bins) {
    const n = (bins.get(b - 1) ?? 0) + bins.get(b) + (bins.get(b + 1) ?? 0);
    if (n > most) { most = n; peak = b * 0.25; }
  }
  const near = d.filter(x => Math.abs(x - peak) < 0.5).sort((a, b) => a - b);
  return { offset: near[near.length >> 1], agree: near.length, of: words.length };
}
