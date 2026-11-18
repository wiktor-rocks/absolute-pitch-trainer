#!/usr/bin/env node
// Download, slice, pitch-verify, tune, trim and loudness-normalize all note samples.
//
//   node tools/build-samples.mjs [--only piano,flute] [--rms -20] [--force]
//
// Output: samples/<timbre>/<midi>.wav       (1000 ms, as in the study)
//         samples/<timbre>/long/<midi>.wav  (2500 ms, for melody playback)
//         samples/sung/<midi>.wav           (1500 ms sung letter-name cues)
//         samples/manifest.json, samples/build-report.txt

import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decode, writeWav, SR } from './lib/audio-io.mjs';
import {
  mixdown, rms, peak, findOnset, slice, fade, scale, resamplePitch, dbToGain, gainToDb,
} from './lib/dsp.mjs';
import { notePitch, midiToFreq } from './lib/yin.mjs';
import { maxMomentaryLoudness } from './lib/loudness.mjs';
import { segmentNotes, alignToRun } from './lib/segment.mjs';
import { singLetter } from './lib/formant.mjs';
import { squareNote } from './lib/square.mjs';
import { TIMBRES, BUILD_LO, BUILD_HI, midiToFlatName, nameToMidi } from './sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'downloads');
const OUT = path.join(ROOT, 'samples');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const ONLY = opt('only', null)?.split(',');
// Every sound is matched on perceived loudness (BS.1770 K-weighted max momentary loudness),
// not raw RMS: RMS over-boosts decaying sounds (piano, harpsichord) relative to sustained ones.
const TARGET_LUFS = Number(opt('lufs', '-24'));
const PEAK_CEIL_DB = -1;
const SHORT_MS = 1000;
const LONG_MS = 2500;
const TUNE_THRESHOLD_CENTS = 3; // retune anything further than this from 12-TET A440
const MAX_TUNE_CENTS = 60;
const TASK_LO = nameToMidi('C3');
const TASK_HI = nameToMidi('B5');

const report = [];
const log = (...a) => { const s = a.join(' '); console.log(s); report.push(s); };

// ---------------------------------------------------------------- downloads
async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function download(url, dest) {
  if (await exists(dest)) return dest;
  await mkdir(path.dirname(dest), { recursive: true });
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ap-trainer-sample-builder' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tmp = dest + '.part';
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
      const { rename } = await import('node:fs/promises');
      await rename(tmp, dest);
      return dest;
    } catch (e) {
      if (attempt === 4) throw new Error(`download failed ${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// ---------------------------------------------------------------- note processing
/**
 * Given source audio (channels) where a note starts near `onset`,
 * measure pitch, retune, cut short/long versions.
 * Returns { midi, cents, origCents, short, long } or null.
 */
function prepareNote(channels, onsetHint, expectedMidi, srcLabel) {
  const mix = mixdown(channels);
  const region = mix.subarray(onsetHint);
  const onset = onsetHint + findOnset(region, SR);
  const avail = mix.length - onset;
  const body = slice(channels, onset, Math.min(avail, Math.round(((LONG_MS + 300) / 1000) * SR)));
  const bodyMix = mixdown(body);
  const p = notePitch(bodyMix, SR, { startSec: 0.12, endSec: 0.9, hint: expectedMidi });
  if (!p) { log(`  ! ${srcLabel}: no pitch detected (expected ${midiToFlatName(expectedMidi)})`); return null; }
  // Deviation from the expected note (players can be up to ~50c off; labels come from context).
  const midi = expectedMidi;
  const dev = (p.midi + p.cents / 100 - expectedMidi) * 100;
  if (Math.abs(dev) > MAX_TUNE_CENTS) {
    log(`  ! ${srcLabel}: detected ${midiToFlatName(p.midi)} ${p.cents.toFixed(1)}c, expected ${midiToFlatName(expectedMidi)} — skipped`);
    return null;
  }
  p.cents = dev;
  if (Math.abs(dev) > 30) log(`  ~ ${srcLabel}: ${midiToFlatName(midi)} was ${dev.toFixed(1)}c off, retuned`);
  let tuned = body;
  if (Math.abs(p.cents) > TUNE_THRESHOLD_CENTS) {
    tuned = resamplePitch(body, Math.pow(2, -p.cents / 1200));
  }
  const post = notePitch(mixdown(tuned), SR, { startSec: 0.12, endSec: 0.9, hint: midi });
  return { midi, origCents: p.cents, cents: post ? post.cents : p.cents, tuned };
}

/** Loudness as heard: mono files play on both speakers, so count them twice. */
export const loudnessOf = (chs) => maxMomentaryLoudness(chs.length === 1 ? [chs[0], chs[0]] : chs, SR);

/** 4th-order Butterworth high-pass (two cascaded biquads) to remove rumble below the note. */
function highPass(channels, fc) {
  const w = Math.tan((Math.PI * fc) / SR);
  const q = Math.SQRT1_2;
  const a0 = 1 + w / q + w * w;
  const b = [1 / a0, -2 / a0, 1 / a0];
  const a1 = (2 * (w * w - 1)) / a0, a2 = (1 - w / q + w * w) / a0;
  return channels.map((x) => {
    let y = x;
    for (let pass = 0; pass < 2; pass++) {
      const out = new Float32Array(y.length);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < y.length; i++) {
        const v = b[0] * y[i] + b[1] * x1 + b[2] * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = y[i]; y2 = y1; y1 = v; out[i] = v;
      }
      y = out;
    }
    return y;
  });
}

function cutAndNormalize(tuned, midi) {
  const nShort = Math.round((SHORT_MS / 1000) * SR);
  const nLong = Math.round((LONG_MS / 1000) * SR);
  const clean = midi != null ? highPass(tuned, Math.max(20, midiToFreq(midi) * 0.5)) : tuned;
  const short = fade(slice(clean, 0, nShort), SR, 2, 30);
  const long = fade(slice(clean, 0, nLong), SR, 2, 300);
  const loud = loudnessOf(short);
  let g = dbToGain(TARGET_LUFS - loud);
  const pk = peak(short) * g;
  let limited = false;
  const ceil = dbToGain(PEAK_CEIL_DB);
  if (pk > ceil) { g *= ceil / pk; limited = true; }
  scale(short, g);
  // long version shares the gain, then is peak-protected separately
  scale(long, g);
  const lp = peak(long);
  if (lp > ceil) scale(long, ceil / lp);
  return { short, long, gainDb: gainToDb(g), limited, peakDb: gainToDb(peak(short)), lufs: loudnessOf(short) };
}

async function emit(manifest, timbre, midi, prepared, extra = {}) {
  const { short, long, gainDb, limited, peakDb, lufs } = cutAndNormalize(prepared.tuned, midi);
  const dir = path.join(OUT, timbre);
  await mkdir(path.join(dir, 'long'), { recursive: true });
  await writeWav(path.join(dir, `${midi}.wav`), short);
  await writeWav(path.join(dir, 'long', `${midi}.wav`), long);
  manifest.timbres[timbre].notes[midi] = {
    name: midiToFlatName(midi),
    short: `${timbre}/${midi}.wav`,
    long: `${timbre}/long/${midi}.wav`,
    cents: round1(prepared.cents),
    origCents: round1(prepared.origCents),
    gainDb: round1(gainDb),
    peakDb: round1(peakDb),
    lufs: round1(lufs),
    limited,
    ...extra,
  };
}
const round1 = (x) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- per-source builders
async function buildPerNote(name, t, manifest) {
  await pool(t.notes, 6, async (n) => {
    let file;
    try { file = await download(n.url, path.join(CACHE, name, n.file)); }
    catch (e) { log(`  ! ${e.message}`); return; }
    const { channels } = await decode(file, { channels: t.channels });
    const prep = prepareNote(channels, 0, n.midi, n.file);
    if (prep) await emit(manifest, name, prep.midi, prep);
  });
}

async function buildRuns(name, t, manifest) {
  const files = await pool(t.runs, 4, async (r) => {
    try { return await download(r.url, path.join(CACHE, name, r.file)); }
    catch (e) { log(`  ! ${e.message}`); return null; }
  });
  for (let k = 0; k < t.runs.length; k++) {
    const r = t.runs[k];
    if (!files[k]) continue;
    const { channels } = await decode(files[k], { channels: t.channels });
    const mix = mixdown(channels);
    const regions = segmentNotes(mix, SR);
    const pitches = regions.map((reg) => {
      const seg = mix.subarray(reg.start, reg.end);
      const on = findOnset(seg, SR);
      const p = notePitch(seg.subarray(on), SR, { startSec: 0.1, endSec: 0.8 });
      return p ? p.midi + p.cents / 100 : null;
    });
    const matches = alignToRun(pitches, r.lo, r.hi);
    log(`  ${r.file}: ${regions.length} regions, ${matches.length}/${r.hi - r.lo + 1} notes matched`);
    for (const { region: i, label } of matches) {
      if (label < BUILD_LO || label > BUILD_HI) continue;
      if (manifest.timbres[name].notes[label]) continue; // earlier file wins
      const reg = regions[i];
      const end = i + 1 < regions.length ? regions[i + 1].start : mix.length;
      const iso = channels.map((ch) => ch.slice(reg.start, end));
      const padded = iso.map((ch) => { const o = new Float32Array(Math.max(ch.length, SR * 3)); o.set(ch); return o; });
      const prep = prepareNote(padded, 0, label, `${r.file}#${i}`);
      if (prep) await emit(manifest, name, prep.midi, prep);
    }
  }
}

async function buildVcsl(name, t, manifest) {
  const api = `https://api.github.com/repos/${t.repo}/git/trees/${t.branch}?recursive=1`;
  const treeFile = path.join(CACHE, name, 'tree.json');
  await download(api, treeFile);
  const tree = JSON.parse(await readFile(treeFile, 'utf8'));
  const entries = tree.tree.filter((e) => e.path.startsWith(t.dir) && t.match.test(e.path));
  log(`  ${entries.length} files in ${t.dir}`);
  await pool(entries, 6, async (e) => {
    const fname = e.path.split('/').pop();
    const url = `https://raw.githubusercontent.com/${t.repo}/${t.branch}/` +
      e.path.split('/').map(encodeURIComponent).join('/');
    let file;
    try { file = await download(url, path.join(CACHE, name, fname)); }
    catch (err) { log(`  ! ${err.message}`); return; }
    const { channels } = await decode(file, { channels: t.channels });
    // Label octave numbering differs between libraries: trust detected pitch,
    // constrained to label pitch-class ± octave.
    const label = /_([A-G]#?)(\d)_/.exec(fname);
    const labelMidi = label ? nameToMidi(label[1] + label[2]) : null;
    const mix = mixdown(channels);
    const p = notePitch(mix.subarray(findOnset(mix, SR)), SR, { startSec: 0.08, endSec: 0.7 });
    if (!p) { log(`  ! ${fname}: no pitch`); return; }
    if (labelMidi != null && ((p.midi - labelMidi) % 12 + 12) % 12 !== 0) {
      log(`  ! ${fname}: detected ${midiToFlatName(p.midi)} ≠ label pitch class, skipped`);
      return;
    }
    if (p.midi < BUILD_LO || p.midi > BUILD_HI || manifest.timbres[name].notes[p.midi]) return;
    const prep = prepareNote(channels, 0, p.midi, fname);
    if (prep) await emit(manifest, name, prep.midi, prep, { octaveShiftFromLabel: (p.midi - labelMidi) / 12 });
  });
}

async function buildSquare(name, t, manifest) {
  for (let m = BUILD_LO; m <= BUILD_HI; m++) {
    const x = squareNote(m, { durSec: (LONG_MS + 100) / 1000, releaseMs: 1 });
    await emit(manifest, name, m, { tuned: [x], cents: 0, origCents: 0 });
  }
}

/** Fill task-range gaps from a neighbour ±1 semitone (resampled). */
async function fillGaps(name, manifest) {
  const notes = manifest.timbres[name].notes;
  const present = Object.keys(notes).map(Number);
  if (!present.length) return;
  const lo = Math.min(...present), hi = Math.max(...present);
  for (let m = Math.max(TASK_LO, lo - 1); m <= Math.min(TASK_HI, hi + 1); m++) {
    if (notes[m]) continue;
    const src = notes[m - 1] && !notes[m - 1].derived ? m - 1 : notes[m + 1] && !notes[m + 1].derived ? m + 1 : null;
    if (src == null) continue;
    const { channels } = await decode(path.join(OUT, notes[src].long), { channels: name === 'piano' || name === 'harpsichord' ? 2 : 1 });
    // undo normalization doesn't matter: emit renormalizes
    const shifted = resamplePitch(channels, Math.pow(2, (m - src) / 12));
    await emit(manifest, name, m, { tuned: shifted, cents: 0, origCents: 0 }, { derived: true, derivedFrom: src });
    log(`  + ${midiToFlatName(m)} derived from ${midiToFlatName(src)}`);
  }
}

// ---------------------------------------------------------------- sung cues
const SUNG_DIR = path.join(ROOT, 'assets', 'sung');

/**
 * Sung target cues. Uses the recordings in assets/sung/ (C4.wav … B4.wav, each note sung
 * with its letter name) when present; otherwise falls back to the formant-synthesis voice.
 */
async function buildSung(manifest) {
  await mkdir(path.join(OUT, 'sung'), { recursive: true });
  manifest.sung = {};
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

  if (await exists(path.join(SUNG_DIR, 'C4.wav'))) {
    for (const L of letters) {
      const file = path.join(SUNG_DIR, `${L}4.wav`);
      if (!(await exists(file))) { log(`  ! sung ${L}: assets/sung/${L}4.wav missing`); continue; }
      const { channels } = await decode(file, { channels: 1 });
      const x = channels[0];
      const on = findOnset(x, SR);
      const durSec = (x.length - on) / SR;
      const expected = nameToMidi(L + '4');
      const p = notePitch(x.subarray(on), SR, { startSec: 0.1, endSec: Math.max(0.2, durSec - 0.08), hint: expected });
      let midi = expected, cents = 0;
      let audio = [x.slice(on)];
      if (p) {
        midi = p.midi;
        cents = (p.midi + p.cents / 100 - midi) * 100;
        if (Math.abs(cents) > TUNE_THRESHOLD_CENTS) audio = resamplePitch(audio, Math.pow(2, -cents / 1200));
        if (midi !== expected) log(`  ! sung ${L}: detected ${midiToFlatName(midi)}, expected ${midiToFlatName(expected)}`);
      }
      const clean = highPass(audio, midiToFreq(midi) * 0.5);
      fade(clean, SR, 2, 25);
      scale(clean, dbToGain(TARGET_LUFS - loudnessOf(clean)));
      const pk = peak(clean);
      if (pk > dbToGain(PEAK_CEIL_DB)) scale(clean, dbToGain(PEAK_CEIL_DB) / pk);
      await writeWav(path.join(OUT, 'sung', `${midi}.wav`), clean);
      manifest.sung[midi] = { letter: L, file: `sung/${midi}.wav`, origCents: round1(cents), source: `assets/sung/${L}4.wav`, durMs: Math.round((clean[0].length / SR) * 1000) };
      log(`  sung ${L}4: was ${cents.toFixed(1)}c${Math.abs(cents) > TUNE_THRESHOLD_CENTS ? " (retuned)" : ""}, ${(clean[0].length / SR).toFixed(2)} s`);
    }
    log(`sung cues: ${Object.keys(manifest.sung).length} (recorded, from assets/sung/)`);
    return;
  }

  for (let oct = 3; oct <= 5; oct++) {
    for (const L of letters) {
      const midi = nameToMidi(L + oct);
      const x = singLetter(L, midi, { durSec: 1.5 });
      const g = dbToGain(TARGET_LUFS - loudnessOf([x]));
      const ch = scale([x], g);
      const pk = peak(ch);
      if (pk > dbToGain(PEAK_CEIL_DB)) scale(ch, dbToGain(PEAK_CEIL_DB) / pk);
      fade(ch, SR, 0, 20);
      const p = notePitch(x, SR, { startSec: 0.5, endSec: 1.2, hint: midi });
      await writeWav(path.join(OUT, 'sung', `${midi}.wav`), ch);
      manifest.sung[midi] = { letter: L, file: `sung/${midi}.wav`, cents: p ? round1(p.cents) : null, source: 'formant synthesis' };
    }
  }
  log(`sung cues: ${Object.keys(manifest.sung).length} (formant synthesis — add assets/sung/C4.wav … B4.wav for recorded cues)`);
}

// ---------------------------------------------------------------- main
async function main() {
  await mkdir(OUT, { recursive: true });
  const manifestPath = path.join(OUT, 'manifest.json');
  let manifest = { version: 1, sampleRate: SR, lufs: TARGET_LUFS, shortMs: SHORT_MS, longMs: LONG_MS, timbres: {} };
  if (ONLY && await exists(manifestPath)) manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.built = new Date().toISOString();
  manifest.lufs = TARGET_LUFS;
  delete manifest.rmsDb;
  // RMS (dBFS) at which uniform white noise matches the target loudness (used by the app's noise mask)
  {
    const n = new Float32Array(SR);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    manifest.noiseRmsDb = round1(gainToDb(rms(n)) + TARGET_LUFS - loudnessOf([n]));
  }

  for (const [name, t] of Object.entries(TIMBRES)) {
    if (ONLY && !ONLY.includes(name)) continue;
    log(`== ${name}`);
    manifest.timbres[name] = { label: t.label, credit: t.credit, notes: {} };
    if (t.kind === 'perNote') await buildPerNote(name, t, manifest);
    else if (t.kind === 'runs') await buildRuns(name, t, manifest);
    else if (t.kind === 'vcsl') await buildVcsl(name, t, manifest);
    else if (t.kind === 'synth') await buildSquare(name, t, manifest);
    if (t.kind !== 'synth') await fillGaps(name, manifest);

    const notes = manifest.timbres[name].notes;
    const ms = Object.keys(notes).map(Number).sort((a, b) => a - b);
    const inTask = ms.filter((m) => m >= TASK_LO && m <= TASK_HI);
    const missing = [];
    for (let m = TASK_LO; m <= TASK_HI; m++) if (!notes[m]) missing.push(midiToFlatName(m));
    const worst = Math.max(0, ...ms.map((m) => Math.abs(notes[m].cents)));
    log(`  ${ms.length} notes (${midiToFlatName(ms[0])}–${midiToFlatName(ms[ms.length - 1])}), ` +
      `${inTask.length}/36 in C3–B5, worst residual ${worst.toFixed(1)}c` +
      (missing.length ? `, missing: ${missing.join(' ')}` : ''));
    const lim = ms.filter((m) => notes[m].limited).map(midiToFlatName);
    if (lim.length) log(`  peak-limited (quieter than target): ${lim.join(' ')}`);
  }
  if (!ONLY || ONLY.includes('sung')) await buildSung(manifest);

  // sort note keys
  for (const t of Object.values(manifest.timbres)) {
    t.notes = Object.fromEntries(Object.entries(t.notes).sort((a, b) => a[0] - b[0]));
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 1));
  await writeFile(path.join(OUT, 'build-report.txt'), report.join('\n') + '\n');
  console.log(`\nWrote ${manifestPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
