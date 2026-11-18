// Accuracy Training (with feedback) and Weekly Test (without).
//
// Block 1: the 24 piano notes C4–B5, each twice, shuffled (48 trials).
// Block 2: 48 notes sampled from piano/cello/clarinet/harpsichord (+ square in the test), C4–B5.
// Each trial: the note plays as the wheel appears; unlimited response time.
// Feedback (training only): the correct category is highlighted and the note is replayed.
// 1000 ms of noise between trials.
import { h, clear, wait } from '../ui/dom.js';
import { engine } from '../audio/engine.js';
import { pcName, pc, octave } from '../data/notes.js';
import { wheelBlock, notePool, wheelStats } from './sequences.js';
import { createPitchWheel } from '../ui/pitchWheel.js';
import { introScreen, preloadScreen, breakScreen, beginSession, finishSession, saveProgress, taskFrame } from './common.js';

export async function runAccuracyTask(stage, cfg, { signal, context, rng = Math.random }) {
  await engine.init();
  const has = (t, m) => engine.has(t, m);
  cfg = await introScreen(stage, cfg, (c) => h('ul', { class: 'facts' },
    ...c.blocks.map((b) => h('li', {}, `${b.label}: ${b.mode === 'eachTwice' ? notePool(b, has).length * 2 : Math.min(b.n, notePool(b, has).length)} notes`)),
    c.pcs ? h('li', {}, `Notes: ${c.pcs.map(pcName).join(' ')}`) : null,
    h('li', {}, c.feedback ? 'Feedback after every answer' : 'No feedback'),
  ), signal);

  const blocks = cfg.blocks.map((b) => wheelBlock(b, has, rng));
  await preloadScreen(stage, blocks.flat().map((n) => engine.notePath(n.timbre, n.midi)));

  const session = await beginSession(cfg, context);
  const frame = taskFrame(cfg);
  let answerResolve = null;
  const wheel = createPitchWheel({ onPick: (p, e) => answerResolve?.({ p, ts: e.timeStamp }), allowed: cfg.pcs || null });
  const caption = h('div', { class: 'wheel-caption' });
  const wrap = h('div', { class: 'wheel-wrap' }, wheel.el, caption);

  const total = blocks.reduce((a, b) => a + b.length, 0);
  let count = 0;
  for (let b = 0; b < blocks.length; b++) {
    await breakScreen(stage, cfg.blocks[b].label, b === 0 ? 'Click the name of each note you hear.' : (cfg.custom ? 'Same task, next block.' : 'Same task, different timbres.'), signal);
    clear(stage).append(frame.root);
    clear(frame.main).append(wrap);

    for (let i = 0; i < blocks[b].length; i++) {
      const n = blocks[b][i];
      count++;
      frame.status.textContent = `Block ${b + 1} · ${i + 1} / ${blocks[b].length}`;
      wheel.reset(); caption.textContent = ''; wrap.classList.remove('masked');
      const buf = await engine.load(engine.notePath(n.timbre, n.midi));
      const when = engine.now() + 0.03;
      engine.playBuffer(buf, when);
      const onsetPerf = engine.ctxTimeToPerf(when);
      wheel.enable(true);
      const ans = await new Promise((resolve, reject) => {
        answerResolve = resolve;
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      });
      answerResolve = null;
      wheel.enable(false);
      const truth = pc(n.midi);
      const correct = ans.p === truth;
      session.trials.push({
        block: b + 1, index: i, timbre: n.timbre, midi: n.midi, truth, octave: octave(n.midi),
        answer: ans.p, correct, rt: Math.max(0, ans.ts - onsetPerf),
      });

      if (cfg.feedback) {
        wheel.mark(truth, 'correct');
        if (!correct) wheel.mark(ans.p, 'wrong');
        caption.textContent = `${pcName(truth)}${octave(n.midi)} · ${engine.timbreLabel(n.timbre)}`;
        caption.className = 'wheel-caption ' + (correct ? 'ok' : 'bad');
        if (cfg.replay !== false) engine.playBuffer(buf, engine.now() + 0.05);
        await wait(1150, signal);
      } else {
        wheel.mark(ans.p, 'chosen');
        await wait(150, signal);
      }
      if (count % 8 === 0) saveProgress(session);
      // between-trial noise
      wrap.classList.add('masked');
      wheel.reset(); caption.textContent = '';
      if (cfg.noiseMs > 0) engine.noise(cfg.noiseMs, engine.now() + 0.02);
      await wait(cfg.noiseMs + 30, signal);
    }
  }
  return finishSession(session, wheelStats(session.trials));
}
