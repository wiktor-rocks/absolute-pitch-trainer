// Protocol tab: the guided 8-week study. Only sessions launched from here count toward it.
import { h, clear, fmtDate } from './dom.js';
import { TASKS } from '../tasks/configs.js';
import { listSessions, getSettings, saveSettings } from '../store/progress.js';
import { protocolState, WEEKS, PHASE_TASKS } from '../protocol.js';

export async function renderProtocol(stage) {
  const sessions = await listSessions();
  const { protocolWeek } = await getSettings();
  const st = protocolState(sessions, new Date(), { week: protocolWeek });
  const pickWeek = async (week) => { await saveSettings({ protocolWeek: week }); renderProtocol(stage); };
  clear(stage);
  stage.append(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', {}, 'Protocol'),
      h('p', { class: 'lead' }, 'The 8-week training study, step by step. Each week: 4 sessions of each training task, then the week’s test, which unlocks once the training is done. For extra, unscored work use the Practice tab.')),
    currentCard(st, pickWeek),
    timeline(st, pickWeek)));
}

function currentCard(st, pickWeek) {
  const card = h('section', { class: 'card status' });
  const stageTitle = {
    pre: ['Pre-test', 'Before training starts, take both tests to measure your baseline.'],
    week: [`Week ${st.week} of ${WEEKS} · Phase ${st.phase}`, 'Do 4 sessions of each training task, on any days and in any order (the study used 4 days a week). The week’s test unlocks when all 12 are done, and finishing it starts the next week.'],
    post: ['Post-test', 'Training complete. Take both tests again.'],
    'retention-wait': ['Retention test', `Take both tests again about 4 months after the post-test, on ${st.retentionDate && fmtDate(st.retentionDate.toISOString())} (${st.daysToRetention} days from now). To measure retention cleanly, avoid training in the meantime.`],
    retention: ['Retention test', 'It has been about 4 months since the post-test. Take both tests one last time.'],
    complete: ['Protocol complete', 'You have finished every stage of the study, including the retention test. See the Results tab.'],
  }[st.stage];
  card.append(h('div', { class: 'eyebrow' }, 'Now'), h('h2', {}, stageTitle[0]), h('p', {}, stageTitle[1]));
  if (st.chosen) {
    card.append(h('p', { class: 'hint' }, 'You picked this week. ',
      h('button', { class: 'link-btn', type: 'button', onclick: () => pickWeek(null) }, 'Follow progress instead')));
  }

  const items = [];
  if (st.training.length) {
    items.push(h('h3', {}, 'Training'));
    items.push(h('div', { class: 'checklist' }, st.training.map((t) => stepItem(TASKS[t.task], {
      label: `${t.done} / ${t.target}`, frac: t.done / t.target, done: t.done >= t.target,
    }))));
  }
  if (st.tests.length) {
    items.push(h('h3', {}, st.stage === 'week' ? `Week ${st.week} test` : 'Tests'));
    items.push(h('div', { class: 'checklist' }, st.tests.map((t) => stepItem(TASKS[t.task], {
      label: t.done ? 'done' : t.unlocked ? 'ready' : 'locked',
      frac: t.done ? 1 : 0, done: t.done, locked: !t.unlocked,
      lockNote: st.stage === 'week' ? 'Unlocks after this week’s training' : st.stage === 'retention-wait' ? `In ${st.daysToRetention} days` : null,
    }))));
  }
  card.append(...items);
  return card;
}

function stepItem(cfg, { label, frac, done, locked, lockNote }) {
  const inner = [
    h('div', { class: 'check-top' }, h('span', { class: 'check-name' }, (locked ? '🔒 ' : done ? '✓ ' : '') + cfg.name), h('span', { class: 'check-count' }, label)),
    h('div', { class: 'progress small' }, h('div', { class: 'progress-fill', style: { width: `${Math.min(100, frac * 100)}%` } })),
    locked && lockNote ? h('div', { class: 'hint' }, lockNote) : null,
  ];
  if (locked || done) return h('div', { class: `check-item ${locked ? 'locked' : 'done'}`, 'aria-disabled': 'true' }, inner);
  return h('a', { class: 'check-item', href: `#/protocol/${cfg.id}` }, inner);
}

function timeline(st, pickWeek) {
  const preDone = st.preDone !== false && st.stage !== 'pre';
  const postDone = ['retention-wait', 'retention', 'complete'].includes(st.stage);
  const node = (label, sub, state, extra = null) => h('div', { class: `week stage-node ${state}` }, h('div', { class: 'week-label' }, label), extra, h('div', { class: 'week-meta' }, sub));
  const weeks = st.weeks.map((w) => {
    const tDone = w.training.reduce((a, t) => a + t.done, 0);
    const tTarget = w.training.reduce((a, t) => a + t.target, 0);
    const state = w.complete ? 'complete' : st.stage === 'week' && st.week === w.week ? 'current' : '';
    const current = state === 'current';
    // any unfinished week can be picked as the one to work on
    const pickable = !w.complete && !current;
    return h(pickable ? 'button' : 'div', {
      class: `week phase-${w.phase} ${state}${pickable ? ' pickable' : ''}`,
      type: pickable ? 'button' : null,
      title: pickable ? `Work on week ${w.week}` : null,
      onclick: pickable ? () => pickWeek(w.week) : null },
      h('div', { class: 'week-label' }, `W${w.week}`),
      h('div', { class: 'progress small' }, h('div', { class: 'progress-fill', style: { width: `${(tDone / tTarget) * 100}%` } })),
      h('div', { class: 'week-meta' }, w.complete ? '✓ done' : `${tDone}/${tTarget}${w.trainingDone ? ' · test ready' : ''}`));
  });
  return h('section', { class: 'card' },
    h('h2', {}, 'Progress'),
    h('p', { class: 'hint' }, 'Tap an unfinished week to work on it.'),
    h('div', { class: 'legend' },
      h('span', { class: 'legend-item' }, h('span', { class: 'swatch phase1' }), `Phase 1: ${PHASE_TASKS[1].map((t) => TASKS[t].name).join(', ')}`),
      h('span', { class: 'legend-item' }, h('span', { class: 'swatch phase2' }), `Phase 2: ${PHASE_TASKS[2].map((t) => TASKS[t].name).join(', ')}`)),
    h('div', { class: 'stages' },
      node('Pre', preDone ? '✓ done' : 'tests', preDone ? 'complete' : st.stage === 'pre' ? 'current' : ''),
      h('div', { class: 'weeks' }, weeks),
      node('Post', postDone ? '✓ done' : 'tests', postDone ? 'complete' : st.stage === 'post' ? 'current' : ''),
      node('Retention', st.stage === 'complete' ? '✓ done' : '~4 months later', st.stage === 'complete' ? 'complete' : st.stage === 'retention' ? 'current' : '')));
}
