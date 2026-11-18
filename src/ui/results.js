// Results: progress charts per task + session history with details.
import { h, clear, fmtPct, fmtMs, fmtDateTime, fmtDate } from './dom.js';
import { TASKS } from '../tasks/configs.js';
import { listSessions, deleteSession } from '../store/progress.js';
import { lineChart, confusionHeatmap } from './charts.js';

const C1 = 'var(--series-1)', C2 = 'var(--series-2)', C3 = 'var(--series-3)';
import { contextLabel as roleLabel } from '../protocol.js';

export async function renderResults(stage) {
  const completed = (await listSessions()).filter((s) => s.completed);
  // the built-in charts only plot sessions run with the study's settings
  const sessions = completed.filter((s) => !s.custom);
  clear(stage);
  const page = h('div', { class: 'page' }, h('header', { class: 'page-head' }, h('h1', {}, 'Results')));
  stage.append(page);
  if (!completed.length) { page.append(h('section', { class: 'card' }, h('p', {}, 'No completed sessions yet.'))); return; }

  const by = (task) => sessions.filter((s) => s.task === task);
  const idx = (arr) => arr.map((s, i) => ({ s, i: i + 1 }));
  const xLabel = (arr) => (x) => { const s = arr[x - 1]; return s ? fmtDate(s.startedAt) : ''; };

  // Weekly test: block 1 vs block 2 accuracy
  const wt = by('weeklyTest');
  if (wt.length) page.append(section('Weekly Test accuracy', 'No feedback. Block 1: piano C4–B5. Block 2: mixed timbres incl. square wave. Chance = 8%.',
    lineChart({
      series: [
        { name: 'Block 1 (piano)', color: C1, points: idx(wt).map(({ s, i }) => ({ x: i, y: s.summary.byBlock['1']?.accuracy ?? 0, label: roleLabel(s.context) })) },
        { name: 'Block 2 (mixed)', color: C2, points: idx(wt).map(({ s, i }) => ({ x: i, y: s.summary.byBlock['2']?.accuracy ?? 0, label: roleLabel(s.context) })) },
      ], yDomain: [0, 1], yFmt: fmtPct, xFmt: xLabel(wt), yLabel: 'Weekly test accuracy',
    })));

  const at = by('accuracy');
  if (at.length) page.append(section('Accuracy Training', 'Proportion correct per session (with feedback).',
    lineChart({
      series: [
        { name: 'Block 1 (piano)', color: C1, points: idx(at).map(({ s, i }) => ({ x: i, y: s.summary.byBlock['1']?.accuracy ?? 0 })) },
        { name: 'Block 2 (mixed)', color: C2, points: idx(at).map(({ s, i }) => ({ x: i, y: s.summary.byBlock['2']?.accuracy ?? 0 })) },
      ], yDomain: [0, 1], yFmt: fmtPct, xFmt: xLabel(at), yLabel: 'Accuracy training',
    })));

  // Speed tasks: d' and hit RT, one chart each (never dual-axis)
  const speedIds = ['simpleSpeed', 'complexSpeed', 'hypercomplexSpeed'];
  const colors = [C1, C2, C3];
  const sp = speedIds.map((id) => by(id));
  if (sp.some((a) => a.length)) {
    const all = sessions.filter((s) => speedIds.includes(s.task));
    const order = new Map(all.map((s, i) => [s, i + 1]));
    const allLabel = (x) => (all[x - 1] ? fmtDate(all[x - 1].startedAt) : '');
    page.append(section('Speed tasks — sensitivity (d′)', 'Higher is better: hits vs. false alarms.',
      lineChart({ series: speedIds.map((id, k) => ({ name: TASKS[id].name, color: colors[k], points: sp[k].map((s) => ({ x: order.get(s), y: s.summary.dPrime, label: `hits ${fmtPct(s.summary.hitRate)}, FA ${fmtPct(s.summary.faRate)}` })) })).filter((s) => s.points.length),
        yFmt: (y) => y.toFixed(1), xFmt: allLabel, yLabel: "d'" })));
    page.append(section('Speed tasks — median hit reaction time', 'From note onset to Space press, correct detections only.',
      lineChart({ series: speedIds.map((id, k) => ({ name: TASKS[id].name, color: colors[k], points: sp[k].filter((s) => s.summary.medianRt != null).map((s) => ({ x: order.get(s), y: s.summary.medianRt })) })).filter((s) => s.points.length),
        yFmt: (y) => `${Math.round(y)}`, xFmt: allLabel, yLabel: 'RT (ms)' })));
  }

  const keyIds = ['nameThatKey', 'nameThatKeyTest'];
  const ks = keyIds.map((id) => by(id));
  if (ks.some((a) => a.length)) {
    const all = sessions.filter((s) => keyIds.includes(s.task));
    const order = new Map(all.map((s, i) => [s, i + 1]));
    page.append(section('Name That Key', 'Proportion of keys named correctly. Chance = 8%.',
      lineChart({ series: keyIds.map((id, k) => ({ name: TASKS[id].name, color: colors[k], points: ks[k].map((s) => ({ x: order.get(s), y: s.summary.accuracy })) })).filter((s) => s.points.length),
        yDomain: [0, 1], yFmt: fmtPct, xFmt: (x) => (all[x - 1] ? fmtDate(all[x - 1].startedAt) : '') })));
  }

  // Aggregate confusion (all wheel tests)
  const wheelTests = sessions.filter((s) => s.task === 'weeklyTest' || s.task === 'accuracy');
  if (wheelTests.length) {
    const m = Array.from({ length: 12 }, () => new Array(12).fill(0));
    for (const s of wheelTests) s.summary.confusion.forEach((row, i) => row.forEach((v, j) => (m[i][j] += v)));
    page.append(section('Note confusions (Accuracy Training + Weekly Test, all sessions)', null, confusionHeatmap(m)));
  }

  // Customized practice: one chart per task, separate from the study's numbers
  const custom = completed.filter((s) => s.custom);
  if (custom.length) {
    page.append(h('h2', { class: 'section-title' }, 'Customized practice'));
    for (const id of Object.keys(TASKS)) {
      const cs = custom.filter((s) => s.task === id);
      if (!cs.length) continue;
      const speed = TASKS[id].kind === 'speed';
      page.append(section(`${TASKS[id].name} — customized`, `Practice runs with changed settings. Hover a point to see what was changed. ${speed ? 'd′: higher is better.' : 'Proportion correct.'}`,
        lineChart({
          series: [{ name: speed ? 'd′' : 'Accuracy', color: C1, points: idx(cs).map(({ s, i }) => ({ x: i, y: speed ? s.summary.dPrime : s.summary.accuracy, label: s.custom.labels.join(' · ') })) }],
          ...(speed ? { yFmt: (y) => y.toFixed(1), yLabel: "d'" } : { yDomain: [0, 1], yFmt: fmtPct }), xFmt: xLabel(cs),
        })));
    }
  }

  page.append(historyTable(completed.slice().reverse()));
}

function section(title, sub, body) {
  return h('section', { class: 'card' }, h('h2', {}, title), sub ? h('p', { class: 'hint' }, sub) : null, body);
}

function historyTable(sessions) {
  const rows = sessions.map((s) => {
    const sum = s.summary;
    const main = TASKS[s.task]?.kind === 'speed'
      ? `d′ ${sum.dPrime.toFixed(2)} · hits ${fmtPct(sum.hitRate)} · FA ${fmtPct(sum.faRate)} · RT ${fmtMs(sum.medianRt)}`
      : `${fmtPct(sum.accuracy)} correct · ±1 semitone ${fmtPct(sum.withinSemitone)}`;
    const del = h('button', { class: 'btn ghost small', title: 'Delete session' }, '×');
    const tr = h('tr', {}, h('td', {}, fmtDateTime(s.startedAt)), h('td', s.custom ? { title: s.custom.labels.join('\n') } : {}, TASKS[s.task]?.name || s.task, s.custom ? h('span', { class: 'muted' }, ' · custom') : null), h('td', {}, roleLabel(s.context)), h('td', {}, main), h('td', {}, del));
    del.onclick = async () => { if (confirm('Delete this session?')) { await deleteSession(s.id); tr.remove(); } };
    return tr;
  });
  return h('section', { class: 'card' }, h('h2', {}, 'Session history'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Task'), h('th', {}, 'Role'), h('th', {}, 'Result'), h('th', {}, ''))),
      h('tbody', {}, rows))));
}
