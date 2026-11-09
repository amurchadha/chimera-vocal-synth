// Small spectrum helpers for the offline instrument tests (kit, synth).

/** power spectrum of x[a .. a+n) (Hann window, zero-padded to a power of two); bin k is k*sr/N Hz */
export function powerSpectrum(x: ArrayLike<number>, a: number, n: number): { p: Float64Array; N: number } {
  let N = 1;
  while (N < n) N <<= 1;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < n; i++) re[i] = (x[a + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const ar = re[i + k + h] * cr - im[i + k + h] * ci, ai = re[i + k + h] * ci + im[i + k + h] * cr;
        re[i + k + h] = re[i + k] - ar; im[i + k + h] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  const p = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return { p, N };
}

/** spectral centroid (Hz) of x[a .. a+n) */
export function centroid(x: ArrayLike<number>, sr: number, a: number, n: number): number {
  const { p, N } = powerSpectrum(x, a, n);
  let num = 0, den = 0;
  for (let k = 1; k < p.length; k++) { num += p[k] * ((k * sr) / N); den += p[k]; }
  return num / den;
}

/** fraction of the power of x[a .. a+n) between lo and hi Hz */
export function bandFraction(x: ArrayLike<number>, sr: number, a: number, n: number, lo: number, hi: number): number {
  const { p, N } = powerSpectrum(x, a, n);
  let num = 0, den = 0;
  for (let k = 1; k < p.length; k++) {
    const f = (k * sr) / N;
    den += p[k];
    if (f >= lo && f < hi) num += p[k];
  }
  return num / den;
}

/** frequency (Hz) of the strongest bin between lo and hi Hz */
export function peakHz(x: ArrayLike<number>, sr: number, a: number, n: number, lo: number, hi: number): number {
  const { p, N } = powerSpectrum(x, a, n);
  let best = -1, bk = 0;
  for (let k = Math.ceil((lo * N) / sr); k <= Math.floor((hi * N) / sr); k++) if (p[k] > best) { best = p[k]; bk = k; }
  return (bk * sr) / N;
}

export const maxAbs = (s: ArrayLike<number>, a = 0, b = s.length) => {
  let m = 0;
  for (let i = Math.max(0, a); i < Math.min(s.length, b); i++) m = Math.max(m, Math.abs(s[i]));
  return m;
};

export const rms = (s: ArrayLike<number>, a = 0, b = s.length) => {
  let e = 0;
  const lo = Math.max(0, a), hi = Math.min(s.length, b);
  for (let i = lo; i < hi; i++) e += s[i] * s[i];
  return Math.sqrt(e / Math.max(1, hi - lo));
};
