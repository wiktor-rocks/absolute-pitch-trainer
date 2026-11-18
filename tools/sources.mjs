// Sample sources. All are free to use:
//  - University of Iowa Electronic Music Studios, Musical Instrument Samples (MIS):
//    "freely available ... used without restriction" — https://theremin.music.uiowa.edu/MIS.html
//  - Versilian Community Sample Library (VCSL), CC0 — https://github.com/sgossner/VCSL

const IOWA = 'https://theremin.music.uiowa.edu/sound%20files/MIS/';
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const nameToMidi = (name) => {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note name ' + name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const acc = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0;
  return 12 * (Number(m[3]) + 1) + base + acc;
};
export const midiToFlatName = (m) => FLAT_NAMES[m % 12] + (Math.floor(m / 12) - 1);

/** Parse "D3B3" / "C7" range tokens from Iowa run filenames. */
function runRange(token) {
  const m = /^([A-G]b?\d)([A-G]b?\d)?$/.exec(token);
  const lo = nameToMidi(m[1]);
  const hi = m[2] ? nameToMidi(m[2]) : lo;
  return [lo, hi];
}

function iowaRuns(dir, files) {
  return files.map((f) => {
    const token = f.replace(/\.(stereo|mono)\.aif+$|\.aif+$/, '').split('.').pop();
    const [lo, hi] = runRange(token);
    return { url: IOWA + dir + '/' + encodeURIComponent(f), file: f, lo, hi };
  });
}

/** Build range (inclusive). Tasks use C3–B5; the rest is for melodies/bass. */
export const BUILD_LO = nameToMidi('C2');
export const BUILD_HI = nameToMidi('C7');

export const TIMBRES = {
  piano: {
    label: 'Piano',
    credit: 'University of Iowa MIS — Steinway B, mf',
    kind: 'perNote',
    channels: 2,
    notes: (() => {
      const out = [];
      for (let m = BUILD_LO; m <= BUILD_HI; m++) {
        const f = `Piano.mf.${midiToFlatName(m)}.aiff`;
        out.push({ url: IOWA + 'Piano_Other/piano/' + encodeURIComponent(f), file: f, midi: m });
      }
      return out;
    })(),
  },
  flute: {
    label: 'Flute',
    credit: 'University of Iowa MIS — flute, non-vibrato, mf',
    kind: 'runs',
    channels: 1,
    runs: iowaRuns('Woodwinds/flute', [
      'Flute.nonvib.mf.B3B4.aiff', 'Flute.nonvib.mf.C5B5.aiff', 'Flute.nonvib.mf.C6B6.aiff',
    ]),
  },
  clarinet: {
    label: 'Clarinet',
    credit: 'University of Iowa MIS — B♭ clarinet, mf',
    kind: 'runs',
    channels: 1,
    runs: iowaRuns('Woodwinds/Bbclarinet', [
      'BbClar.mf.D3B3.aiff', 'BbClar.mf.C4B4.aiff', 'BbClar.mf.C5B5.aiff', 'BbClar.mf.C6B6.aiff',
    ]),
  },
  cello: {
    label: 'Cello',
    credit: 'University of Iowa MIS — cello arco, mf',
    kind: 'runs',
    channels: 1,
    runs: iowaRuns('Strings/cello', [
      'Cello.arco.mf.sulC.C2Ab2.aiff', 'Cello.arco.mf.sulC.A2Gb3.aiff', 'Cello.arco.mf.sulD.D3B3.aiff',
      'Cello.arco.mf.sulA.C4C5.aiff', 'Cello.arco.mf.sulA.C5Ab5.aiff',
      // fallbacks for notes the primary runs miss (other strings, then ff dynamic)
      'Cello.arco.mf.sulG.B2A3.aiff', 'Cello.arco.mf.sulD.C4Bb4.aiff', 'Cello.arco.mf.sulD.B4Eb5.aiff',
      'Cello.arco.mf.sulG.E4G4.aiff', 'Cello.arco.ff.sulA.C5Bb5.aiff', 'Cello.arco.ff.sulD.B4D5.aiff',
    ]),
  },
  guitar: {
    label: 'Guitar',
    credit: 'University of Iowa MIS — classical guitar, mf',
    kind: 'runs',
    channels: 1,
    runs: iowaRuns('Piano_Other/guitar', [
      'Guitar.mf.sulE.E2B2.mono.aif', 'Guitar.mf.sulA.C3B3.mono.aif', 'Guitar.mf.sulG.C4B4.mono.aif',
      'Guitar.mf.sul_E.C5B5.mono.aif',
    ]),
  },
  harpsichord: {
    label: 'Harpsichord',
    credit: 'Versilian Community Sample Library (CC0) — harpsichord',
    kind: 'vcsl',
    channels: 2,
    repo: 'sgossner/VCSL',
    branch: 'master',
    dir: 'Chordophones/Zithers/Harpsichord, Unk/Sustains/',
    match: /_rr1\.wav$/,
  },
  square: {
    label: 'Square wave',
    credit: 'Synthesized (band-limited)',
    kind: 'synth',
    channels: 1,
  },
};
