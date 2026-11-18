// YIN fundamental-frequency estimator (de Cheveigné & Kawahara 2002) and
// helpers to measure the steady-state pitch of a note.

export function yinFrame(x, start, sr, { minF = 50, maxF = 2200, win = 2048, threshold = 0.12 } = {}) {
  const maxTau = Math.min(Math.floor(sr / minF), win);
  const minTau = Math.max(2, Math.floor(sr / maxF));
  if (start + win + maxTau > x.length) return null;
  const d = new Float64Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < win; i++) {
      const diff = x[start + i] - x[start + i + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  // cumulative mean normalized difference
  const cm = new Float64Array(maxTau + 1);
  cm[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    run += d[tau];
    cm[tau] = run === 0 ? 1 : (d[tau] * tau) / run;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cm[t] < threshold) {
      while (t + 1 <= maxTau && cm[t + 1] < cm[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // fall back to global minimum
    let best = minTau;
    for (let t = minTau; t <= maxTau; t++) if (cm[t] < cm[best]) best = t;
    if (cm[best] > 0.35) return null;
    tau = best;
  }
  // parabolic interpolation
  let betterTau = tau;
  if (tau > 1 && tau < maxTau) {
    const s0 = cm[tau - 1], s1 = cm[tau], s2 = cm[tau + 1];
    const denom = 2 * s1 - s2 - s0;
    if (denom !== 0) betterTau = tau + (s2 - s0) / (2 * denom);
  }
  return { f0: sr / betterTau, aperiodicity: cm[tau] };
}

export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Median pitch of a note between startSec and endSec.
 * Returns { midi (nearest), cents (deviation), f0, frames }.
 */
export function notePitch(x, sr, { startSec = 0.15, endSec = 0.9, hint } = {}) {
  const opts = hint
    ? { minF: midiToFreq(hint - 7), maxF: midiToFreq(hint + 7) }
    : {};
  const win = 2048;
  const hop = 512;
  const f0s = [];
  const s0 = Math.floor(startSec * sr);
  const s1 = Math.min(x.length - win * 2, Math.floor(endSec * sr));
  for (let s = s0; s < s1; s += hop) {
    const r = yinFrame(x, s, sr, { ...opts, win });
    if (r && r.aperiodicity < 0.3) f0s.push(r.f0);
  }
  if (f0s.length < 3) return null;
  const midis = f0s.map(freqToMidi).sort((a, b) => a - b);
  const med = midis[Math.floor(midis.length / 2)];
  const nearest = Math.round(med);
  return { midi: nearest, cents: (med - nearest) * 100, f0: midiToFreq(med), frames: f0s.length };
}
