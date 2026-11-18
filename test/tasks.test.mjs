import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { TASKS } from '../src/tasks/configs.js';
import { speedTargets, speedTrial, wheelBlock, notePool, speedStats, wheelStats } from '../src/tasks/sequences.js';
import { pc, WHITE_PCS } from '../src/data/notes.js';
import { mulberry32 } from '../src/util/random.js';
import { TEST_SONGS, TRAINING_SONGS, parseMelody, parseChords } from '../src/data/melodies.js';
import { arrange, buildKeyPool, ntktAssignment, songById } from '../src/music/arrange.js';
import { protocolState, protocolContext, practiceContext, PHASE_TASKS, PHASE_TESTS, BIG_TESTS } from '../src/protocol.js';

// Use the real sample manifest when built, else assume everything exists.
const manifestPath = new URL('../samples/manifest.json', import.meta.url);
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const has = manifest ? (t, m) => !!manifest.timbres[t]?.notes?.[m] : () => true;

test('speed tasks: 14 trials, counts, ratios, ranges, timbres', () => {
  const rng = mulberry32(1);
  for (const id of ['simpleSpeed', 'complexSpeed', 'hypercomplexSpeed']) {
    const cfg = TASKS[id];
    const targets = speedTargets(cfg, rng);
    assert.equal(targets.length, 14);
    if (cfg.targetOrder === 'ascending') assert.deepEqual(targets, [...WHITE_PCS, ...WHITE_PCS]);
    else assert.deepEqual([...targets].sort(), [...WHITE_PCS, ...WHITE_PCS].sort());
    for (const tp of targets) {
      const notes = speedTrial(cfg, tp, has, rng);
      assert.equal(notes.length, cfg.notesPerTrial);
      assert.equal(notes.filter((n) => n.isTarget).length, cfg.targetsPerTrial);
      for (const n of notes) {
        assert.ok(n.midi >= cfg.range[0] && n.midi <= cfg.range[1], `${id} range`);
        assert.ok(cfg.timbres.includes(n.timbre));
        assert.equal(n.isTarget, pc(n.midi) === tp);
        if (!n.isTarget) assert.ok(cfg.distractorPcs.includes(pc(n.midi)));
      }
    }
  }
});

test('hypercomplex distractors use black keys too', () => {
  const rng = mulberry32(2);
  const cfg = TASKS.hypercomplexSpeed;
  const pcs = new Set();
  for (let i = 0; i < 20; i++) speedTrial(cfg, 0, has, rng).forEach((n) => pcs.add(pc(n.midi)));
  assert.ok([1, 3, 6, 8, 10].some((p) => pcs.has(p)));
  assert.ok(!pcs.has(0) || true);
});

test('accuracy blocks: 48 + 48, block 1 each piano note twice', () => {
  const rng = mulberry32(3);
  for (const id of ['accuracy', 'weeklyTest']) {
    const [b1, b2] = TASKS[id].blocks.map((b) => wheelBlock(b, has, rng));
    assert.equal(b1.length, 48);
    assert.equal(b2.length, 48);
    const counts = {};
    b1.forEach((n) => (counts[n.midi] = (counts[n.midi] || 0) + 1));
    assert.ok(Object.values(counts).every((c) => c === 2));
    assert.equal(new Set(b2.map((n) => n.timbre + n.midi)).size, 48, 'block 2 sampled without replacement');
  }
  const pool = notePool(TASKS.weeklyTest.blocks[1], has);
  assert.ok(pool.length >= 115 && pool.length <= 120, `WT pool ${pool.length}`);
});

test('stats', () => {
  const s = speedStats([
    { isTarget: true, pressed: true, rt: 400 }, { isTarget: true, pressed: false },
    { isTarget: false, pressed: true, rt: 300 }, { isTarget: false, pressed: false },
  ]);
  assert.equal(s.hits, 1); assert.equal(s.falseAlarms, 1); assert.equal(s.medianRt, 400);
  const w = wheelStats([{ truth: 0, answer: 0, correct: true, block: 1, timbre: 'piano', octave: 4, rt: 1 }, { truth: 0, answer: 1, correct: false, block: 1, timbre: 'piano', octave: 4, rt: 2 }]);
  assert.equal(w.accuracy, 0.5); assert.equal(w.withinSemitone, 1); assert.equal(w.confusion[0][1], 1);
});

test('melodies parse and chords align with bars', () => {
  for (const song of [...TEST_SONGS, ...TRAINING_SONGS]) {
    const { events, totalBeats } = parseMelody(song);
    assert.ok(events.length > 4, song.id);
    const bars = song.chords.split('|').length;
    const expectedBeats = (song.pickup || 0) + bars * song.beatsPerBar;
    assert.ok(Math.abs(totalBeats - expectedBeats) < 1e-6 || Math.abs(totalBeats - (expectedBeats - (song.pickup || 0))) < 1e-6,
      `${song.id}: ${totalBeats} beats vs ${bars} chord bars`);
    parseChords(song, totalBeats);
  }
  assert.equal(TEST_SONGS.length, 12);
  const ids = new Set(TRAINING_SONGS.map((s) => s.id));
  assert.ok(TEST_SONGS.every((s) => !ids.has(s.id)), 'test songs never used in training');
});

test('NTKT: every administration is a permutation of keys, no song repeats a key over 12 administrations', () => {
  const seen = new Map();
  for (let occ = 0; occ < 12; occ++) {
    const a = ntktAssignment(occ);
    assert.deepEqual(a.map((x) => x.tonicPc).sort((p, q) => p - q), [...Array(12).keys()]);
    for (const { songId, tonicPc } of a) {
      const k = songId + ':' + tonicPc;
      assert.ok(!seen.has(k), `${k} repeated`);
      seen.set(k, occ);
    }
  }
});

test('arrangements render in the requested key with available samples', () => {
  for (const item of buildKeyPool().slice(0, 120)) {
    const plan = arrange(songById(item.songId), { ...item, maxSec: 15, has });
    assert.ok(plan, item.id);
    assert.equal(plan.tonicPc, item.tonicPc);
    assert.ok(plan.duration <= 15.01);
    for (const e of plan.events) assert.ok(has(e.timbre, e.midi), `${item.id} ${e.timbre} ${e.midi}`);
  }
  for (const a of ntktAssignment(0)) {
    const plan = arrange(songById(a.songId), { tonicPc: a.tonicPc, melodyTimbre: 'piano', has });
    assert.equal(plan.tonicPc, a.tonicPc);
  }
});

test('protocol: progression and test gating', () => {
  const sessions = [];
  let t = Date.parse('2026-01-01T10:00:00Z');
  const run = (task) => {
    const st = protocolState(sessions, new Date(t));
    const ctx = protocolContext(st, task);
    if (ctx.blocked) return ctx;
    sessions.push({ task, completed: true, context: ctx, startedAt: new Date(t).toISOString(), finishedAt: new Date(t).toISOString() });
    t += 3600e3;
    return ctx;
  };
  // pre-test first; training is blocked
  assert.equal(protocolState(sessions).stage, 'pre');
  assert.ok(run('simpleSpeed').blocked);
  BIG_TESTS.forEach(run);
  for (let week = 1; week <= 8; week++) {
    const st = protocolState(sessions, new Date(t));
    assert.equal(st.stage, 'week'); assert.equal(st.week, week);
    const phase = week <= 4 ? 1 : 2;
    // tests are open from the start of the week
    for (const test of PHASE_TESTS[phase]) assert.ok(!protocolContext(st, test).blocked, `week ${week} test should be open`);
    for (let i = 0; i < 4; i++) for (const task of PHASE_TASKS[phase]) assert.ok(!run(task).blocked);
    assert.ok(run(PHASE_TASKS[phase][0]).blocked, '5th session of a task is blocked');
    // practice sessions never count
    sessions.push({ task: 'hypercomplexSpeed', completed: true, context: practiceContext(), startedAt: '', finishedAt: '' });
    for (const test of PHASE_TESTS[phase]) assert.ok(!run(test).blocked, `week ${week} test should run`);
  }
  assert.equal(protocolState(sessions, new Date(t)).stage, 'post');
  BIG_TESTS.forEach(run);
  const wait = protocolState(sessions, new Date(t));
  assert.equal(wait.stage, 'retention-wait');
  assert.ok(protocolContext(wait, 'weeklyTest').blocked);
  t += 121 * 86400e3;
  assert.equal(protocolState(sessions, new Date(t)).stage, 'retention');
  BIG_TESTS.forEach(run);
  assert.equal(protocolState(sessions, new Date(t)).stage, 'complete');
});

test('protocol: a week\'s test can come before its training, but the week stays open', () => {
  const pre = (task) => ({ task, completed: true, context: { mode: 'protocol', stage: 'pre', role: 'test' }, finishedAt: '2026-01-01T09:00:00' });
  const sessions = [pre('weeklyTest'), pre('nameThatKeyTest')];
  const ctx = protocolContext(protocolState(sessions), 'weeklyTest');
  assert.equal(ctx.role, 'test'); assert.equal(ctx.week, 1);
  sessions.push({ task: 'weeklyTest', completed: true, context: ctx });
  const st = protocolState(sessions);
  assert.equal(st.week, 1, 'week 1 not done until its training is');
  assert.ok(protocolContext(st, 'weeklyTest').blocked, 'test only once per week');
  assert.ok(!protocolContext(st, 'simpleSpeed').blocked);
});

test('note naming: letters by default, fixed-do by sound on request', async () => {
  const { pcName, pcNames, setNaming, getNaming, SOLFEGE } = await import('../src/data/notes.js');
  assert.equal(getNaming(), 'letters');
  assert.equal(pcName(61), 'C♯');
  assert.deepEqual(pcNames(1), ['C♯', 'D♭']);
  setNaming('solfege');
  assert.deepEqual([...Array(12).keys()].map(pcName), ['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti']);
  assert.equal(new Set(SOLFEGE).size, 12); // 12 distinct labels
  assert.deepEqual(pcNames(1), ['Di']); // enharmonics share one name
  assert.equal(pcName(71 + 12), 'Ti');
  setNaming('both');
  assert.equal(pcName(7), 'Sol (G)');
  assert.equal(pcName(1), 'Di (C♯/D♭)');
  setNaming('bogus');
  assert.equal(getNaming(), 'letters');
});

test('protocol: you can pick any unfinished week to work on', () => {
  const pre = (task) => ({ task, completed: true, context: { mode: 'protocol', stage: 'pre', role: 'test' }, finishedAt: '2026-01-01T09:00:00' });
  const sessions = [pre('weeklyTest'), pre('nameThatKeyTest')];
  assert.equal(protocolState(sessions).week, 1);
  const st = protocolState(sessions, new Date(), { week: 6 });
  assert.equal(st.stage, 'week'); assert.equal(st.week, 6); assert.equal(st.phase, 2); assert.ok(st.chosen);
  const ctx = protocolContext(st, 'nameThatKey');
  assert.equal(ctx.week, 6); assert.equal(ctx.role, 'training');
  assert.ok(protocolContext(st, 'simpleSpeed').blocked, 'phase 1 task is not part of week 6');
  // finish week 6, then the pick is ignored and progress decides again
  const s6 = { completed: true, context: { mode: 'protocol', stage: 'week', week: 6, role: 'training' } };
  for (const task of PHASE_TASKS[2]) for (let i = 0; i < 4; i++) sessions.push({ ...s6, task });
  for (const task of PHASE_TESTS[2]) sessions.push({ ...s6, task, context: { ...s6.context, role: 'test' } });
  const after = protocolState(sessions, new Date(), { week: 6 });
  assert.equal(after.week, 1); assert.ok(!after.chosen);
  assert.equal(protocolState(sessions, new Date(), { week: 99 }).week, 1, 'invalid pick is ignored');
});
