// Public-domain melodies used to generate "Name That Key" material.
//
// Notation: space-separated tokens, `|` = barline (ignored by the parser, for readability).
//   Note:  <name><octave>[:<beats>]   e.g. E4, F#4:0.5, Bb3:2      (default 1 beat)
//   Rest:  r[:<beats>]
// `tonic` is the tonic as written. Transposition preserves mode (relative pitches).
// `chords`: one roman numeral per bar (space-separated within `|` splits the bar evenly).
//   Uppercase = major, lowercase = minor, `b` prefix = flattened degree, `7` = dominant 7th.
// `pickup`: beats before the first full bar (anacrusis).

/** The 12 folk songs of the Name That Key Test (never used in training). */
export const TEST_SONGS = [
  {
    id: 'mary', title: 'Mary Had a Little Lamb', tonic: 'C4', mode: 'major', bpm: 108, beatsPerBar: 4,
    notes: 'E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4',
    chords: 'I | I | V | I | I | I | V | I',
  },
  {
    id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', tonic: 'C4', mode: 'major', bpm: 104, beatsPerBar: 4,
    notes: 'C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2',
    chords: 'I | IV I | IV I | V I | I IV | I V | I IV | I V | I | IV I | IV I | V I',
  },
  {
    id: 'birthday', title: 'Happy Birthday', tonic: 'C4', mode: 'major', bpm: 100, beatsPerBar: 3, pickup: 1,
    notes: 'G4:0.75 G4:0.25 | A4 G4 C5 | B4:2 G4:0.75 G4:0.25 | A4 G4 D5 | C5:2 G4:0.75 G4:0.25 | G5 E5 C5 | B4 A4 F5:0.75 F5:0.25 | E5 C5 D5 | C5:3',
    chords: 'I | V | V | I | I | IV | I V | I',
  },
  {
    id: 'frere', title: 'Frère Jacques', tonic: 'C4', mode: 'major', bpm: 112, beatsPerBar: 4,
    notes: 'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:2 | E4 F4 G4:2 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | C4 G3 C4:2 | C4 G3 C4:2',
    chords: 'I | I | I | I | I | I | I V | I',
  },
  {
    id: 'london', title: 'London Bridge', tonic: 'C4', mode: 'major', bpm: 112, beatsPerBar: 4,
    notes: 'G4:1.5 A4:0.5 G4 F4 | E4 F4 G4:2 | D4 E4 F4:2 | E4 F4 G4:2 | G4:1.5 A4:0.5 G4 F4 | E4 F4 G4:2 | D4:2 G4:2 | E4 C4:3',
    chords: 'I | I | V | I | I | I | V | I',
  },
  {
    id: 'rowrow', title: 'Row, Row, Row Your Boat', tonic: 'C4', mode: 'major', bpm: 300, beatsPerBar: 6,
    notes: 'C4:3 C4:3 | C4:2 D4:1 E4:3 | E4:2 D4:1 E4:2 F4:1 | G4:6 | C5 C5 C5 G4 G4 G4 | E4 E4 E4 C4 C4 C4 | G4:2 F4:1 E4:2 D4:1 | C4:6',
    chords: 'I | I | I | I | I | I | V | I',
  },
  {
    id: 'yankee', title: 'Yankee Doodle', tonic: 'C4', mode: 'major', bpm: 112, beatsPerBar: 2,
    notes: 'C4:0.5 C4:0.5 D4:0.5 E4:0.5 | C4:0.5 E4:0.5 D4:0.5 G3:0.5 | C4:0.5 C4:0.5 D4:0.5 E4:0.5 | C4 B3 | C4:0.5 C4:0.5 D4:0.5 E4:0.5 | F4:0.5 E4:0.5 D4:0.5 C4:0.5 | B3:0.5 G3:0.5 A3:0.5 B3:0.5 | C4 C4',
    chords: 'I | V | I | V | I | IV | V | I',
  },
  {
    id: 'macdonald', title: 'Old MacDonald Had a Farm', tonic: 'C4', mode: 'major', bpm: 116, beatsPerBar: 4,
    notes: 'C4 C4 C4 G3 | A3 A3 G3:2 | E4 E4 D4 D4 | C4:4 | C4 C4 C4 G3 | A3 A3 G3:2 | E4 E4 D4 D4 | C4:4',
    chords: 'I | IV I | I V | I | I | IV I | I V | I',
  },
  {
    id: 'susanna', title: 'Oh! Susanna', tonic: 'C4', mode: 'major', bpm: 120, beatsPerBar: 4, pickup: 1,
    notes: 'C4:0.5 D4:0.5 | E4 G4 G4:1.5 A4:0.5 | G4 E4 C4:1.5 D4:0.5 | E4 E4 D4 C4 | D4:3 C4:0.5 D4:0.5 | E4 G4 G4:1.5 A4:0.5 | G4 E4 C4:1.5 D4:0.5 | E4 E4 D4 D4 | C4:4',
    chords: 'I | I | I | V | I | I | V | I',
  },
  {
    id: 'grace', title: 'Amazing Grace', tonic: 'C4', mode: 'major', bpm: 84, beatsPerBar: 3, pickup: 1,
    notes: 'G3 | C4:2 E4:0.5 C4:0.5 | E4:2 D4 | C4:2 A3 | G3:2 G3 | C4:2 E4:0.5 C4:0.5 | E4:2 D4 | G4:3 | G4:2 E4 | G4:1.5 E4:0.5 C4 | E4:2 D4 | C4:2 A3 | G3:2 G3 | C4:2 E4:0.5 C4:0.5 | E4:2 D4 | C4:3',
    chords: 'I | I | IV | I | I | I | V | I | I | I | IV | I | I | V | I',
  },
  {
    id: 'auld', title: 'Auld Lang Syne', tonic: 'C4', mode: 'major', bpm: 92, beatsPerBar: 4, pickup: 1,
    notes: 'G3 | C4:1.5 C4:0.5 C4 E4 | D4:1.5 C4:0.5 D4 E4:0.5 D4:0.5 | C4:1.5 C4:0.5 E4 G4 | A4:3 A4 | G4:1.5 E4:0.5 E4 C4 | D4:1.5 C4:0.5 D4 E4:0.5 D4:0.5 | C4:1.5 A3:0.5 A3 G3 | C4:4',
    chords: 'I | V | I | IV | I | V | IV V | I',
  },
  {
    id: 'greensleeves', title: 'Greensleeves', tonic: 'A3', mode: 'minor', bpm: 132, beatsPerBar: 3, pickup: 1,
    notes: 'A3 | C4:2 D4 | E4:1.5 F4:0.5 E4 | D4:2 B3 | G3:1.5 A3:0.5 B3 | C4:2 A3 | A3:1.5 G#3:0.5 A3 | B3:2 G#3 | E3:2 A3 | C4:2 D4 | E4:1.5 F4:0.5 E4 | D4:2 B3 | G3:1.5 A3:0.5 B3 | C4:1.5 B3:0.5 A3 | G#3:1.5 F#3:0.5 G#3 | A3:3',
    chords: 'i | bIII | bVII | v | i | V | V | V | i | bIII | bVII | v | i V | V | i',
  },
];

/** Training pool for Name That Key (distinct from the test songs). */
export const TRAINING_SONGS = [
  {
    id: 'ode', title: 'Ode to Joy', tonic: 'C4', mode: 'major', bpm: 116, beatsPerBar: 4,
    notes: 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2 | D4 D4 E4 C4 | D4 E4:0.5 F4:0.5 E4 C4 | D4 E4:0.5 F4:0.5 E4 D4 | C4 D4 G3:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2',
    chords: 'I | V | I | V | I | V | I | V I | V I | V I | V I | I V | I | V | I | V I',
  },
  {
    id: 'jingle', title: 'Jingle Bells', tonic: 'C4', mode: 'major', bpm: 132, beatsPerBar: 4,
    notes: 'E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 | F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | E4 D4 D4 E4 | D4:2 G4:2 | E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 | F4 F4 F4 F4 | F4 E4 E4 E4:0.5 E4:0.5 | G4 G4 F4 D4 | C4:4',
    chords: 'I | I | I | I | IV | I | II | V | I | I | I | I | IV | I | V | I',
  },
  {
    id: 'saints', title: 'When the Saints Go Marching In', tonic: 'C4', mode: 'major', bpm: 132, beatsPerBar: 4,
    notes: 'r C4 E4 F4 | G4:4 | r C4 E4 F4 | G4:4 | r C4 E4 F4 | G4:2 E4:2 | C4:2 E4:2 | D4:4 | r E4 E4 D4 | C4:3 C4 | E4:2 G4:2 | G4 F4:3 | r E4 F4 G4 | E4:2 C4:2 | D4:4 | C4:4',
    chords: 'I | I | I | I | I | I | I | V | I | I | I | IV | I | I | V | I',
  },
  {
    id: 'camptown', title: 'Camptown Races', tonic: 'C4', mode: 'major', bpm: 108, beatsPerBar: 2,
    notes: 'G4:0.5 G4:0.5 E4:0.5 G4:0.5 | A4:0.5 G4:0.5 E4 | E4:0.5 D4:1.5 | E4:0.5 D4:1.5 | G4:0.5 G4:0.5 E4:0.5 G4:0.5 | A4:0.5 G4:0.5 E4 | D4:0.5 D4:0.5 E4:0.5 D4:0.5 | C4:2',
    chords: 'I | I | V | V | I | I | V | I',
  },
  {
    id: 'lullaby', title: 'Brahms’ Lullaby', tonic: 'C4', mode: 'major', bpm: 96, beatsPerBar: 3, pickup: 1,
    notes: 'E4:0.5 E4:0.5 | G4:2 E4:0.5 E4:0.5 | G4:2 E4:0.5 G4:0.5 | C5 B4:1.5 A4:0.5 | A4 G4 D4:0.5 E4:0.5 | F4 D4 D4:0.5 E4:0.5 | F4:2 D4:0.5 F4:0.5 | B4:0.5 A4:0.5 G4 B4 | C5:3',
    chords: 'I | I | IV | I | V | V | V | I',
  },
  {
    id: 'sailor', title: 'Drunken Sailor', tonic: 'D4', mode: 'dorian', bpm: 120, beatsPerBar: 4,
    notes: 'A4 A4:0.5 A4:0.5 A4 A4:0.5 A4:0.5 | A4 D4 F4 A4 | G4 G4:0.5 G4:0.5 G4 G4:0.5 G4:0.5 | G4 C4 E4 G4 | A4 A4:0.5 A4:0.5 A4 A4:0.5 A4:0.5 | A4 B4 C5 D5 | C5 A4 G4 E4 | D4:2 D4:2',
    chords: 'i | i | bVII | bVII | i | i | bVII | i',
  },
  {
    id: 'minuet', title: 'Minuet in G', tonic: 'G4', mode: 'major', bpm: 116, beatsPerBar: 3,
    notes: 'D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4 | C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | F#4 G4:0.5 A4:0.5 B4:0.5 G4:0.5 | A4:3 | D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4 | C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | A4 B4:0.5 A4:0.5 G4:0.5 F#4:0.5 | G4:3',
    chords: 'I | I | IV | I | IV | I | V | V | I | I | IV | I | IV | I | V | I',
  },
  {
    id: 'oldman', title: 'This Old Man', tonic: 'C4', mode: 'major', bpm: 112, beatsPerBar: 4,
    notes: 'G4 E4 G4:2 | G4 E4 G4:2 | A4 G4 F4 E4 | D4 E4 F4:2 | E4 F4 G4 C4:0.5 C4:0.5 | C4:0.5 C4:0.5 C4 D4:0.5 E4:0.5 F4:0.5 G4:0.5 | G4 D4 F4 E4:0.5 D4:0.5 | C4:4',
    chords: 'I | I | IV | V | I | I | V | I',
  },
  {
    id: 'michael', title: 'Michael, Row the Boat Ashore', tonic: 'C4', mode: 'major', bpm: 100, beatsPerBar: 4,
    notes: 'C4 E4 G4:1.5 E4:0.5 | G4 A4 G4:2 | E4 G4 A4:2 | G4:4 | E4 G4 G4:1.5 E4:0.5 | F4 E4 D4:2 | C4 D4 E4:1.5 D4:0.5 | C4:4',
    chords: 'I | I | IV | I | I | IV V | I V | I',
  },
  {
    id: 'clementine', title: 'Oh My Darling, Clementine', tonic: 'C4', mode: 'major', bpm: 108, beatsPerBar: 3, pickup: 1,
    notes: 'C4:0.5 C4:0.5 | C4 G3 E4:0.5 E4:0.5 | E4 C4 C4:0.5 E4:0.5 | G4:1.5 G4:0.5 F4:0.5 E4:0.5 | D4:2 D4:0.5 E4:0.5 | F4 F4 E4:0.5 D4:0.5 | E4 C4 C4:0.5 E4:0.5 | D4:1.5 G3:0.5 B3:0.5 D4:0.5 | C4:2 r',
    chords: 'I | I | I | V | V | I | V | I',
  },
  {
    id: 'scarborough', title: 'Scarborough Fair', tonic: 'D4', mode: 'dorian', bpm: 120, beatsPerBar: 3,
    notes: 'D4:2 D4 | A4:2 A4 | E4:1.5 F4:0.5 E4 | D4:3 | r A4 C5 | D5:2 C5 | A4 B4 G4 | A4:3 | D5:2 D5 | D5:2 C5 | A4:2 A4 | G4 F4 E4 | D4 C4:2 | D4:3',
    chords: 'i | i | bVII | i | i | bVII | IV | i | i | bVII | i | bVII | bVII | i',
  },
  {
    id: 'godrest', title: 'God Rest Ye Merry, Gentlemen', tonic: 'E4', mode: 'minor', bpm: 120, beatsPerBar: 4,
    notes: 'E4 E4 B4 B4 | A4 G4 F#4 E4 | D4 E4 F#4 G4 | A4 B4:3 | E4 E4 B4 B4 | A4 G4 F#4 E4 | D4 E4 F#4 G4 | A4 B4:3 | B4 C5 A4 B4 | C5 D5 E5 B4 | A4 G4 E4 F#4 | G4 A4 B4:2 | A4 G4 F#4:2 | E4:4',
    chords: 'i | i | bVII | V | i | i | bVII | V | V | bVI | iv | bIII | V | i',
  },
  {
    id: 'hotcross', title: 'Hot Cross Buns', tonic: 'C4', mode: 'major', bpm: 100, beatsPerBar: 4,
    notes: 'E4 D4 C4:2 | E4 D4 C4:2 | C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 | E4 D4 C4:2',
    chords: 'I | I | I V | I',
  },
];

// ------------------------------------------------------------------ parsing

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parseNoteName(s) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  return 12 * (Number(m[3]) + 1) + LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** @returns {{events: Array<{midi:number|null, beat:number, beats:number}>, totalBeats:number}} */
export function parseMelody(song) {
  const events = [];
  let beat = 0;
  for (const tok of song.notes.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [name, dur] = tok.split(':');
    const beats = dur ? Number(dur) : 1;
    events.push({ midi: name === 'r' ? null : parseNoteName(name), beat, beats });
    beat += beats;
  }
  return { events, totalBeats: beat };
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

/** Parse a roman numeral to { root (semitones above tonic), intervals[] }. */
export function parseRoman(rn) {
  const m = /^(b|#)?([ivIV]+)(°|o)?(7)?$/.exec(rn);
  if (!m) throw new Error('bad roman ' + rn);
  const deg = ROMAN.indexOf(m[2].toLowerCase());
  if (deg < 0) throw new Error('bad roman ' + rn);
  const root = (MAJOR_STEPS[deg] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0) + 12) % 12;
  const upper = m[2] === m[2].toUpperCase();
  let intervals = m[3] ? [0, 3, 6] : upper ? [0, 4, 7] : [0, 3, 7];
  if (m[4]) intervals = [...intervals, upper ? 10 : 10];
  return { root, intervals };
}

/** Chord events: [{ beat, beats, root, intervals }] aligned to bars (accounts for pickup). */
export function parseChords(song, totalBeats) {
  const bars = song.chords.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));
  const out = [];
  const pickup = song.pickup || 0;
  bars.forEach((chs, i) => {
    const barStart = pickup + i * song.beatsPerBar;
    const each = song.beatsPerBar / chs.length;
    chs.forEach((rn, j) => {
      const beat = barStart + j * each;
      if (beat < totalBeats) out.push({ beat, beats: Math.min(each, totalBeats - beat), ...parseRoman(rn) });
    });
  });
  return out;
}
