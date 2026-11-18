// Shared task scaffolding: intro, preload, block breaks, session saving.
import { h, clear, waitForKey } from '../ui/dom.js';
import { engine } from '../audio/engine.js';
import { addSession, updateSession, getSettings, saveSettings } from '../store/progress.js';
import { normalizeOverrides, applyOverrides, validate, describeOverrides } from './customize.js';
import { createTaskEditor } from '../ui/taskEditor.js';
import { practiceContext } from '../protocol.js';

/**
 * Task intro. For practice runs (`cfg.customizable`) it includes the Customize panel.
 * `facts(cfg)` renders the summary list and is re-run as settings change.
 * @returns the config to run (the built-in one, or the customized one with `cfg.custom` set)
 */
export async function introScreen(stage, cfg, facts, signal) {
  const { customizable, overrides: saved, ...base } = cfg;
  let overrides = customizable ? normalizeOverrides(base, saved) : {};
  let effective = base;
  const factsBox = h('div', {});
  const problemsBox = h('div', { class: 'problems' });
  const btn = h('button', { class: 'btn primary big' }, 'Start');
  const has = (t, m) => engine.has(t, m);

  const update = () => {
    const problems = customizable ? validate(base, overrides, has) : [];
    effective = problems.length ? base : applyOverrides(base, overrides);
    factsBox.replaceChildren(facts(effective) || '');
    problemsBox.replaceChildren(...problems.map((p) => h('div', {}, p)));
    btn.disabled = problems.length > 0;
  };
  const editor = customizable ? createTaskEditor(base, overrides, {
    timbreLabel: (t) => engine.timbreLabel(t),
    timbreAvailable: (t) => !!engine.manifest?.timbres?.[t],
    onChange: (o) => { overrides = o; update(); },
  }) : null;
  update();

  clear(stage).append(h('div', { class: 'screen intro' },
    h('div', { class: 'eyebrow' }, cfg.contextLabel || (cfg.test ? 'Test' : 'Training')),
    h('h1', {}, cfg.name),
    h('p', { class: 'lead' }, cfg.blurb),
    factsBox,
    editor?.el || null,
    problemsBox,
    btn,
    h('p', { class: 'hint' }, 'Press Space or click Start. Esc aborts the session.'),
  ));
  btn.focus();
  for (;;) {
    await waitForKey(['Space', 'Enter'], { signal, clickEl: btn });
    if (!btn.disabled) break;
  }
  if (customizable) {
    const st = await getSettings();
    await saveSettings({ practiceOverrides: { ...st.practiceOverrides, [base.id]: overrides } });
  }
  await engine.resume();
  const labels = describeOverrides(base, overrides);
  return labels.length ? { ...effective, custom: { overrides, labels } } : effective;
}

export async function preloadScreen(stage, paths) {
  const bar = h('div', { class: 'progress-fill' });
  const label = h('div', { class: 'hint' }, `Loading ${new Set(paths).size} sounds…`);
  clear(stage).append(h('div', { class: 'screen center' }, h('div', { class: 'progress' }, bar), label));
  await engine.preload(paths, (p) => { bar.style.width = `${Math.round(p * 100)}%`; });
}

export async function breakScreen(stage, title, text, signal) {
  const btn = h('button', { class: 'btn primary' }, 'Continue');
  clear(stage).append(h('div', { class: 'screen center' }, h('h2', {}, title), text ? h('p', { class: 'lead' }, text) : null, btn,
    h('p', { class: 'hint' }, 'Space to continue')));
  btn.focus();
  await waitForKey(['Space', 'Enter'], { signal, clickEl: btn });
}

/** Create the session record up front, so aborted sessions are also kept (marked incomplete). */
export async function beginSession(cfg, context = practiceContext()) {
  const session = {
    task: cfg.id,
    startedAt: new Date().toISOString(),
    completed: false,
    context,
    ...(cfg.custom ? { custom: cfg.custom } : {}),
    trials: [],
  };
  session.id = await addSession(session);
  return session;
}

export async function finishSession(session, summary) {
  session.finishedAt = new Date().toISOString();
  session.completed = true;
  session.summary = summary;
  await updateSession(session);
  return session;
}

export async function saveProgress(session) {
  await updateSession(session);
}

/** Fixation / status line component used in tasks. */
export function taskFrame(cfg) {
  const status = h('div', { class: 'task-status' });
  const main = h('div', { class: 'task-main' });
  const root = h('div', { class: `task-frame task-${cfg.kind}` }, h('div', { class: 'task-top' }, h('span', { class: 'task-name' }, cfg.name), status), main);
  return { root, status, main };
}
