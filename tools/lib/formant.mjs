// Klatt-style formant "singing voice" that sings an English letter name
// (C, D, E, F, G, A, B) on a given pitch. Used for the speed tasks' target cue.
import { midiToFreq } from './yin.mjs';

// Vowel targets [F1, F2, F3, F4, F5] (Hz) — roughly a female/alto voice.
const V = {
  i: [300, 2600, 3200, 3900, 4600],
  I: [400, 2200, 2900, 3800, 4600],
  e: [450, 2250, 2900, 3800, 4600],
  E: [600, 2000, 2800, 3800, 4600],
};
const BW = [70, 100, 140, 220, 300];

/**
 * Each letter is a sequence of segments over normalized time (0..1 of the cue).
 * type: 'v' voiced vowel, 'fric' fricative noise, 'stop' voiced plosive transition.
 */
const LETTERS = {
  C: { pre: { kind: 's', dur: 0.16 }, vowels: [['i', 1]] },
  D: { pre: { kind: 'd', dur: 0.05 }, vowels: [['i', 1]], locus: 1800 },
  E: { pre: null, vowels: [['i', 1]] },
  F: { pre: null, vowels: [['E', 1]], post: { kind: 'f', dur: 0.17 } },
  G: { pre: { kind: 'dZ', dur: 0.12 }, vowels: [['i', 1]], locus: 2300 },
  A: { pre: null, vowels: [['e', 0.55], ['I', 0.45]] },
  B: { pre: { kind: 'b', dur: 0.05 }, vowels: [['i', 1]], locus: 900 },
};

class Resonator {
  constructor(sr) { this.sr = sr; this.y1 = 0; this.y2 = 0; this.set(500, 100); }
  set(f, bw) {
    const T = 1 / this.sr;
    this.C = -Math.exp(-2 * Math.PI * bw * T);
    this.B = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * f * T);
    this.A = 1 - this.B - this.C;
  }
  tick(x) {
    const y = this.A * x + this.B * this.y1 + this.C * this.y2;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Render a sung letter. Returns Float32Array (mono). */
export function singLetter(letter, midi, { sr = 44100, durSec = 1.5, seed = 1 } = {}) {
  const spec = LETTERS[letter];
  if (!spec) throw new Error('unknown letter ' + letter);
  const rand = rng(seed + midi * 31 + letter.charCodeAt(0));
  const N = Math.round(durSec * sr);
  const out = new Float32Array(N);
  const f0 = midiToFreq(midi);

  const preDur = spec.pre ? spec.pre.dur * durSec : 0;
  const postDur = spec.post ? spec.post.dur * durSec : 0;
  const voiceStart = spec.pre && (spec.pre.kind === 's') ? preDur * 0.85 : (spec.pre ? preDur * 0.4 : 0);
  const voiceEnd = durSec - (spec.post ? postDur * 0.9 : 0.06);

  const cascade = BW.map(() => new Resonator(sr));
  const fricRes = [new Resonator(sr), new Resonator(sr)];
  let phase = 0;
  let lp = 0; // spectral tilt low-pass state for the glottal source
  let hpPrev = 0, hpOut = 0;

  // Vowel trajectory: piecewise between the listed vowel targets.
  const vowelAt = (tv) => {
    const vs = spec.vowels;
    if (vs.length === 1) return V[vs[0][0]];
    const [a, wa] = vs[0];
    const b = vs[1][0];
    const k = smooth(Math.min(1, Math.max(0, (tv - wa * 0.6) / (wa * 0.8))));
    return V[a].map((f, i) => f + (V[b][i] - f) * k);
  };

  for (let n = 0; n < N; n++) {
    const t = n / sr;
    // ---- formant targets (with consonant loci transitions)
    const tv = Math.max(0, (t - voiceStart) / Math.max(0.01, voiceEnd - voiceStart));
    let F = vowelAt(tv).slice();
    if (spec.locus) {
      const k = smooth(Math.min(1, Math.max(0, (t - voiceStart) / 0.07)));
      F[1] = spec.locus + (F[1] - spec.locus) * k;
      F[0] = 250 + (F[0] - 250) * k;
    }
    if (n % 32 === 0) for (let i = 0; i < 5; i++) cascade[i].set(F[i], BW[i]);

    // ---- f0 with gentle onset scoop, delayed vibrato, tiny jitter
    const scoop = -35 * Math.exp(-Math.max(0, t - voiceStart) / 0.05); // cents
    const vibDepth = 22 * smooth(Math.min(1, Math.max(0, (t - voiceStart - 0.35) / 0.3)));
    const vib = vibDepth * Math.sin(2 * Math.PI * 5.4 * t);
    const jitter = (rand() - 0.5) * 3;
    const f = f0 * Math.pow(2, (scoop + vib + jitter) / 1200);
    phase += f / sr;
    if (phase >= 1) phase -= 1;

    // Rosenberg glottal pulse (derivative form), open quotient 0.6
    const OQ = 0.6, tp = 0.4 * OQ * 2.0 / 2, tn = OQ - tp;
    let g;
    if (phase < tp) g = 0.5 * (1 - Math.cos((Math.PI * phase) / tp));
    else if (phase < OQ) g = Math.cos((Math.PI * (phase - tp)) / (2 * tn));
    else g = 0;
    // differentiate (lip radiation) via simple HP
    hpOut = g - hpPrev; hpPrev = g;
    lp = lp + 0.35 * (hpOut - lp);
    let src = lp * 6 + (rand() - 0.5) * 0.015; // + aspiration

    // voicing amplitude envelope
    let av = 0;
    if (t >= voiceStart && t <= voiceEnd) {
      const a = Math.min(1, (t - voiceStart) / 0.04);
      const r = Math.min(1, (voiceEnd - t) / 0.08);
      av = smooth(a) * smooth(r);
    }
    // voiced stop murmur (b/d) before release
    if (spec.pre && (spec.pre.kind === 'b' || spec.pre.kind === 'd') && t < voiceStart) {
      av = 0.12 * smooth(Math.min(1, t / 0.02));
    }
    let v = src * av;
    for (const r of cascade) v = r.tick(v);

    // ---- frication / bursts
    let noise = 0;
    const white = rand() * 2 - 1;
    const pre = spec.pre;
    if (pre) {
      if (pre.kind === 's' && t < preDur) {
        fricRes[0].set(6500, 1800); fricRes[1].set(8500, 2500);
        const e = smooth(Math.min(1, t / 0.04)) * smooth(Math.min(1, (preDur - t) / 0.04));
        noise = (fricRes[0].tick(white) + 0.6 * fricRes[1].tick(white)) * e * 0.55;
      } else if (pre.kind === 'dZ' && t < preDur) {
        fricRes[0].set(2800, 900); fricRes[1].set(4200, 1500);
        const burst = t < 0.012 ? 1.5 : 1;
        const e = smooth(Math.min(1, t / 0.01)) * smooth(Math.min(1, (preDur - t) / 0.05));
        noise = (fricRes[0].tick(white) + 0.5 * fricRes[1].tick(white)) * e * 0.5 * burst;
      } else if ((pre.kind === 'd' || pre.kind === 'b') && Math.abs(t - voiceStart) < 0.012) {
        fricRes[0].set(pre.kind === 'd' ? 3500 : 1200, 1500);
        noise = fricRes[0].tick(white) * 0.6 * (1 - Math.abs(t - voiceStart) / 0.012);
      }
    }
    if (spec.post && t > durSec - postDur) {
      fricRes[1].set(5000, 4000);
      const tt = t - (durSec - postDur);
      const e = smooth(Math.min(1, tt / 0.04)) * smooth(Math.min(1, (postDur - tt) / 0.05));
      noise += fricRes[1].tick(white) * e * 0.12;
    }
    out[n] = v + noise;
  }
  // remove DC
  let mean = 0;
  for (let i = 0; i < N; i++) mean += out[i];
  mean /= N;
  for (let i = 0; i < N; i++) out[i] -= mean;
  return out;
}
