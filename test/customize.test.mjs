import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TASKS } from '../src/tasks/configs.js';
import { applyOverrides, normalizeOverrides, validate, describeOverrides, defaultsFor } from '../src/tasks/customize.js';
import { speedTargets, speedTrial, wheelBlock } from '../src/tasks/sequences.js';
import { pc, WHITE_PCS } from '../src/data/notes.js';
import { mulberry32 } from '../src/util/random.js';

const hasAll = () => true;

test('customize: no overrides = the study config, unchanged', () => {
  for (const cfg of Object.values(TASKS)) {
    assert.deepEqual(applyOverrides(cfg, {}), cfg, cfg.id);
    assert.deepEqual(applyOverrides(cfg, defaultsFor(cfg)), cfg, `${cfg.id}: defaults are not overrides`);
    assert.deepEqual(describeOverrides(cfg, {}), []);
  }
});

test('customize: values are clamped and unknown keys dropped', () => {
  const o = normalizeOverrides(TASKS.simpleSpeed, { windowMs: 99999, notesPerTrial: -3, bogus: 1, sungCue: 'yes', targetPcs: [0, 0, 13, 4] });
  assert.deepEqual(o, { windowMs: 4000, notesPerTrial: 2, targetPcs: [0, 4] });
  const cfg = applyOverrides(TASKS.simpleSpeed, { windowMs: 873 });
  assert.equal(cfg.windowMs, 850); // rounded to the 50 ms step
  assert.equal(cfg.id, 'simpleSpeed');
});

test('customize: speed task with a black-key subset and "only the selected notes"', () => {
  const cfg = applyOverrides(TASKS.simpleSpeed, { targetPcs: [0, 1, 7], distractors: 'targets', octaves: [3, 5], sungCue: false });
  assert.deepEqual(cfg.distractorPcs, [0, 1, 7]);
  assert.equal(cfg.sungCue, false);
  const rng = mulberry32(3);
  const targets = speedTargets(cfg, rng);
  assert.deepEqual(targets, [0, 1, 7, 0, 1, 7]); // ascending, two passes
  for (const t of [0, 1, 7]) {
    const notes = speedTrial(cfg, t, hasAll, rng);
    assert.equal(notes.filter((n) => n.isTarget).length, cfg.targetsPerTrial);
    for (const n of notes) assert.ok(n.isTarget ? pc(n.midi) === t : [0, 1, 7].includes(pc(n.midi)) && pc(n.midi) !== t);
  }
  assert.deepEqual(validate(TASKS.simpleSpeed, { targetPcs: [5], distractors: 'targets' }), ['“Only the selected notes” needs at least two target notes.']);
  assert.ok(validate(TASKS.simpleSpeed, { notesPerTrial: 4, targetsPerTrial: 4 }).length);
  assert.deepEqual(validate(TASKS.simpleSpeed, {}, hasAll), []);
});

test('customize: built-in speed targets unchanged (white keys, same rng use)', () => {
  assert.deepEqual(speedTargets(TASKS.simpleSpeed, mulberry32(1)), [...WHITE_PCS, ...WHITE_PCS]);
  const a = speedTargets(TASKS.hypercomplexSpeed, mulberry32(9));
  assert.deepEqual(a.slice().sort(), [...WHITE_PCS, ...WHITE_PCS].sort());
});

test('customize: wheel subset, blocks and labels', () => {
  const o = { pcs: [0, 4, 7], noiseMs: 0, blocks: [{ enabled: false }, { mode: 'sample', n: 10, timbres: ['piano', 'cello'], octaves: [4, 4] }] };
  const cfg = applyOverrides(TASKS.accuracy, o);
  assert.equal(cfg.blocks.length, 1);
  assert.deepEqual(cfg.pcs, [0, 4, 7]);
  const block = wheelBlock(cfg.blocks[0], hasAll, mulberry32(2));
  assert.equal(block.length, 6); // 3 notes × 1 octave × 2 timbres, fewer than n
  for (const n of block) assert.ok([0, 4, 7].includes(pc(n.midi)) && n.midi >= 60 && n.midi <= 71);
  const labels = describeOverrides(TASKS.accuracy, o);
  assert.ok(labels.some((l) => l.includes('block 1 off')), labels.join('|'));
  assert.ok(validate(TASKS.accuracy, { blocks: [{ enabled: false }, { enabled: false }] }).length);
});

test('customize: Name That Key Test only exposes presentation', () => {
  const cfg = applyOverrides(TASKS.nameThatKeyTest, { feedback: true, trials: 3, pcs: [0] });
  assert.equal(cfg.feedback, true);
  assert.equal(cfg.trials, undefined);
  assert.equal(cfg.tonicPcs, undefined);
});
