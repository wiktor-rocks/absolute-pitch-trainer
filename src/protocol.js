// The study's protocol as a progression. It moves with your progress, never by the calendar,
// and you can pick which unfinished week to work on (`opts.week`):
//
//   pre-test (Weekly Test + Name That Key Test)
//   → weeks 1–8. Each week: 4 sessions of each phase task, THEN that week's test(s).
//       Phase 1 (weeks 1–4): Simple Speed, Complex Speed, Accuracy Training → Weekly Test
//       Phase 2 (weeks 5–8): Hypercomplex Speed, Name That Key, Accuracy Training → Weekly Test + NTK Test
//     A week's tests unlock only once its training is done; finishing the tests starts the next week.
//   → post-test (same as pre-test)
//   → retention test, ~4 months after the post-test.
//
// Only sessions started from the Protocol tab (context.mode === 'protocol') count.
// Everything here is pure, so it is unit tested.

export const WEEKS = 8;
export const SESSIONS_PER_WEEK = 4;
export const RETENTION_DAYS = 120;

export const PHASE_TASKS = {
  1: ['simpleSpeed', 'complexSpeed', 'accuracy'],
  2: ['hypercomplexSpeed', 'nameThatKey', 'accuracy'],
};
export const PHASE_TESTS = {
  1: ['weeklyTest'],
  2: ['weeklyTest', 'nameThatKeyTest'],
};
export const BIG_TESTS = ['weeklyTest', 'nameThatKeyTest']; // pre / post / retention

export const phaseOfWeek = (w) => (w <= 4 ? 1 : 2);
const DAY = 86400000;

const isProtocol = (s) => s.completed && s.context?.mode === 'protocol';

/** Per-week counts from protocol sessions. */
export function weekProgress(sessions, week) {
  const ps = sessions.filter((s) => isProtocol(s) && s.context.stage === 'week' && s.context.week === week);
  const phase = phaseOfWeek(week);
  const training = PHASE_TASKS[phase].map((task) => ({
    task, target: SESSIONS_PER_WEEK,
    done: Math.min(SESSIONS_PER_WEEK, ps.filter((s) => s.task === task && s.context.role === 'training').length),
  }));
  const trainingDone = training.every((t) => t.done >= t.target);
  const tests = PHASE_TESTS[phase].map((task) => ({
    task, done: ps.some((s) => s.task === task && s.context.role === 'test'), unlocked: trainingDone,
  }));
  return { week, phase, training, tests, trainingDone, complete: trainingDone && tests.every((t) => t.done) };
}

function bigTestProgress(sessions, stage) {
  const ps = sessions.filter((s) => isProtocol(s) && s.context.stage === stage);
  const tests = BIG_TESTS.map((task) => {
    const done = ps.filter((s) => s.task === task);
    return { task, done: done.length > 0, unlocked: true, finishedAt: done.map((s) => s.finishedAt).sort().pop() };
  });
  return { tests, complete: tests.every((t) => t.done), finishedAt: tests.map((t) => t.finishedAt).filter(Boolean).sort().pop() };
}

/**
 * Where the user is in the protocol, derived from stored sessions. `opts.week` picks the week to
 * work on; it is ignored once that week is complete, and the first unfinished week is used.
 * @returns {{stage:'pre'|'week'|'post'|'retention-wait'|'retention'|'complete', week?:number, phase?:number,
 *            training:Array, tests:Array, weeks:Array, daysToRetention?:number, retentionDate?:Date}}
 */
export function protocolState(sessions, now = new Date(), opts = {}) {
  const weeks = Array.from({ length: WEEKS }, (_, i) => weekProgress(sessions, i + 1));
  const pre = bigTestProgress(sessions, 'pre');
  const preDone = pre.complete;
  const chosen = weeks.find((w) => w.week === opts.week && !w.complete);
  if (chosen) {
    return { stage: 'week', week: chosen.week, phase: chosen.phase, training: chosen.training, tests: chosen.tests, weeks, preDone, chosen: true };
  }
  if (!pre.complete) return { stage: 'pre', training: [], tests: pre.tests, weeks, preDone };

  const current = weeks.find((w) => !w.complete);
  if (current) {
    return { stage: 'week', week: current.week, phase: current.phase, training: current.training, tests: current.tests, weeks };
  }

  const post = bigTestProgress(sessions, 'post');
  if (!post.complete) return { stage: 'post', training: [], tests: post.tests, weeks };

  const retentionDate = new Date(new Date(post.finishedAt).getTime() + RETENTION_DAYS * DAY);
  const retention = bigTestProgress(sessions, 'retention');
  if (retention.complete) return { stage: 'complete', training: [], tests: retention.tests, weeks, retentionDate };
  if (now < retentionDate) {
    const daysToRetention = Math.ceil((retentionDate - now) / DAY);
    return { stage: 'retention-wait', training: [], tests: retention.tests.map((t) => ({ ...t, unlocked: false })), weeks, daysToRetention, retentionDate };
  }
  return { stage: 'retention', training: [], tests: retention.tests, weeks, retentionDate };
}

/**
 * Context to store on a new protocol session for `taskId`, or `{ blocked: reason }` when the
 * protocol doesn't allow that task right now.
 */
export function protocolContext(state, taskId) {
  const base = { mode: 'protocol' };
  if (state.stage === 'week') {
    const tr = state.training.find((t) => t.task === taskId);
    if (tr) {
      if (tr.done >= tr.target) return { blocked: `You've done all ${tr.target} sessions of this task for week ${state.week}. Extra practice goes in the Practice tab.` };
      return { ...base, stage: 'week', week: state.week, phase: state.phase, role: 'training' };
    }
    const te = state.tests.find((t) => t.task === taskId);
    if (te) {
      if (!te.unlocked) return { blocked: `The week ${state.week} test unlocks after all training sessions for the week are done.` };
      if (te.done) return { blocked: `You've already taken this test for week ${state.week}.` };
      return { ...base, stage: 'week', week: state.week, phase: state.phase, role: 'test' };
    }
    return { blocked: `This task isn't part of week ${state.week}. Use the Practice tab to run it.` };
  }
  if (['pre', 'post', 'retention'].includes(state.stage)) {
    const te = state.tests.find((t) => t.task === taskId);
    if (!te) return { blocked: 'Only the tests are part of this stage.' };
    if (te.done) return { blocked: 'Already done.' };
    return { ...base, stage: state.stage, role: 'test' };
  }
  if (state.stage === 'retention-wait') return { blocked: `The retention test unlocks in ${state.daysToRetention} days.` };
  return { blocked: 'The protocol is complete.' };
}

export const practiceContext = () => ({ mode: 'practice', role: 'practice' });

/** Human label for a stored session's context. */
export function contextLabel(c) {
  if (c?.mode !== 'protocol') return 'Practice';
  if (c.stage === 'week') return `Week ${c.week} ${c.role === 'test' ? 'test' : 'training'}`;
  return { pre: 'Pre-test', post: 'Post-test', retention: 'Retention test' }[c.stage] || 'Protocol';
}
