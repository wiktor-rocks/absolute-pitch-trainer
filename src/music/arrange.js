// Turn a melody definition into timed note events in any key, with optional accompaniment.
// Pure: no audio. Events are { timbre, midi, time (s), dur (s), gain, role }.
import { parseMelody, parseChords, parseNoteName, TRAINING_SONGS, TEST_SONGS } from '../data/melodies.js';
import { mulberry32, pick, randInt, shuffle } from '../util/random.js';
import { pc } from '../data/notes.js';

export const MELODY_TIMBRES = ['piano', 'flute', 'clarinet', 'guitar', 'harpsichord', 'cello'];
export const ACCOMP_TIMBRES = ['piano', 'harpsichord', 'guitar'];
export const ARRANGEMENTS = ['solo', 'chords', 'bassChords'];

/**
 * @param {object} song                 entry from melodies.js
 * @param {object} o
 * @param {number} o.tonicPc            target key (pitch class of tonic)
 * @param {string} o.melodyTimbre
 * @param {string} [o.accompTimbre]
 * @param {string} [o.arrangement]      'solo' | 'chords' | 'bassChords'
 * @param {number} [o.tempo]            multiplier on song.bpm
 * @param {number} [o.maxSec]           loop and cut to this length (null = play once)
 * @param {number} [o.startBar]         start the excerpt at this bar
 * @param {(t:string,m:number)=>boolean} o.has   sample availability
 */
export function arrange(song, o) {
  const { events: mel, totalBeats } = parseMelody(song);
  const chords = parseChords(song, totalBeats);
  const songTonic = parseNoteName(song.tonic);
  const bpm = song.bpm * (o.tempo || 1);
  const spb = 60 / bpm;
  const arrangement = o.arrangement || 'solo';
  const has = o.has;

  // transpose: smallest shift to the target pitch class, then choose an octave that fits
  let shift = ((o.tonicPc - pc(songTonic)) % 12 + 12) % 12;
  if (shift > 6) shift -= 12;
  const melodyNotes = mel.filter((e) => e.midi != null).map((e) => e.midi);
  const lo = Math.min(...melodyNotes), hi = Math.max(...melodyNotes);
  const center = (lo + hi) / 2;
  const candidates = [-24, -12, 0, 12, 24]
    .map((k) => shift + k)
    .filter((s) => melodyNotes.every((m) => has(o.melodyTimbre, m + s)))
    .sort((a, b) => Math.abs(center + a - 67) - Math.abs(center + b - 67));
  if (!candidates.length) return null;
  const T = candidates[0];
  const tonicMidi = songTonic + T;

  // optional start offset (in bars, honouring pickup)
  const startBeat = o.startBar ? (song.pickup || 0) + o.startBar * song.beatsPerBar : 0;

  const out = [];
  const passLen = totalBeats * spb;
  const maxSec = o.maxSec ?? null;
  let passStart = -startBeat * spb;
  let guard = 0;
  do {
    for (const e of mel) {
      if (e.midi == null) continue;
      const time = passStart + e.beat * spb;
      if (time < -1e-6) continue;
      out.push({ timbre: o.melodyTimbre, midi: e.midi + T, time, dur: e.beats * spb, gain: 1, role: 'melody' });
    }
    if (arrangement !== 'solo') {
      for (const c of chords) {
        const time = passStart + c.beat * spb;
        if (time < -1e-6) continue;
        const dur = c.beats * spb;
        const rootPc = (pc(tonicMidi) + c.root) % 12;
        // close-position chord with its root in the octave below the melody's tonic
        const chordBase = tonicMidi - 12 - pc(tonicMidi) + rootPc;
        const root = chordBase < tonicMidi - 14 ? chordBase + 12 : chordBase;
        for (const iv of c.intervals.slice(0, 3)) {
          const m = root + iv;
          if (has(o.accompTimbre, m)) out.push({ timbre: o.accompTimbre, midi: m, time, dur, gain: 0.32, role: 'chord' });
        }
        if (arrangement === 'bassChords') {
          let b = root - 12;
          const bassTimbre = has('cello', b) ? 'cello' : o.accompTimbre;
          if (has(bassTimbre, b)) out.push({ timbre: bassTimbre, midi: b, time, dur, gain: 0.5, role: 'bass' });
        }
      }
    }
    passStart += passLen;
  } while (maxSec != null && passStart < maxSec && ++guard < 50);

  const events = maxSec != null ? out.filter((e) => e.time < maxSec - 0.25) : out;
  if (maxSec != null) for (const e of events) e.dur = Math.min(e.dur, maxSec - e.time);
  events.sort((a, b) => a.time - b.time);
  const duration = Math.max(...events.map((e) => e.time + e.dur));
  return { events, duration, tonicPc: pc(tonicMidi), tonicMidi };
}

// ---------------------------------------------------------------- Name That Key pool

/** Deterministic pool of ~300 training excerpts (song × key × arrangement × timbre × tempo). */
export function buildKeyPool(size = 300, seed = 20250101) {
  const rng = mulberry32(seed);
  const pool = [];
  for (let i = 0; i < size; i++) {
    const song = TRAINING_SONGS[i % TRAINING_SONGS.length];
    const bars = Math.ceil(parseMelody(song).totalBeats / song.beatsPerBar);
    pool.push({
      id: `ntk-${i}`,
      songId: song.id,
      tonicPc: randInt(rng, 12),
      arrangement: pick(rng, ARRANGEMENTS),
      melodyTimbre: pick(rng, MELODY_TIMBRES),
      accompTimbre: pick(rng, ACCOMP_TIMBRES),
      tempo: 0.88 + rng() * 0.24,
      startBar: bars > 8 && rng() < 0.5 ? 4 * randInt(rng, Math.floor(bars / 4)) : 0,
    });
  }
  return pool;
}

export const songById = (id) => [...TRAINING_SONGS, ...TEST_SONGS].find((s) => s.id === id);

// ---------------------------------------------------------------- Name That Key Test

// Fixed scramble of pitch classes so the song→key assignment isn't a simple chromatic walk.
const NTKT_BASE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

/**
 * Hard-coded song→key assignment for the n-th administration of the test.
 * Each administration uses every pitch class exactly once; because the offset steps by 5
 * (coprime with 12), no song repeats a key within 12 administrations.
 */
export function ntktAssignment(occasion) {
  return TEST_SONGS.map((song, i) => ({
    songId: song.id,
    tonicPc: (NTKT_BASE[i] + 5 * occasion) % 12,
  }));
}

/** Presentation order for an administration (shuffled, but reproducible). */
export function ntktOrder(occasion) {
  return shuffle(mulberry32(7919 * (occasion + 1)), ntktAssignment(occasion));
}
