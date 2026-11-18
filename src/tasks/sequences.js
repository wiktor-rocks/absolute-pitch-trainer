// Pure trial-sequence generators (no DOM / audio), so they can be unit tested.
import { pc, range, WHITE_PCS } from '../data/notes.js';
import { shuffle, sample, pick, randInt } from '../util/random.js';

/**
 * Every (timbre, midi) allowed by the config and present in the sample set.
 * @param {(timbre:string, midi:number)=>boolean} has
 */
export function notePool({ timbres, range: [lo, hi], pcs }, has) {
  const out = [];
  for (const timbre of timbres) {
    for (const midi of range(lo, hi)) {
      if (pcs && !pcs.includes(pc(midi))) continue;
      if (has(timbre, midi)) out.push({ timbre, midi });
    }
  }
  return out;
}

/** Order of target pitch classes: `repeats` passes through `targetPcs` (14 trials in the study). */
export function speedTargets(cfg, rng) {
  const pcs = (cfg.targetPcs || WHITE_PCS).slice().sort((a, b) => a - b);
  const order = [];
  for (let r = 0; r < cfg.repeats; r++) {
    order.push(...(cfg.targetOrder === 'ascending' ? pcs : shuffle(rng, pcs)));
  }
  return order;
}

/**
 * One speed trial: `notesPerTrial` notes, `targetsPerTrial` of which have the target pitch class,
 * at random positions. Timbre and octave are random per note. Avoids playing the exact same
 * stimulus twice in a row.
 */
export function speedTrial(cfg, targetPc, has, rng) {
  const targets = notePool({ ...cfg, pcs: [targetPc] }, has);
  const distractors = notePool({ ...cfg, pcs: cfg.distractorPcs.filter((p) => p !== targetPc) }, has);
  if (!targets.length || !distractors.length) throw new Error('No samples available for speed trial');
  const targetPos = new Set(sample(rng, range(0, cfg.notesPerTrial - 1), cfg.targetsPerTrial));
  const notes = [];
  for (let i = 0; i < cfg.notesPerTrial; i++) {
    const isTarget = targetPos.has(i);
    const poolArr = isTarget ? targets : distractors;
    let n;
    let guard = 0;
    do {
      n = pick(rng, poolArr);
    } while (guard++ < 20 && notes.length && notes[notes.length - 1].midi === n.midi && notes[notes.length - 1].timbre === n.timbre);
    notes.push({ ...n, isTarget });
  }
  return notes;
}

/** Wheel-task block (Accuracy Training / Weekly Test). */
export function wheelBlock(block, has, rng) {
  const pool = notePool(block, has);
  if (block.mode === 'eachTwice') return shuffle(rng, [...pool, ...pool]);
  if (block.mode === 'sample') return sample(rng, pool, Math.min(block.n, pool.length));
  throw new Error('unknown block mode ' + block.mode);
}

/** Signal-detection summary for speed tasks. */
export function speedStats(responses) {
  let hits = 0, misses = 0, fa = 0, cr = 0;
  const rts = [];
  for (const r of responses) {
    if (r.isTarget && r.pressed) { hits++; rts.push(r.rt); }
    else if (r.isTarget) misses++;
    else if (r.pressed) fa++;
    else cr++;
  }
  const nT = hits + misses, nN = fa + cr;
  // log-linear correction (Hautus 1995) to keep d' finite
  const hr = (hits + 0.5) / (nT + 1);
  const far = (fa + 0.5) / (nN + 1);
  const sorted = rts.slice().sort((a, b) => a - b);
  return {
    hits, misses, falseAlarms: fa, correctRejections: cr,
    hitRate: nT ? hits / nT : 0,
    faRate: nN ? fa / nN : 0,
    dPrime: zInv(hr) - zInv(far),
    meanRt: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null,
    medianRt: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    accuracy: (hits + cr) / Math.max(1, nT + nN),
  };
}

/** Wheel-task summary: overall, per block, per timbre, per octave + confusion matrix. */
export function wheelStats(trials) {
  const acc = (arr) => (arr.length ? arr.filter((t) => t.correct).length / arr.length : null);
  const groupBy = (key) => {
    const g = {};
    for (const t of trials) (g[t[key]] ||= []).push(t);
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { n: v.length, accuracy: acc(v) }]));
  };
  const confusion = Array.from({ length: 12 }, () => new Array(12).fill(0));
  for (const t of trials) if (t.answer != null) confusion[t.truth][t.answer]++;
  const rts = trials.map((t) => t.rt).filter((x) => x != null).sort((a, b) => a - b);
  // "semitone error" accuracy: answers within ±1 pitch class
  const near = trials.filter((t) => t.answer != null && circDist(t.truth, t.answer) <= 1).length;
  return {
    n: trials.length,
    accuracy: acc(trials),
    withinSemitone: trials.length ? near / trials.length : null,
    byBlock: groupBy('block'),
    byTimbre: groupBy('timbre'),
    byOctave: groupBy('octave'),
    medianRt: rts.length ? rts[Math.floor(rts.length / 2)] : null,
    confusion,
  };
}

export const circDist = (a, b) => { const d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); };

// Acklam's inverse normal CDF approximation.
function zInv(p) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export { randInt };
