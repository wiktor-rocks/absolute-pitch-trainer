// Band-limited square wave (additive synthesis of odd harmonics below Nyquist).
import { midiToFreq } from './yin.mjs';

export function squareNote(midi, { sr = 44100, durSec = 1.0, attackMs = 8, releaseMs = 30 } = {}) {
  const f = midiToFreq(midi);
  const N = Math.round(durSec * sr);
  const out = new Float32Array(N);
  const nyq = sr / 2 * 0.95;
  for (let k = 1; k * f < nyq; k += 2) {
    const amp = 4 / (Math.PI * k);
    const w = (2 * Math.PI * k * f) / sr;
    for (let n = 0; n < N; n++) out[n] += amp * Math.sin(w * n);
  }
  const a = Math.round((attackMs / 1000) * sr);
  const r = Math.round((releaseMs / 1000) * sr);
  for (let n = 0; n < a; n++) out[n] *= n / a;
  for (let n = 0; n < r; n++) out[N - 1 - n] *= n / r;
  return out;
}
