# Absolute Pitch Trainer

A vanilla-JS web app (no framework, no bundler, no runtime dependencies) that replicates the training and testing software from an 8-week adult absolute-pitch training study.

**Live:** https://wiktor-rocks.github.io/absolute-pitch-trainer/ (GitHub Pages, served from `main`; `samples/` is committed for this). On touch screens the speed tasks show a "Tap for target" pad in place of Space.

## Quick start

```sh
npm run build:samples   # one-off: downloads ~630 MB of source recordings, writes ~140 MB to samples/
npm start               # http://localhost:8080
npm test                # unit tests (generators, NTKT rotation, protocol)
```

Add `?quick` to the URL (`http://localhost:8080/?quick#/task/accuracy`) to run tiny versions of every task when you're developing.

## Tasks (parameters from the paper, `src/tasks/configs.js`)

| Task | Phase | What it does |
|---|---|---|
| Simple Speed | 1 | 14 trials (C–B ascending, twice). Each trial: 1500 ms cue (name + sung note), then 16 piano notes from the white keys C4–B4, 4 of them targets. Space within 1750 ms; 500 ms feedback; 1500 ms rest. |
| Complex Speed | 1 | As above, but the window is 1250 ms; piano/flute/guitar; C3–B5; random timbre and octave. |
| Hypercomplex Speed | 2 | 32 notes (4 targets), 1000 ms window, all 7 timbres, distractors from all 12 pitch classes, targets in random order. |
| Accuracy Training | 1 + 2 | Pitch wheel. Block 1: 24 piano notes C4–B5, each twice. Block 2: 48 of 96 (piano/cello/clarinet/harpsichord). Feedback and replay; 1 s noise between trials. |
| Weekly Test | test | As Accuracy Training with no feedback; block 2 pool adds square wave (120). |
| Name That Key | 2 | 15 excerpts (~15 s) from a fixed pool of 300 generated arrangements of public-domain tunes; answer is the tonic; feedback plays the tonic. |
| Name That Key Test | test | 12 folk songs on piano, each pitch class used once, no feedback. Song→key assignment rotates per administration, so a song never repeats a key in 12 administrations. The test songs are never used in training. |

**Protocol tab.** This is the guided study, and it moves forward with your progress rather than by the calendar:

1. Pre-test (Weekly Test + Name That Key Test).
2. Weeks 1–8. Each week is 4 sessions of each training task (phase 1: SS, CS, AT; phase 2: HS, NTK, AT). The week's test (WT; also NTKT in phase 2) can be taken at any time, though the study took it after the training. The week is complete, and the next one starts, once all 12 training sessions and the test are done.
3. Post-test.
4. Retention test, which unlocks 120 days after the post-test.

To choose which week you work on, tap any unfinished week in the Progress grid. That week stays the current one until it's complete or you pick "Follow progress instead", which goes back to the first unfinished week. The choice is saved in settings (`protocolWeek`).

The rules are in `src/protocol.js` and are unit tested.

**Practice tab.** Every task is available at any time. Practice sessions show up in Results (labelled "Practice") but never count toward the protocol.

**Customizing practice tasks.** A Practice task's start screen has a **Customize** panel. It's built from the schema in `src/tasks/customize.js`, and the app remembers your last settings for each task. Protocol runs never use it.

- **Speed tasks:**
  - target notes (any of the 12)
  - which other notes play: white keys, all 12, or only the selected notes
  - target order
  - instruments and octaves
  - response window, cue, feedback and rest durations
  - notes and targets per trial, and the number of passes
  - sung cue on/off (recordings exist only for the white keys)
  - feedback text on/off
- **Accuracy Training / Weekly Test:**
  - which notes are in play (the other wheel segments are disabled)
  - feedback and replay on/off
  - noise length
  - per block: on/off, instruments, octaves, and either every note twice or N random notes
- **Name That Key:** keys in play, melody instruments, arrangements, number and length of excerpts, feedback, noise.
- **Name That Key Test:** only feedback and noise, so its song→key rotation stays intact.

Customized sessions are stored with what was changed (`session.custom`). Results charts them separately, one chart per task under "Customized practice", so the study-setting charts stay comparable.


## Note names

Settings → Note names switches what's shown on screen (the Speed cue, the pitch wheel, feedback captions, the confusion matrix):

- **Letters** (default): C, C♯/D♭, D, …
- **Fixed-do solfège by sound**: one syllable per semitone, so enharmonics share a name: Do Di Re Ri Mi Fa Fi Sol Si La Li Ti (C♯ and D♭ are both Di).
- **Solfège + letter**: the syllable with its letter name smaller beneath it (Di over C♯/D♭), or "Di (C♯/D♭)" where there's one line.

Results are stored as pitch-class numbers, so switching never affects your data. The sung cues are whatever is recorded in `assets/sung/`, so re-record them with the syllables (and rebuild the samples) if you switch.

## Samples (`tools/build-samples.mjs`)

- **Sources:** University of Iowa MIS for piano, flute, B♭ clarinet, cello and guitar (free, unrestricted). Harpsichord is from the Versilian Community Sample Library (CC0). Square waves are band-limited synthesis. Sung cues are recordings in `assets/sung/` (C4–B4, each note sung with its letter name), retuned and loudness-matched. If they are missing, the build falls back to a formant-synthesised voice.
- **Pitch correction:**
  - Every note is pitch-measured (YIN) and retuned to A440 equal temperament. Residual error is ≤ 3 cents; the Iowa recordings were off by 5–60 cents.
  - Multi-note recordings are split on silence. Notes are labelled by monotone alignment against the expected chromatic run.
- **Output format:** each note is cut to 1000 ms (as in the study) plus a 2500 ms version for melodies. Rumble below each note is removed with a pitch-relative high-pass filter. Every sound (notes, sung cues, masking noise) is matched on perceived loudness: BS.1770 K-weighted max momentary loudness, −24 LUFS. The paper says "RMS normalized to −5 dB FS", but plain RMS makes decaying instruments (piano, harpsichord) sound about 9 dB louder than sustained ones.
- **Gaps:**
  - Flute has nothing below B♭3 (instrument range).
  - Clarinet has no C3.
  - Cello has no B5.
  - A few notes (cello G3/E5/B♭5, clarinet D♭3, flute B♭3) are resampled from a neighbour one semitone away.
  - Tasks only use notes listed in `samples/manifest.json`. See `samples/build-report.txt`.

## Desktop app (Electron)

```sh
npm install
npm run electron     # run from source
npm run dist         # → dist/AP-Trainer-<version>.AppImage (bundles samples/, ~230 MB)
```

Build the samples first (`npm run build:samples`). `electron/main.cjs` serves the app from a private `app://trainer/` scheme, so `fetch` and ES modules work, and results persist in `~/.config/absolute-pitch-trainer/`.

To move results from the browser version, use Settings → Export in the browser, then Settings → Import in the desktop app.

Note: VS Code terminals set `ELECTRON_RUN_AS_NODE=1`. `npm run electron` clears it, but if you launch the AppImage from such a terminal, prefix the command with `env -u ELECTRON_RUN_AS_NODE`.

## Data

Results are stored in IndexedDB (`src/store/progress.js`). Settings has export/import to JSON. Storage sits behind that one module so an Electron build can swap in file storage.
