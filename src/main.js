// App shell: hash router, settings, task launching.
import { h, clear, fmtPct, fmtMs } from './ui/dom.js';
import { TASKS } from './tasks/configs.js';
import { runSpeedTask } from './tasks/speedTask.js';
import { runAccuracyTask } from './tasks/accuracyTask.js';
import { runKeyTask } from './tasks/keyTask.js';
import { renderProtocol } from './ui/dashboard.js';
import { renderPractice } from './ui/practice.js';
import { listSessions } from './store/progress.js';
import { protocolState, protocolContext, practiceContext, contextLabel } from './protocol.js';
import { renderResults } from './ui/results.js';
import { engine } from './audio/engine.js';
import { getSettings, saveSettings, exportAll, importAll, resetAll } from './store/progress.js';
import { NAMINGS, getNaming, setNaming } from './data/notes.js';

const stage = document.getElementById('stage');
const nav = document.getElementById('nav');
let currentAbort = null;

const RUNNERS = { speed: runSpeedTask, wheel: runAccuracyTask, key: runKeyTask };

// Note naming must be known before anything draws a note name.
const settingsReady = getSettings().then((st) => setNaming(st.naming)).catch(() => {});

async function route() {
  currentAbort?.abort();
  currentAbort = null;
  await settingsReady;
  const hash = location.hash || '#/';
  const [, page, arg] = hash.split('/');
  const inTask = (page === 'task' || page === 'protocol') && TASKS[arg];
  document.body.classList.toggle('in-task', !!inTask);
  const tab = page === 'protocol' ? '' : page === 'task' ? 'practice' : page || '';
  for (const a of nav.querySelectorAll('a')) a.classList.toggle('active', a.getAttribute('href') === `#/${tab}`);
  try {
    if (page === 'protocol' && TASKS[arg]) return await runProtocolTask(TASKS[arg]);
    if (page === 'task' && TASKS[arg]) {
      // Practice runs can be customized; the overrides are applied on the intro screen.
      const { practiceOverrides } = await getSettings();
      return await runTask({ ...TASKS[arg], customizable: true, overrides: practiceOverrides?.[arg] || {} }, practiceContext(), '#/practice');
    }
    if (page === 'practice') return renderPractice(stage, (await getSettings()).practiceOverrides || {});
    if (page === 'results') return await renderResults(stage);
    if (page === 'settings') return await renderSettings();
    return await renderProtocol(stage);
  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.error(e);
    clear(stage).append(h('div', { class: 'page' }, h('section', { class: 'card error' }, h('h2', {}, 'Something went wrong'), h('pre', {}, String(e?.message || e)))));
  }
}

// `?quick` in the URL shrinks every task (for development / smoke testing).
function quickify(cfg) {
  if (!new URLSearchParams(location.search).has('quick')) return cfg;
  if (cfg.kind === 'speed') return { ...cfg, notesPerTrial: 6, targetsPerTrial: 2, repeats: 1, maxTrials: 2 };
  if (cfg.kind === 'wheel') return { ...cfg, blocks: cfg.blocks.map((b) => ({ ...b, mode: 'sample', n: 3 })) };
  return { ...cfg, trials: 2, maxItems: 2 };
}

/** Protocol launch: the protocol decides whether this task is allowed right now. */
async function runProtocolTask(cfg) {
  const ctx = protocolContext(protocolState(await listSessions()), cfg.id);
  if (ctx.blocked) {
    clear(stage).append(h('div', { class: 'screen center' },
      h('div', { class: 'eyebrow' }, 'Not available yet'), h('h1', {}, cfg.name), h('p', { class: 'lead' }, ctx.blocked),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/' }, 'Back to protocol'), h('a', { class: 'btn', href: '#/practice' }, 'Practice instead'))));
    return;
  }
  return runTask(cfg, ctx, '#/');
}

async function runTask(cfg, context, backHref) {
  cfg = quickify(cfg);
  const ac = new AbortController();
  currentAbort = ac;
  const onKey = (e) => {
    if (e.code === 'Escape') { ac.abort(); location.hash = backHref; }
    if (e.code === 'Tab') e.preventDefault(); // no focus hopping during tasks
  };
  window.addEventListener('keydown', onKey);
  try {
    await engine.init();
    const session = await RUNNERS[cfg.kind](stage, { ...cfg, contextLabel: contextLabel(context) }, { signal: ac.signal, context });
    showSummary(cfg, session, backHref);
  } finally {
    window.removeEventListener('keydown', onKey);
  }
}

function showSummary(cfg, session, backHref) {
  const s = session.summary;
  const stats = cfg.kind === 'speed'
    ? [['Hits', `${s.hits} / ${s.hits + s.misses}`], ['False alarms', `${s.falseAlarms} / ${s.falseAlarms + s.correctRejections}`],
      ['d′', s.dPrime.toFixed(2)], ['Median hit RT', fmtMs(s.medianRt)]]
    : [['Correct', fmtPct(s.accuracy)], ['Within ±1 semitone', fmtPct(s.withinSemitone)],
      ...Object.entries(s.byBlock).filter(() => cfg.kind === 'wheel').map(([b, v]) => [`Block ${b}`, fmtPct(v.accuracy)]),
      ['Median RT', fmtMs(s.medianRt)]];
  const byTimbre = cfg.kind !== 'speed' && cfg.kind !== 'key'
    ? h('div', { class: 'chips' }, Object.entries(s.byTimbre).map(([t, v]) => h('span', { class: 'chip' }, `${engine.timbreLabel(t)} ${fmtPct(v.accuracy)}`)))
    : null;
  const custom = session.custom ? h('div', { class: 'chips' }, session.custom.labels.map((l) => h('span', { class: 'chip muted' }, l))) : null;
  clear(stage).append(h('div', { class: 'screen center' },
    h('div', { class: 'eyebrow' }, `Session complete · ${contextLabel(session.context)}${session.custom ? ' · customized' : ''}`),
    h('h1', {}, cfg.name),
    custom,
    h('div', { class: 'stats' }, stats.map(([k, v]) => h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, v), h('div', { class: 'stat-label' }, k)))),
    byTimbre,
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: backHref }, backHref === '#/' ? 'Back to protocol' : 'Back to practice'), h('a', { class: 'btn', href: '#/results' }, 'All results'))));
}

async function renderSettings() {
  const settings = await getSettings();
  const testBtn = h('button', { class: 'btn' }, 'Play test sounds');
  testBtn.onclick = async () => {
    await engine.init(); await engine.resume();
    // the same note on every timbre, back to back, to check the loudness match
    let t = engine.now() + 0.05;
    for (const timbre of ['piano', 'flute', 'clarinet', 'cello', 'guitar', 'harpsichord', 'square']) {
      if (!engine.has(timbre, 69)) continue;
      engine.play(engine.notePath(timbre, 69), t);
      t += 1.1;
    }
  };

  const namingSelect = h('select', { 'aria-label': 'Note names' },
    Object.entries(NAMINGS).map(([k, label]) => h('option', { value: k, selected: k === getNaming() }, label)));
  namingSelect.onchange = async () => { setNaming(namingSelect.value); await saveSettings({ naming: namingSelect.value }); };

  const exportBtn = h('button', { class: 'btn' }, 'Export data (JSON)');
  exportBtn.onclick = async () => {
    const blob = new Blob([JSON.stringify(await exportAll(), null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `ap-trainer-${new Date().toISOString().slice(0, 10)}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const file = h('input', { type: 'file', accept: 'application/json', hidden: true });
  file.onchange = async () => {
    try { const n = await importAll(JSON.parse(await file.files[0].text())); alert(`Imported ${n} sessions.`); }
    catch (e) { alert('Import failed: ' + e.message); }
  };
  const importBtn = h('button', { class: 'btn' }, 'Import data…');
  importBtn.onclick = () => file.click();
  const resetBtn = h('button', { class: 'btn danger' }, 'Erase all data');
  resetBtn.onclick = async () => { if (confirm('Erase all sessions and settings? This cannot be undone.')) { await resetAll(); location.hash = '#/'; } };

  let credits = null;
  try {
    const m = await engine.init();
    credits = h('ul', { class: 'facts' }, Object.entries(m.timbres).map(([k, t]) => h('li', {}, h('b', {}, t.label), ` — ${t.credit} (${Object.keys(t.notes).length} notes)`)),
      h('li', {}, h('b', {}, 'Sung cues'), Object.values(m.sung || {}).some((c) => c.source) ? ' — recorded (assets/sung/)' : ' — formant synthesis'));
  } catch { /* no samples */ }

  clear(stage).append(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', {}, 'Settings')),
    h('section', { class: 'card' }, h('h2', {}, 'Audio'),
      h('p', { class: 'hint' }, 'Every sound is matched for perceived loudness (−24 LUFS). Set a comfortable level once with the master volume in the top bar, then leave it. The test plays A4 on each instrument in turn.'),
      h('div', { class: 'row' }, testBtn)),
    h('section', { class: 'card' }, h('h2', {}, 'Note names'),
      h('p', { class: 'hint' }, 'How notes are named on screen: the Speed-task cue, the pitch wheel, feedback captions and the confusion matrix. Solfège by sound gives each semitone one syllable — Do Di Re Ri Mi Fa Fi Sol Si La Li Ti — so C♯ and D♭ are both Di. Solfège + letter shows the syllable with its letter name beneath it. Results are stored as pitch classes, so switching never affects your data. The sung cues are whatever is recorded in assets/sung/; re-record them with the syllables and rebuild the samples to match.'),
      h('div', { class: 'row' }, namingSelect)),
    h('section', { class: 'card' }, h('h2', {}, 'Data'),
      h('p', { class: 'hint' }, 'Results are stored in this browser (IndexedDB). Export regularly to keep a backup.'),
      h('div', { class: 'row' }, exportBtn, importBtn, file, resetBtn)),
    credits ? h('section', { class: 'card' }, h('h2', {}, 'Sample credits'), credits) : null));
}

// ---- master volume (top bar), persisted
async function initMasterVolume() {
  const input = document.getElementById('master-volume');
  const label = document.getElementById('master-volume-value');
  const show = (db) => { label.textContent = db <= -40 ? 'mute' : `${db > 0 ? '+' : ''}${db} dB`; };
  const settings = await getSettings();
  const db = Number.isFinite(settings.volumeDb) ? settings.volumeDb : 0;
  input.value = String(db); show(db); engine.setVolumeDb(db);
  input.addEventListener('input', () => { const v = Number(input.value); show(v); engine.setVolumeDb(v); });
  input.addEventListener('change', () => saveSettings({ volumeDb: Number(input.value) }));
  // keep keyboard focus away from the slider during tasks (Space / arrows are task keys)
  input.addEventListener('pointerup', () => input.blur());
}

window.addEventListener('hashchange', route);
initMasterVolume();
route();
