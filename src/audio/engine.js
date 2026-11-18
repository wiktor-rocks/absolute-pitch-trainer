// Web Audio engine: sample loading/caching, sample-accurate scheduling, noise,
// and mapping between AudioContext time and performance.now() for reaction times.

const SAMPLE_ROOT = 'samples/';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.manifest = null;
    this.buffers = new Map(); // path -> Promise<AudioBuffer>
    this.master = null;
    this.volume = 1;
  }

  async init() {
    if (!this.manifest) {
      const res = await fetch(SAMPLE_ROOT + 'manifest.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('samples/manifest.json not found — run `npm run build:samples` first.');
      this.manifest = await res.json();
    }
    return this.manifest;
  }

  /** Must be called from a user gesture the first time. */
  async resume() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: this.manifest?.sampleRate || 44100 });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      // a gentle limiter guards against chord summing in melodies
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -6; comp.knee.value = 4; comp.ratio.value = 8;
      comp.attack.value = 0.003; comp.release.value = 0.15;
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** Master volume in dB; the slider's minimum mutes. */
  setVolumeDb(db) {
    this.setVolume(db <= -40 ? 0 : Math.pow(10, db / 20));
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  // ------------------------------------------------------------ manifest helpers
  has(timbre, midi) {
    return !!this.manifest?.timbres?.[timbre]?.notes?.[midi];
  }
  notePath(timbre, midi, long = false) {
    const n = this.manifest.timbres[timbre].notes[midi];
    return long ? n.long : n.short;
  }
  sungPath(midi) {
    return this.manifest.sung?.[midi]?.file;
  }
  timbreLabel(t) {
    return this.manifest?.timbres?.[t]?.label || t;
  }

  // ------------------------------------------------------------ loading
  load(path) {
    if (!this.buffers.has(path)) {
      // cache-bust with the build timestamp so a rebuilt sample set is never served stale
      const v = this.manifest?.built ? `?v=${encodeURIComponent(this.manifest.built)}` : '';
      const p = fetch(SAMPLE_ROOT + path + v)
        .then((r) => { if (!r.ok) throw new Error('missing sample ' + path); return r.arrayBuffer(); })
        .then((ab) => this._decodeCtx().decodeAudioData(ab));
      p.catch(() => this.buffers.delete(path));
      this.buffers.set(path, p);
    }
    return this.buffers.get(path);
  }

  _decodeCtx() {
    return this.ctx || (this._offline ||= new OfflineAudioContext(1, 1, 44100));
  }

  /** Preload many paths, reporting progress (0..1). */
  async preload(paths, onProgress) {
    const uniq = [...new Set(paths)];
    let done = 0;
    await Promise.all(uniq.map((p) => this.load(p).then(() => onProgress?.(++done / uniq.length))));
  }

  // ------------------------------------------------------------ playback
  now() { return this.ctx.currentTime; }

  /**
   * Schedule a buffer. Returns a handle with stop(at, fadeSec).
   * @param {string} path
   * @param {number} when AudioContext time
   */
  async play(path, when = 0, { gain = 1, dest } = {}) {
    const buf = await this.load(path);
    return this.playBuffer(buf, when, { gain, dest });
  }

  playBuffer(buf, when = 0, { gain = 1, dest, offset = 0, duration } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest || this.master);
    const t = Math.max(when, ctx.currentTime);
    if (duration != null) src.start(t, offset, duration); else src.start(t, offset);
    let stopped = false;
    const handle = {
      when: t,
      source: src,
      gainNode: g,
      ended: new Promise((res) => (src.onended = res)),
      stop(at = ctx.currentTime, fade = 0.015) {
        if (stopped) return; stopped = true;
        const s = Math.max(at, ctx.currentTime);
        g.gain.cancelScheduledValues(s);
        g.gain.setValueAtTime(g.gain.value, s);
        g.gain.linearRampToValueAtTime(0, s + fade);
        try { src.stop(s + fade + 0.01); } catch { /* already stopped */ }
      },
    };
    return handle;
  }

  /** White noise burst (between-trial mask), level-matched roughly to note RMS. */
  noise(durMs, when = 0) {
    const ctx = this.ctx;
    const n = Math.round((durMs / 1000) * ctx.sampleRate);
    if (!this._noiseBuf || this._noiseBuf.length < n) {
      const b = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = b.getChannelData(0);
      const rmsTarget = Math.pow(10, (this.manifest?.noiseRmsDb ?? -30) / 20);
      const amp = rmsTarget * Math.sqrt(3); // uniform noise RMS = amp/sqrt(3)
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * amp;
      const f = Math.round(0.01 * ctx.sampleRate);
      for (let i = 0; i < f; i++) { d[i] *= i / f; d[n - 1 - i] *= i / f; }
      this._noiseBuf = b;
    }
    return this.playBuffer(this._noiseBuf, when, { gain: 1, duration: durMs / 1000 });
  }

  /**
   * performance.now() timestamp at which AudioContext time `t` is heard.
   * Uses getOutputTimestamp so output latency is accounted for.
   */
  ctxTimeToPerf(t) {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime) return ts.performanceTime + (t - ts.contextTime) * 1000;
    const lat = (this.ctx.outputLatency || this.ctx.baseLatency || 0);
    return performance.now() + (t - this.ctx.currentTime + lat) * 1000;
  }

  /** Resolves (via setTimeout) when ctx time `t` is about to be heard. */
  waitUntil(t) {
    const ms = this.ctxTimeToPerf(t) - performance.now();
    return sleep(Math.max(0, ms));
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const engine = new AudioEngine();
