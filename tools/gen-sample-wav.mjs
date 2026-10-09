// tools/gen-sample-wav.mjs
// Deterministically generate assets/samples/pin-taps-4.wav.
//
// Usage: node tools/gen-sample-wav.mjs
//
// Output: PCM 16-bit mono, 8000 Hz, ~1.6 seconds. Four decaying tap bursts
// at 0.0 / 0.4 / 0.8 / 1.2 seconds. A deterministic (seeded) LCG supplies a
// low-amplitude noise floor (|v| ~ 0.02), well below the pin-engine fall
// threshold (0.1) so each burst registers as exactly one peak.
//
// Re-running the script produces byte-identical output; test/audio.test.js
// verifies this against the checked-in file.

import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SR = 8000;                     // sample rate (Hz)
const DURATION_S = 1.6;              // total length (s)
const TAP_TIMES = [0.0, 0.4, 0.8, 1.2]; // seconds
const BURST_MS = 60;                 // burst length (ms)
const BURST_AMP = 0.8;               // burst peak amplitude (0..1)
const NOISE_AMP = 0.02;              // noise peak amplitude (0..1)
const DECAY_PER_S = 50;              // exponential decay rate (1/s)

// Simple seeded LCG so the noise floor is deterministic.
function lcg(seed){
  let s = seed >>> 0;
  return () => {
    // Numerical Recipes constants
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000; // [0, 1)
  };
}

function buildSamples(){
  const n = Math.round(SR * DURATION_S);
  const burstLen = Math.round(SR * BURST_MS / 1000);
  const burstStarts = TAP_TIMES.map(t => Math.round(t * SR));
  const rand = lcg(0xC0FFEE);
  const out = new Int16Array(n);
  for(let i = 0; i < n; i++){
    // Deterministic noise floor, centered on 0, |v| <= NOISE_AMP.
    let v = (rand() - 0.5) * 2 * NOISE_AMP;
    // Add the tap burst if we are inside one. Taps are positive-only decays
    // so stride-sampled countPeaks sees |v| ~ 0.8*env on every sample.
    for(const start of burstStarts){
      if(i >= start && i < start + burstLen){
        const dt = (i - start) / SR;
        v += BURST_AMP * Math.exp(-DECAY_PER_S * dt);
        break;
      }
    }
    // Clamp to [-1, 1] then quantize to signed 16-bit.
    if(v > 1) v = 1; else if(v < -1) v = -1;
    out[i] = Math.round(v * 32767);
  }
  return out;
}

function writeWav(samples){
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  // RIFF header
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  // fmt chunk (PCM)
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);              // chunk size
  buf.writeUInt16LE(1, 20);               // audio format = PCM
  buf.writeUInt16LE(1, 22);               // channels
  buf.writeUInt32LE(SR, 24);              // sample rate
  buf.writeUInt32LE(SR * 2, 28);          // byte rate
  buf.writeUInt16LE(2, 32);               // block align
  buf.writeUInt16LE(16, 34);              // bits per sample
  // data chunk
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for(let i = 0; i < samples.length; i++){
    buf.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buf;
}

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'assets', 'samples', 'pin-taps-4.wav');
mkdirSync(dirname(outPath), {recursive: true});
const buf = writeWav(buildSamples());
writeFileSync(outPath, buf);
console.log(`wrote ${outPath} (${buf.length} bytes)`);
