// Simple / Complex / Hypercomplex Speed.
//
// Per trial: 1500 ms cue (target name on screen + sung target), then N notes (1000 ms each).
// Space = "that's the target". Response window from note onset (1750 / 1250 / 1000 ms).
// A press, or the end of the window, stops the note and shows 500 ms of feedback:
// "That was the target note" (green) / "That was not the target note" (red).
// 1500 ms rest between trials.
import { h, clear, wait } from '../ui/dom.js';
import { engine } from '../audio/engine.js';
import { pcParts, pcName, midiOf, pc, octave } from '../data/notes.js';
import { speedTargets, speedTrial, notePool, speedStats } from './sequences.js';
import { introScreen, preloadScreen, beginSession, finishSession, saveProgress, taskFrame } from './common.js';

export async function runSpeedTask(stage, cfg, { signal, context, rng = Math.random }) {
  await engine.init();
  const has = (t, m) => engine.has(t, m);
  cfg = await introScreen(stage, cfg, (c) => h('ul', { class: 'facts' },
    h('li', {}, `${c.repeats * c.targetPcs.length} trials × ${c.notesPerTrial} notes, ${c.targetsPerTrial} targets per trial`),
    h('li', {}, `Targets: ${c.targetPcs.map(pcName).join(' ')}`),
    h('li', {}, `Respond within ${c.windowMs} ms of each note's onset`),
    h('li', {}, `Timbres: ${c.timbres.map((t) => engine.timbreLabel(t)).join(', ')}`),
  ), signal);
  const sungCue = cfg.sungCue !== false;
  const showFeedback = cfg.feedback !== false;

  // preload everything this task can play
  const pool = notePool({ ...cfg, pcs: [...new Set([...cfg.targetPcs, ...cfg.distractorPcs])] }, has);
  const sung = sungCue ? cfg.targetPcs.map((p) => engine.sungPath(midiOf(p, 4))).filter(Boolean) : [];
  await preloadScreen(stage, [...pool.map((n) => engine.notePath(n.timbre, n.midi)), ...sung]);

  const session = await beginSession(cfg, context);
  const frame = taskFrame(cfg);
  // touch screens have no Space key: a big pad below the display does the same job
  const tapPad = h('button', { class: 'tap-pad', type: 'button', 'aria-label': 'Target (same as Space)' }, 'Tap for target');
  frame.root.append(tapPad);
  clear(stage).append(frame.root);

  const targets = speedTargets(cfg, rng).slice(0, cfg.maxTrials || Infinity);
  for (let t = 0; t < targets.length; t++) {
    const targetPc = targets[t];
    const notes = speedTrial(cfg, targetPc, has, rng);

    // ---- cue
    clear(frame.main).append(h('div', { class: 'speed-display' }, cueView(targetPc)));
    const sungPath = sungCue && engine.sungPath(midiOf(targetPc, 4));
    if (sungPath) engine.play(sungPath, engine.now() + 0.02);
    await wait(cfg.cueMs, signal);

    // ---- notes
    // the target name stays on screen (where a fixation cross would be); feedback appears below it
    // same view as the cue, so the name doesn't move or shrink between cue and notes
    const fb = h('div', { class: 'feedback', style: { visibility: 'hidden' } }, '\u00a0');
    clear(frame.main).append(h('div', { class: 'speed-display' }, cueView(targetPc), fb));

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      fb.style.visibility = 'hidden';
      const res = await playAndListen(n, cfg.windowMs, signal, tapPad);
      fb.style.visibility = showFeedback ? 'visible' : 'hidden';
      fb.className = 'feedback ' + (n.isTarget ? 'is-target' : 'not-target');
      fb.textContent = n.isTarget ? 'That was the target note' : 'That was not the target note';
      session.trials.push({
        trial: t, index: i, targetPc, timbre: n.timbre, midi: n.midi, pc: pc(n.midi), octave: octave(n.midi),
        isTarget: n.isTarget, pressed: res.pressed, rt: res.rt,
      });
      await wait(cfg.feedbackMs, signal);
    }
    await saveProgress(session);

    // ---- rest
    if (t < targets.length - 1) {
      clear(frame.main).append(h('div', { class: 'rest' }, 'Rest'));
      await wait(cfg.restMs, signal);
    }
  }
  return finishSession(session, speedStats(session.trials));
}

/** Play one note and wait for Space (or a tap on `pad`) within the response window. */
function playAndListen(note, windowMs, signal, pad) {
  return new Promise(async (resolve, reject) => {
    let buf;
    try { buf = await engine.load(engine.notePath(note.timbre, note.midi)); } catch (e) { return reject(e); }
    const when = engine.now() + 0.03;
    const handle = engine.playBuffer(buf, when);
    const onsetPerf = engine.ctxTimeToPerf(when);
    let settled = false;
    const finish = (pressed, rt) => {
      if (settled) return; settled = true;
      window.removeEventListener('keydown', onKey);
      pad?.removeEventListener('pointerdown', onTap);
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
      handle.stop(engine.now(), 0.02);
      resolve({ pressed, rt });
    };
    const respond = (e) => {
      e.preventDefault();
      const rt = e.timeStamp - onsetPerf;
      if (rt < 0) return; // pressed before the note was audible
      finish(true, rt);
    };
    const onKey = (e) => { if (e.code === 'Space' && !e.repeat) respond(e); };
    const onTap = (e) => respond(e);
    const onAbort = () => { settled = true; window.removeEventListener('keydown', onKey); pad?.removeEventListener('pointerdown', onTap); clearTimeout(timer); handle.stop(); reject(new DOMException('aborted', 'AbortError')); };
    window.addEventListener('keydown', onKey);
    pad?.addEventListener('pointerdown', onTap);
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => finish(false, null), Math.max(0, onsetPerf + windowMs - performance.now()));
  });
}

/** The large target view: the note name, used for the cue and throughout the notes. */
function cueView(p) {
  return h('div', { class: 'cue' }, h('div', { class: 'cue-note' }, noteLabel(p)));
}

/** Big on-screen note name; in 'both' mode the letter sits smaller underneath. */
function noteLabel(p) {
  const { main, sub } = pcParts(p);
  return [main, sub ? h('span', { class: 'note-sub' }, sub) : null];
}
