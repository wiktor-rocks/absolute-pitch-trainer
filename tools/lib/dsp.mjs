// Small offline DSP toolkit: mixing, RMS, trimming, fades, high-quality resampling.

export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-12));

export function mixdown(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

export function rms(x, start = 0, end = x.length) {
  let s = 0;
  for (let i = start; i < end; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, end - start));
}

export function peak(channels) {
  let p = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]));
  return p;
}

/** Frame-wise RMS envelope (dB). */
export function envelopeDb(x, frame) {
  const n = Math.floor(x.length / frame);
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) env[f] = gainToDb(rms(x, f * frame, (f + 1) * frame));
  return env;
}

/** Index of first sample that crosses `rel` * peak, backed off by `preMs`. */
export function findOnset(x, sr, { rel = 0.08, preMs = 4, searchMs = 700, activityDb = -50 } = {}) {
  // first sign of activity, then the peak shortly after it (ignores later noise spikes)
  const act = dbToGain(activityDb);
  let first = 0;
  while (first < x.length && Math.abs(x[first]) < act) first++;
  if (first >= x.length) first = 0;
  let p = 0;
  const lim = Math.min(x.length, first + Math.round((searchMs / 1000) * sr));
  for (let i = first; i < lim; i++) p = Math.max(p, Math.abs(x[i]));
  const thr = p * rel;
  for (let i = first; i < x.length; i++) {
    if (Math.abs(x[i]) >= thr) return Math.max(0, i - Math.round((preMs / 1000) * sr));
  }
  return 0;
}

export function slice(channels, start, len) {
  return channels.map((ch) => {
    const out = new Float32Array(len);
    out.set(ch.subarray(start, Math.min(ch.length, start + len)));
    return out;
  });
}

/** Apply fade-in (ms) and raised-cosine fade-out (ms) in place. */
export function fade(channels, sr, inMs, outMs) {
  const nin = Math.round((inMs / 1000) * sr);
  const nout = Math.round((outMs / 1000) * sr);
  for (const ch of channels) {
    const n = ch.length;
    for (let i = 0; i < nin && i < n; i++) ch[i] *= i / nin;
    for (let i = 0; i < nout && i < n; i++) {
      const g = 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / nout));
      ch[n - nout + i] *= g;
    }
  }
  return channels;
}

export function scale(channels, g) {
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return channels;
}

/**
 * Pitch shift by resampling (changes duration slightly). ratio > 1 raises pitch.
 * Windowed-sinc (Kaiser) interpolation, anti-aliased when raising.
 */
export function resamplePitch(channels, ratio, taps = 32) {
  if (Math.abs(ratio - 1) < 1e-7) return channels;
  const cutoff = Math.min(1, 1 / ratio) * 0.97;
  const beta = 8.6;
  const i0 = (x) => { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; };
  const i0b = i0(beta);
  const RES = 512;
  const table = new Float64Array(taps * RES + 2);
  for (let j = 0; j < table.length; j++) {
    const d = j / RES;
    table[j] = d >= taps ? 0 : i0(beta * Math.sqrt(1 - (d / taps) ** 2)) / i0b;
  }
  const win = (d) => {
    const a = Math.abs(d) * RES;
    const j = Math.floor(a);
    if (j >= table.length - 1) return 0;
    const fr = a - j;
    return table[j] * (1 - fr) + table[j + 1] * fr;
  };
  return channels.map((x) => {
    const outLen = Math.floor(x.length / ratio);
    const y = new Float32Array(outLen);
    for (let n = 0; n < outLen; n++) {
      const t = n * ratio;
      const c = Math.floor(t);
      let acc = 0;
      for (let k = -taps + 1; k <= taps; k++) {
        const idx = c + k;
        if (idx < 0 || idx >= x.length) continue;
        const d = t - idx;
        const w = win(d);
        const arg = Math.PI * d * cutoff;
        const sinc = Math.abs(arg) < 1e-9 ? 1 : Math.sin(arg) / arg;
        acc += x[idx] * cutoff * sinc * w;
      }
      y[n] = acc;
    }
    return y;
  });
}
