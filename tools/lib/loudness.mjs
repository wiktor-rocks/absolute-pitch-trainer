// Perceptual loudness after ITU-R BS.1770 (K-weighting), computed for short notes.
// We use the *maximum momentary loudness* (400 ms window, 10 ms hop): for isolated notes this
// tracks perceived loudness far better than whole-file RMS, especially for decaying sounds
// (piano, guitar, harpsichord) versus sustained ones (winds, strings, square wave).

function biquad(b, a) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// BS.1770 stage filters, designed for any sample rate (same derivation as pyloudnorm).
function highShelf(sr, f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196) {
  const K = Math.tan((Math.PI * f0) / sr);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  return biquad(
    [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  );
}
function highPass(sr, f0 = 38.13547087602444, Q = 0.5003270373238773) {
  const K = Math.tan((Math.PI * f0) / sr);
  const a0 = 1 + K / Q + K * K;
  return biquad([1, -2, 1], [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]);
}

/** K-weighted copy of each channel. */
export function kWeight(channels, sr) {
  return channels.map((ch) => {
    const hs = highShelf(sr), hp = highPass(sr);
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) out[i] = hp(hs(ch[i]));
    return out;
  });
}

/** Max momentary loudness (LUFS-like, dB) over the given span of samples. */
export function maxMomentaryLoudness(channels, sr, { windowMs = 400, hopMs = 10, end } = {}) {
  const kw = kWeight(channels, sr);
  const n = Math.min(end ?? kw[0].length, kw[0].length);
  const win = Math.round((windowMs / 1000) * sr);
  const hop = Math.round((hopMs / 1000) * sr);
  // prefix sums of summed channel power
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const ch of kw) p += ch[i] * ch[i];
    pre[i + 1] = pre[i] + p;
  }
  let best = 0;
  for (let s = 0; s + win <= n; s += hop) best = Math.max(best, (pre[s + win] - pre[s]) / win);
  if (n < win) best = pre[n] / Math.max(1, n);
  return -0.691 + 10 * Math.log10(Math.max(best, 1e-12));
}
