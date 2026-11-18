// Pitch-class names and MIDI helpers.

export const PC_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const PC_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
/** Wheel labels: enharmonic pairs for black keys. */
export const PC_LABEL = PC_SHARP.map((s, i) => (s === PC_FLAT[i] ? s : `${s}/${PC_FLAT[i]}`));

// ---- display naming (Settings → Note names). Only affects what is shown;
// answers and stored results are always pitch-class numbers 0–11.
/** Fixed-do "by sound": one syllable per semitone, enharmonics share a name. */
export const SOLFEGE = ['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'];
export const NAMINGS = {
  letters: 'Letters (C, C♯/D♭, …)',
  solfege: 'Fixed-do solfège by sound (Do, Di, Re, …)',
  both: 'Solfège + letter (Do C, Di C♯/D♭, …)',
};
let naming = 'letters';
export function setNaming(n) { naming = n in NAMINGS ? n : 'letters'; }
export const getNaming = () => naming;
/**
 * Name of a pitch class split for layout: `main` is the primary label, `sub` the
 * secondary one shown smaller (letters in 'both' mode, otherwise null).
 */
export function pcParts(p) {
  const i = pc(p);
  if (naming === 'solfege') return { main: SOLFEGE[i], sub: null };
  if (naming === 'both') return { main: SOLFEGE[i], sub: PC_LABEL[i] };
  return { main: PC_SHARP[i], sub: null };
}
/** One-line display name, e.g. "C♯", "Di", or "Di (C♯/D♭)". */
export const pcName = (p) => { const { main, sub } = pcParts(p); return sub ? `${main} (${sub})` : main; };
/** Every name a pitch class goes by (black keys in letters: sharp and flat). */
export const pcNames = (p) => naming === 'letters' && isBlackPc(p) ? [PC_SHARP[pc(p)], PC_FLAT[pc(p)]] : [pcName(p)];
export const isBlackPc = (p) => PC_SHARP[pc(p)] !== PC_FLAT[pc(p)];

export const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
export const ALL_PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export const pc = (midi) => ((midi % 12) + 12) % 12;
export const octave = (midi) => Math.floor(midi / 12) - 1;
export const midiOf = (pitchClass, oct) => 12 * (oct + 1) + pitchClass;
export const midiName = (midi) => PC_SHARP[pc(midi)] + octave(midi);
export const isWhite = (midi) => WHITE_PCS.includes(pc(midi));

/** Inclusive MIDI range helper. */
export function range(lo, hi, filter = () => true) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (filter(m)) out.push(m);
  return out;
}

export const C3 = 48, B3 = 59, C4 = 60, B4 = 71, C5 = 72, B5 = 83;
