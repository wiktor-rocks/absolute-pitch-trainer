// Decode any audio file to float32 channels via ffmpeg, and write 16-bit PCM WAV.
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

export const SR = 44100;

/** Decode to { sr, channels: Float32Array[] } at 44.1 kHz. */
export function decode(path, { channels = 1 } = {}) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-v', 'error', '-i', path,
      '-f', 'f32le', '-acodec', 'pcm_f32le',
      '-ac', String(channels), '-ar', String(SR), '-',
    ]);
    const chunks = [];
    let err = '';
    ff.stdout.on('data', (c) => chunks.push(c));
    ff.stderr.on('data', (c) => (err += c));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg failed on ${path}: ${err}`));
      const buf = Buffer.concat(chunks);
      const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      const n = all.length / channels;
      const out = [];
      for (let c = 0; c < channels; c++) {
        const ch = new Float32Array(n);
        for (let i = 0; i < n; i++) ch[i] = all[i * channels + c];
        out.push(ch);
      }
      resolve({ sr: SR, channels: out });
    });
  });
}

/** Write 16-bit PCM WAV with TPDF dither. */
export async function writeWav(path, channels, sr = SR) {
  const nch = channels.length;
  const n = channels[0].length;
  const dataBytes = n * nch * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataBytes, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(nch, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * nch * 2, 28); b.writeUInt16LE(nch * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const dither = (Math.random() - Math.random()) / 32768;
      let v = Math.round((channels[c][i] + dither) * 32767);
      if (v > 32767) v = 32767; else if (v < -32768) v = -32768;
      b.writeInt16LE(v, o); o += 2;
    }
  }
  await writeFile(path, b);
}
