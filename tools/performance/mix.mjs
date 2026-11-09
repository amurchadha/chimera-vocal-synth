// The performance mix, as an ffmpeg filter graph: the lead over a beat of heads, mixed like a
// produced track. Each head is treated by its role (from its label): the kick deepened and punched,
// the snare in a short room, the hats cleaned of low end, a bass kept low, a choir or pad washed in
// a long echo and ducked under the kick; the beat glued by a bus compressor and ducked a little
// under the lead so the words cut through; the lead cleaned below 70 Hz, lifted at 3 kHz and
// levelled. Every head is first normalized to its own peak, scaled by --beat-gain and its own gain,
// and its sequencer lead-in skipped (offset s).
// usage (from render-heads.mjs / show-heads.mjs):
//   const { filter, label } = mixGraph({ lead: { index, peak }, heads: [{ index, label, gain, offset, peak }], beatGain })
//   ffmpeg … -filter_complex filter -map `[${label}]` …

/** a head's role in the mix, from its label */
export function roleOf(label) {
  const l = label.toLowerCase();
  if (/808/.test(l)) return '808';
  if (/drums|kit/.test(l)) return 'kit';
  if (/riff|synth|lead synth/.test(l)) return 'riff';
  if (/kick/.test(l)) return 'kick';
  if (/snare|clap|rim/.test(l)) return 'snare';
  if (/hat|cymbal/.test(l)) return 'hats';
  if (/bass/.test(l)) return 'bass';
  if (/choir|pad|tenor|alto|soprano|bari|voice/.test(l)) return 'choir';
  return 'other';
}

const TREAT = {
  kick: 'equalizer=f=60:t=q:w=1.1:g=6,equalizer=f=380:t=q:w=1.2:g=-4,acompressor=threshold=0.3:ratio=4:attack=3:release=90:makeup=1.4',
  snare: 'highpass=f=140,equalizer=f=220:t=q:w=1:g=2,aecho=0.8:0.55:23|41|67:0.32|0.24|0.16',
  hats: 'highpass=f=450,equalizer=f=9000:t=q:w=1:g=3',
  bass: 'lowpass=f=480',
  '808': 'lowpass=f=320,acompressor=threshold=0.4:ratio=3:attack=5:release=150:makeup=1.2',
  choir: 'highpass=f=140,aecho=0.8:0.7:61|113|167|241:0.36|0.28|0.22|0.15',
  // a whole drum kit (kit.mjs): glued a little, no EQ (its sounds are already shaped)
  kit: 'acompressor=threshold=0.35:ratio=2.5:attack=8:release=100:makeup=1.1',
  riff: 'highpass=f=180,aecho=0.8:0.4:83|167:0.18|0.1',
  other: 'anull',
};

export function mixGraph({ lead, heads, beatGain = 0.55 }) {
  const g = [];
  const n = x => x.toFixed(5);
  // the choir pumps under the kick, or under the whole kit when a kit plays the drums
  const keyRole = heads.some(h => roleOf(h.label) === 'kit') ? 'kit' : 'kick';
  const hasKey = heads.some(h => roleOf(h.label) === keyRole) && heads.some(h => roleOf(h.label) === 'choir');
  // the lead: level, clean, presence, levelled; a copy keys the beat's ducking
  g.push(`[${lead.index}:a]volume=${n(0.86 / lead.peak)},highpass=f=70,equalizer=f=3000:t=q:w=1.2:g=2.5,acompressor=threshold=0.25:ratio=3:attack=5:release=60:makeup=1.25,asplit=2[lead][leadkey]`);
  const beat = [];
  const choirs = [];
  heads.forEach((h, k) => {
    const role = roleOf(h.label);
    const trim = h.offset > 0 ? `atrim=start=${h.offset.toFixed(4)},asetpts=PTS-STARTPTS,` : '';
    const level = `volume=${n((0.86 * beatGain * h.gain) / Math.max(1e-4, h.peak))}`;
    if (role === keyRole && hasKey) {
      g.push(`[${h.index}:a]${trim}${level},${TREAT[role]},asplit=2[b${k}][kickkey]`);
      beat.push(`[b${k}]`);
    } else if (role === 'choir' && hasKey) {
      g.push(`[${h.index}:a]${trim}${level},${TREAT.choir}[c${k}]`);
      choirs.push(`[c${k}]`);
    } else {
      g.push(`[${h.index}:a]${trim}${level},${TREAT[role]}[b${k}]`);
      beat.push(`[b${k}]`);
    }
  });
  if (choirs.length) {
    // the choir sung together, then ducked under each kick (the pump of a produced track)
    g.push(`${choirs.join('')}amix=inputs=${choirs.length}:duration=longest:normalize=0[choir]`);
    g.push('[choir][kickkey]sidechaincompress=threshold=0.08:ratio=4:attack=5:release=220[choird]');
    beat.push('[choird]');
  }
  if (!beat.length) {
    g.push('[lead]alimiter=limit=0.95:level=false[mix]');
    g.push('[leadkey]anullsink');
    return { filter: g.join(';'), label: 'mix' };
  }
  // the beat bus: glued, then ducked a little under the lead
  g.push(`${beat.join('')}amix=inputs=${beat.length}:duration=longest:normalize=0,acompressor=threshold=0.2:ratio=2.5:attack=10:release=120:makeup=1.2[bus]`);
  g.push('[bus][leadkey]sidechaincompress=threshold=0.12:ratio=2:attack=15:release=180[beat]');
  g.push('[lead][beat]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false[mix]');
  return { filter: g.join(';'), label: 'mix' };
}
