// Split a recording containing several isolated notes (e.g. University of Iowa MIS
// chromatic runs) into note regions, and label them against the expected pitches.
import { envelopeDb } from './dsp.mjs';

/** Prefer splitting on digital silence (Iowa files are edited that way); fall back to envelope. */
export function segmentNotes(x, sr, opts = {}) {
  const bySilence = splitOnSilence(x, sr, opts);
  if (bySilence.length >= 2) return bySilence;
  return splitOnEnvelope(x, sr, opts);
}

function splitOnSilence(x, sr, { silenceMs = 25, minNoteMs = 250, eps = 2e-5 } = {}) {
  const minRun = Math.round((silenceMs / 1000) * sr);
  const regions = [];
  let runStart = -1;
  let segStart = 0;
  let inSeg = false;
  for (let i = 0; i <= x.length; i++) {
    const silent = i === x.length || Math.abs(x[i]) <= eps;
    if (silent) {
      if (runStart < 0) runStart = i;
      if (inSeg && (i - runStart >= minRun || i === x.length)) {
        regions.push({ start: segStart, end: runStart });
        inSeg = false;
      }
    } else {
      if (!inSeg) { segStart = i; inSeg = true; }
      runStart = -1;
    }
  }
  const minLen = Math.round((minNoteMs / 1000) * sr);
  return regions.filter((r) => r.end - r.start >= minLen);
}

function splitOnEnvelope(x, sr, {
  frameMs = 10, minNoteMs = 250, minGapMs = 250, onDb = -30, offDb = -45,
} = {}) {
  const frame = Math.round((frameMs / 1000) * sr);
  const env = envelopeDb(x, frame);
  const top = Math.max(...env);
  const on = top + onDb, off = top + offDb;
  const regions = [];
  let s = -1;
  for (let f = 0; f < env.length; f++) {
    if (s < 0 && env[f] > on) {
      // walk back to where it rose above the off threshold
      s = f; while (s > 0 && env[s - 1] > off) s--;
    } else if (s >= 0 && env[f] < off) { regions.push([s, f]); s = -1; }
  }
  if (s >= 0) regions.push([s, env.length]);
  const gapF = Math.round(minGapMs / frameMs);
  const merged = [];
  for (const r of regions) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < gapF) last[1] = r[1]; else merged.push([...r]);
  }
  const minF = Math.round(minNoteMs / frameMs);
  return merged.filter(([a, b]) => b - a >= minF).map(([a, b]) => ({ start: a * frame, end: Math.min(x.length, b * frame) }));
}

/**
 * Monotone alignment of regions (with detected fractional MIDI pitch, or null) to the
 * expected ascending labels lo..hi. Maximizes sum of (1 - |deviation|) over matched pairs,
 * only matching pairs within `maxDev` semitones.
 * @returns {Array<{region:number,label:number,dev:number}>}
 */
export function alignToRun(pitches, lo, hi, maxDev = 0.7) {
  const n = pitches.length, m = hi - lo + 1;
  const S = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const B = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = S[i - 1][j], b = 1; // skip region
      if (S[i][j - 1] > best) { best = S[i][j - 1]; b = 2; } // skip label
      const p = pitches[i - 1];
      if (p != null) {
        const dev = p - (lo + j - 1);
        if (Math.abs(dev) <= maxDev) {
          const v = S[i - 1][j - 1] + 1 - Math.abs(dev);
          if (v > best) { best = v; b = 3; }
        }
      }
      S[i][j] = best; B[i][j] = b;
    }
  }
  const out = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    const b = B[i][j];
    if (b === 3) { out.push({ region: i - 1, label: lo + j - 1, dev: pitches[i - 1] - (lo + j - 1) }); i--; j--; }
    else if (b === 1) i--;
    else j--;
  }
  return out.reverse();
}
