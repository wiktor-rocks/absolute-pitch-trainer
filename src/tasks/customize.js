// Practice-tab customization: a declarative field schema per task kind, plus pure helpers to
// turn the study's built-in config + a user's overrides into the config a task actually runs.
// The protocol never goes through here.
import { ALL_TIMBRES } from './configs.js';
import { WHITE_PCS, ALL_PCS, octave, midiOf, pcName } from '../data/notes.js';
import { MELODY_TIMBRES, ARRANGEMENTS } from '../music/arrange.js';
import { notePool } from './sequences.js';

export const OCTAVES = [3, 4, 5];
const MS = (key, label, min, max, step = 50) => ({ key, label, type: 'int', min, max, step, unit: 'ms' });
const INT = (key, label, min, max) => ({ key, label, type: 'int', min, max, step: 1 });

/** Editor schema, grouped. `blocks` (wheel tasks) is handled as its own section. */
export const FIELDS = {
  speed: [
    { group: 'Notes', fields: [
      { key: 'targetPcs', label: 'Target notes', type: 'pcs' },
      { key: 'distractors', label: 'Other notes', type: 'enum', options: { white: 'White keys', all: 'All 12 notes', targets: 'Only the selected notes' } },
      { key: 'targetOrder', label: 'Target order', type: 'enum', options: { ascending: 'Ascending', random: 'Random' } },
    ] },
    { group: 'Instruments & range', fields: [
      { key: 'timbres', label: 'Instruments', type: 'timbres', options: ALL_TIMBRES },
      { key: 'octaves', label: 'Octaves', type: 'octaves' },
    ] },
    { group: 'Timing & counts', fields: [
      MS('windowMs', 'Response window', 300, 4000),
      MS('cueMs', 'Cue length', 0, 5000),
      MS('feedbackMs', 'Feedback length', 0, 3000),
      MS('restMs', 'Rest between trials', 0, 10000, 100),
      INT('notesPerTrial', 'Notes per trial', 2, 64),
      INT('targetsPerTrial', 'Targets per trial', 1, 32),
      INT('repeats', 'Passes through the targets', 1, 10),
    ] },
    { group: 'Feedback & cues', fields: [
      { key: 'sungCue', label: 'Sung cue at the start of each trial', type: 'bool', hint: 'Recorded for the white keys only.' },
      { key: 'feedback', label: 'Show “target / not target” after each note', type: 'bool' },
    ] },
  ],
  wheel: [
    { group: 'Notes', fields: [
      { key: 'pcs', label: 'Notes in play (other wheel segments are disabled)', type: 'pcs' },
    ] },
    { group: 'Feedback & cues', fields: [
      { key: 'feedback', label: 'Feedback after every answer', type: 'bool' },
      { key: 'replay', label: 'Replay the note with the feedback', type: 'bool' },
      MS('noiseMs', 'Noise between trials (0 = off)', 0, 5000),
    ] },
  ],
  key: [
    { group: 'Music', fields: [
      { key: 'pcs', label: 'Keys (tonics) in play', type: 'pcs' },
      { key: 'melodyTimbres', label: 'Melody instruments', type: 'timbres', options: MELODY_TIMBRES },
      { key: 'arrangements', label: 'Arrangements', type: 'enumset', options: { solo: 'Melody only', chords: 'Melody + chords', bassChords: 'Melody + bass + chords' } },
    ] },
    { group: 'Timing & counts', fields: [
      INT('trials', 'Excerpts', 1, 60),
      { key: 'excerptSec', label: 'Excerpt length', type: 'int', min: 5, max: 60, step: 1, unit: 's' },
    ] },
    { group: 'Feedback & cues', fields: [
      { key: 'feedback', label: 'Feedback (shows the key and plays the tonic)', type: 'bool' },
      MS('noiseMs', 'Noise between trials (0 = off)', 0, 5000),
    ] },
  ],
  // Name That Key Test: its song→key rotation must stay intact, so only presentation changes.
  keyTest: [
    { group: 'Feedback & cues', fields: [
      { key: 'feedback', label: 'Feedback (shows the key and plays the tonic)', type: 'bool' },
      MS('noiseMs', 'Noise between trials (0 = off)', 0, 5000),
    ] },
  ],
};

export const BLOCK_FIELDS = [
  { key: 'enabled', label: 'Include this block', type: 'bool' },
  { key: 'timbres', label: 'Instruments', type: 'timbres', options: ALL_TIMBRES },
  { key: 'octaves', label: 'Octaves', type: 'octaves' },
  { key: 'mode', label: 'Notes', type: 'enum', options: { eachTwice: 'Every note twice', sample: 'A random selection' } },
  INT('n', 'How many (random selection)', 1, 200),
];

export const schemaKind = (cfg) => (cfg.kind === 'key' && cfg.test ? 'keyTest' : cfg.kind);
export const fieldsFor = (cfg) => FIELDS[schemaKind(cfg)].flatMap((g) => g.fields);

const octavesOf = ([lo, hi]) => [octave(lo), octave(hi)];
/** Timbres in canonical (schema) order, so equal sets compare equal. */
const ordered = (ts) => ALL_TIMBRES.filter((t) => ts.includes(t));
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Editor values for a built-in config (what "no overrides" looks like). */
export function defaultsFor(cfg) {
  switch (schemaKind(cfg)) {
    case 'speed': return {
      targetPcs: [...cfg.targetPcs],
      distractors: sameSet(cfg.distractorPcs, ALL_PCS) ? 'all' : 'white',
      targetOrder: cfg.targetOrder, timbres: ordered(cfg.timbres), octaves: octavesOf(cfg.range),
      windowMs: cfg.windowMs, cueMs: cfg.cueMs, feedbackMs: cfg.feedbackMs, restMs: cfg.restMs,
      notesPerTrial: cfg.notesPerTrial, targetsPerTrial: cfg.targetsPerTrial, repeats: cfg.repeats,
      sungCue: true, feedback: true,
    };
    case 'wheel': return {
      pcs: [...ALL_PCS], feedback: cfg.feedback, replay: true, noiseMs: cfg.noiseMs,
      blocks: cfg.blocks.map((b) => ({ enabled: true, timbres: ordered(b.timbres), octaves: octavesOf(b.range), mode: b.mode, n: b.n ?? 48 })),
    };
    case 'key': return {
      pcs: [...ALL_PCS], melodyTimbres: [...MELODY_TIMBRES], arrangements: [...ARRANGEMENTS],
      trials: cfg.trials, excerptSec: cfg.excerptSec, feedback: cfg.feedback, noiseMs: cfg.noiseMs,
    };
    case 'keyTest': return { feedback: cfg.feedback, noiseMs: cfg.noiseMs };
  }
}

/** Coerce one value to its field's type; undefined = invalid (dropped). */
function clean(f, v, options = f.options) {
  switch (f.type) {
    case 'int': {
      const n = Number(v);
      if (!Number.isFinite(n)) return undefined;
      return Math.min(f.max, Math.max(f.min, Math.round(n / f.step) * f.step));
    }
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'enum': return Object.hasOwn(f.options, v) ? v : undefined;
    case 'pcs': return Array.isArray(v) ? [...new Set(v.filter((p) => Number.isInteger(p) && p >= 0 && p < 12))].sort((a, b) => a - b) : undefined;
    case 'timbres': return Array.isArray(v) ? options.filter((t) => v.includes(t)) : undefined;
    case 'enumset': return Array.isArray(v) ? Object.keys(options).filter((t) => v.includes(t)) : undefined;
    case 'octaves': {
      if (!Array.isArray(v) || v.length !== 2) return undefined;
      const [a, b] = v.map((o) => Math.min(OCTAVES.at(-1), Math.max(OCTAVES[0], Math.round(Number(o)))));
      return Number.isFinite(a) && Number.isFinite(b) ? [Math.min(a, b), Math.max(a, b)] : undefined;
    }
  }
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Sanitize overrides against the schema and drop anything equal to the default,
 * so `{}` means "the study's settings".
 */
export function normalizeOverrides(base, overrides) {
  const def = defaultsFor(base);
  const out = {};
  if (!overrides || typeof overrides !== 'object') return out;
  for (const f of fieldsFor(base)) {
    if (!(f.key in overrides)) continue;
    const v = clean(f, overrides[f.key]);
    if (v !== undefined && !eq(v, def[f.key])) out[f.key] = v;
  }
  if (base.kind === 'wheel' && Array.isArray(overrides.blocks)) {
    const blocks = def.blocks.map((d, i) => {
      const o = overrides.blocks[i] || {};
      const b = { ...d };
      for (const f of BLOCK_FIELDS) if (f.key in o) { const v = clean(f, o[f.key]); if (v !== undefined) b[f.key] = v; }
      return b;
    });
    if (!eq(blocks, def.blocks)) out.blocks = blocks;
  }
  return out;
}

/** Editor values = defaults with the overrides applied. */
export const valuesFor = (base, overrides) => ({ ...defaultsFor(base), ...normalizeOverrides(base, overrides) });

const rangeOf = ([lo, hi]) => [midiOf(0, lo), midiOf(11, hi)];

/** The config to run. With no (effective) overrides this is an unchanged copy of `base`. */
export function applyOverrides(base, overrides) {
  const o = normalizeOverrides(base, overrides);
  const cfg = structuredClone(base);
  if (!Object.keys(o).length) return cfg;
  const v = { ...defaultsFor(base), ...o };
  switch (schemaKind(base)) {
    case 'speed':
      Object.assign(cfg, {
        targetPcs: v.targetPcs, targetOrder: v.targetOrder, timbres: v.timbres, range: rangeOf(v.octaves),
        distractorPcs: v.distractors === 'all' ? [...ALL_PCS] : v.distractors === 'targets' ? [...v.targetPcs] : [...WHITE_PCS],
        windowMs: v.windowMs, cueMs: v.cueMs, feedbackMs: v.feedbackMs, restMs: v.restMs,
        notesPerTrial: v.notesPerTrial, targetsPerTrial: v.targetsPerTrial, repeats: v.repeats,
        sungCue: v.sungCue, feedback: v.feedback,
      });
      break;
    case 'wheel': {
      const pcs = v.pcs.length === 12 ? null : v.pcs;
      Object.assign(cfg, { feedback: v.feedback, replay: v.replay, noiseMs: v.noiseMs, pcs });
      const changed = !!o.blocks;
      cfg.blocks = v.blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.enabled).map(({ b, i }, k) => ({
        label: changed ? `Block ${k + 1} — ${b.timbres.join(', ')}` : base.blocks[i].label,
        timbres: b.timbres, range: rangeOf(b.octaves), mode: b.mode, ...(b.mode === 'sample' ? { n: b.n } : {}), pcs,
      }));
      break;
    }
    case 'key':
      Object.assign(cfg, {
        trials: v.trials, excerptSec: v.excerptSec, feedback: v.feedback, noiseMs: v.noiseMs,
        tonicPcs: v.pcs.length === 12 ? null : v.pcs,
        melodyTimbres: sameSet(v.melodyTimbres, MELODY_TIMBRES) ? null : v.melodyTimbres,
        arrangements: sameSet(v.arrangements, ARRANGEMENTS) ? null : v.arrangements,
      });
      break;
    case 'keyTest':
      Object.assign(cfg, { feedback: v.feedback, noiseMs: v.noiseMs });
      break;
  }
  return cfg;
}

/**
 * Problems that must be fixed before Start. `has(timbre, midi)` (optional) checks that the
 * chosen notes actually exist in the sample set.
 */
export function validate(base, overrides, has = null) {
  const v = valuesFor(base, overrides);
  const p = [];
  switch (schemaKind(base)) {
    case 'speed': {
      if (!v.targetPcs.length) p.push('Pick at least one target note.');
      if (v.distractors === 'targets' && v.targetPcs.length < 2) p.push('“Only the selected notes” needs at least two target notes.');
      if (!v.timbres.length) p.push('Pick at least one instrument.');
      if (v.targetsPerTrial >= v.notesPerTrial) p.push('Targets per trial must be fewer than notes per trial.');
      if (has && !p.length) {
        const cfg = applyOverrides(base, overrides);
        const missing = cfg.targetPcs.filter((t) => !notePool({ ...cfg, pcs: [t] }, has).length);
        if (missing.length) p.push(`No recordings of ${missing.map(pcName).join(', ')} for these instruments and octaves.`);
        else if (cfg.targetPcs.some((t) => !notePool({ ...cfg, pcs: cfg.distractorPcs.filter((d) => d !== t) }, has).length)) p.push('No other notes to play between the targets.');
      }
      break;
    }
    case 'wheel': {
      if (v.pcs.length < 2) p.push('Pick at least two notes.');
      const on = v.blocks.filter((b) => b.enabled);
      if (!on.length) p.push('Include at least one block.');
      if (on.some((b) => !b.timbres.length)) p.push('Every included block needs at least one instrument.');
      if (has && !p.length) {
        const cfg = applyOverrides(base, overrides);
        if (cfg.blocks.some((b) => !notePool(b, has).length)) p.push('A block has no recordings for its instruments, octaves and notes.');
      }
      break;
    }
    case 'key':
      if (!v.pcs.length) p.push('Pick at least one key.');
      if (!v.melodyTimbres.length) p.push('Pick at least one melody instrument.');
      if (!v.arrangements.length) p.push('Pick at least one arrangement.');
      break;
  }
  return p;
}

const pcList = (pcs) => (pcs.length === 12 ? 'all 12' : pcs.map(pcName).join(' '));
const fmtVal = (f, v) => {
  if (f.type === 'int') return `${v}${f.unit ? ` ${f.unit}` : ''}`;
  if (f.type === 'bool') return v ? 'on' : 'off';
  if (f.type === 'enum') return f.options[v].toLowerCase();
  if (f.type === 'pcs') return pcList(v);
  if (f.type === 'octaves') return v[0] === v[1] ? `${v[0]}` : `${v[0]}–${v[1]}`;
  if (f.type === 'enumset') return v.map((k) => f.options[k].toLowerCase()).join(', ');
  return v.join(', ');
};

/** Short human-readable list of what differs from the study's settings. */
export function describeOverrides(base, overrides) {
  const o = normalizeOverrides(base, overrides);
  const out = [];
  for (const f of fieldsFor(base)) if (f.key in o) out.push(`${f.label.replace(/ \(.*\)$/, '').toLowerCase()}: ${fmtVal(f, o[f.key])}`);
  if (o.blocks) {
    o.blocks.forEach((b, i) => {
      if (!b.enabled) { out.push(`block ${i + 1} off`); return; }
      const d = defaultsFor(base).blocks[i];
      const parts = BLOCK_FIELDS.filter((f) => f.key !== 'enabled' && !eq(b[f.key], d[f.key]) && (f.key !== 'n' || b.mode === 'sample'))
        .map((f) => `${f.label.replace(/ \(.*\)$/, '').toLowerCase()} ${fmtVal(f, b[f.key])}`);
      if (parts.length) out.push(`block ${i + 1}: ${parts.join(', ')}`);
    });
  }
  return out;
}

