// Name That Key (training, 15 generated excerpts, feedback plays the tonic)
// and Name That Key Test (12 folk songs on piano, each pitch class once, no feedback).
import { h, clear, wait } from '../ui/dom.js';
import { engine } from '../audio/engine.js';
import { pcName } from '../data/notes.js';
import { wheelStats } from './sequences.js';
import { createPitchWheel } from '../ui/pitchWheel.js';
import { arrange, buildKeyPool, songById, ntktOrder } from '../music/arrange.js';
import { sample, pick } from '../util/random.js';
import { listSessions } from '../store/progress.js';
import { introScreen, preloadScreen, breakScreen, beginSession, finishSession, saveProgress, taskFrame } from './common.js';

const RELEASE = 0.09;

export async function runKeyTask(stage, cfg, { signal, context, rng = Math.random }) {
  await engine.init();
  const has = (t, m) => engine.has(t, m);

  cfg = await introScreen(stage, cfg, (c) => h('ul', { class: 'facts' },
    h('li', {}, c.test ? `${Math.min(12, c.maxItems || 12)} folk melodies` : `${c.trials} excerpts of ${c.excerptSec} s`),
    c.tonicPcs ? h('li', {}, `Keys: ${c.tonicPcs.map(pcName).join(' ')}`) : null,
    h('li', {}, 'Answer with the tonic (key note) of the music — you can answer while it plays'),
    h('li', {}, c.feedback ? 'Feedback shows the key and plays the tonic' : 'No feedback'),
  ), signal);

  // ---- build the item list
  let items;
  if (cfg.test) {
    const prior = (await listSessions()).filter((s) => s.task === cfg.id && s.completed).length;
    items = ntktOrder(prior).map((a) => {
      const song = songById(a.songId);
      return { song, plan: arrange(song, { tonicPc: a.tonicPc, melodyTimbre: 'piano', arrangement: 'solo', has }), occasion: prior };
    });
  } else {
    // Practice customizations redraw key / instrument / arrangement from the allowed sets
    // (only where an item falls outside them), so the pool can never run dry.
    const allow = (v, set) => (!set || set.includes(v) ? v : pick(rng, set));
    const pool = buildKeyPool().map((it) => ({ ...it,
      tonicPc: allow(it.tonicPc, cfg.tonicPcs), melodyTimbre: allow(it.melodyTimbre, cfg.melodyTimbres), arrangement: allow(it.arrangement, cfg.arrangements) }));
    items = [];
    for (const it of sample(rng, pool, pool.length)) {
      const song = songById(it.songId);
      const plan = arrange(song, { ...it, maxSec: cfg.excerptSec, has });
      if (plan) items.push({ song, plan, poolId: it.id, arrangement: it.arrangement, melodyTimbre: it.melodyTimbre });
      if (items.length === cfg.trials) break;
    }
  }
  if (cfg.maxItems) items = items.slice(0, cfg.maxItems);

  const paths = new Set();
  for (const it of items) for (const e of it.plan.events) paths.add(engine.notePath(e.timbre, e.midi, true));
  for (let p = 0; p < 12; p++) if (has('piano', 60 + p)) paths.add(engine.notePath('piano', 60 + p, true));
  await preloadScreen(stage, [...paths]);

  const session = await beginSession(cfg, context);
  if (cfg.test) session.occasion = items[0]?.occasion;
  const frame = taskFrame(cfg);
  let answerResolve = null;
  const wheel = createPitchWheel({ onPick: (p, e) => answerResolve?.({ p, ts: e.timeStamp }), allowed: cfg.tonicPcs || null });
  const caption = h('div', { class: 'wheel-caption' });
  const playing = h('div', { class: 'playing' });
  const wrap = h('div', { class: 'wheel-wrap' }, wheel.el, caption);

  await breakScreen(stage, cfg.name, 'Click the tonic of each piece on the wheel.', signal);
  clear(stage).append(frame.root);
  clear(frame.main).append(playing, wrap);

  for (let i = 0; i < items.length; i++) {
    const { song, plan } = items[i];
    frame.status.textContent = `${i + 1} / ${items.length}`;
    wheel.reset(); caption.textContent = ''; wrap.classList.remove('masked');
    playing.textContent = '♪ listening…';
    const t0 = engine.now() + 0.08;
    const handles = await scheduleEvents(plan.events, t0);
    const startPerf = engine.ctxTimeToPerf(t0);
    wheel.enable(true);
    const ans = await new Promise((resolve, reject) => {
      answerResolve = resolve;
      signal?.addEventListener('abort', () => { stopAll(handles); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
    });
    answerResolve = null;
    wheel.enable(false);
    stopAll(handles, 0.25);
    playing.textContent = '';
    const correct = ans.p === plan.tonicPc;
    session.trials.push({
      block: 1, index: i, songId: song.id, mode: song.mode, truth: plan.tonicPc, answer: ans.p, correct,
      rt: Math.max(0, ans.ts - startPerf), timbre: items[i].melodyTimbre || 'piano', arrangement: items[i].arrangement || 'solo', octave: null,
    });

    if (cfg.feedback) {
      wheel.mark(plan.tonicPc, 'correct');
      if (!correct) wheel.mark(ans.p, 'wrong');
      caption.textContent = `${pcName(plan.tonicPc)} ${song.mode} — ${song.title}`;
      caption.className = 'wheel-caption ' + (correct ? 'ok' : 'bad');
      await wait(300, signal);
      const tonic = await engine.load(engine.notePath('piano', 60 + plan.tonicPc, true));
      engine.playBuffer(tonic, engine.now() + 0.02);
      await wait(1900, signal);
    } else {
      wheel.mark(ans.p, 'chosen');
      await wait(300, signal);
    }
    saveProgress(session);
    wrap.classList.add('masked');
    wheel.reset(); caption.textContent = '';
    if (cfg.noiseMs > 0) engine.noise(cfg.noiseMs, engine.now() + 0.02);
    await wait(cfg.noiseMs + 30, signal);
  }
  const summary = wheelStats(session.trials);
  return finishSession(session, summary);
}

async function scheduleEvents(events, t0) {
  const handles = [];
  for (const e of events) {
    const buf = await engine.load(engine.notePath(e.timbre, e.midi, true));
    const start = t0 + e.time;
    const hd = engine.playBuffer(buf, start, { gain: e.gain * (e.role === 'melody' ? 0.85 : 1) });
    // release at the written note end (+ a little legato), or let the sample ring out
    const end = start + Math.min(e.dur * 0.98 + 0.04, buf.duration - RELEASE);
    hd.gainNode.gain.setValueAtTime(e.gain * (e.role === 'melody' ? 0.85 : 1), end);
    hd.gainNode.gain.linearRampToValueAtTime(0, end + RELEASE);
    hd.source.stop(end + RELEASE + 0.02);
    handles.push(hd);
  }
  return handles;
}

function stopAll(handles, fade = 0.03) {
  for (const hd of handles) {
    try {
      const g = hd.gainNode.gain;
      const now = engine.now();
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + fade);
      hd.source.stop(now + fade + 0.02);
    } catch { /* already stopped */ }
  }
}
