// test/audio.test.js
// Validates the checked-in sample WAV. Three invariants:
//   1. The file is <= 30KB
//   2. countPeaks(data, PEAK_DEFAULTS) returns exactly 4
//   3. The file is byte-identical to tools/gen-sample-wav.mjs output
// A tiny inline WAV parser extracts a Float32Array from the PCM 16-bit chunk;
// no third-party dependency.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {countPeaks, PEAK_DEFAULTS} from '../pin-engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const WAV_PATH = join(root, 'assets', 'samples', 'pin-taps-4.wav');
const GEN_PATH = join(root, 'tools', 'gen-sample-wav.mjs');

// Minimal WAV (PCM 16-bit mono/stereo) parser. Reads the "fmt " and "data"
// chunks from a RIFF/WAVE buffer and returns a Float32Array of channel 0,
// scaled to [-1, 1]. Not a general WAV parser — only what the sample needs.
function readPcm16(buf){
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF', 'not RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE', 'not WAVE');
  let i = 12;
  let fmt = null;
  let dataOffset = -1, dataLen = -1;
  while(i + 8 <= buf.length){
    const id = buf.toString('ascii', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const payload = i + 8;
    if(id === 'fmt '){
      fmt = {
        format: buf.readUInt16LE(payload),
        channels: buf.readUInt16LE(payload + 2),
        sampleRate: buf.readUInt32LE(payload + 4),
        bitsPerSample: buf.readUInt16LE(payload + 14),
      };
    } else if(id === 'data'){
      dataOffset = payload;
      dataLen = size;
      break;
    }
    i = payload + size + (size & 1); // chunks are word-aligned
  }
  assert.ok(fmt, 'fmt chunk not found');
  assert.equal(fmt.format, 1, 'not PCM');
  assert.equal(fmt.bitsPerSample, 16, 'not 16-bit');
  assert.ok(dataOffset >= 0, 'data chunk not found');
  const nSamples = Math.floor(dataLen / 2 / fmt.channels);
  const out = new Float32Array(nSamples);
  for(let s = 0; s < nSamples; s++){
    // Channel 0 only.
    const int16 = buf.readInt16LE(dataOffset + s * 2 * fmt.channels);
    out[s] = int16 / 32768;
  }
  return {samples: out, fmt};
}

test('sample WAV is <= 30KB', () => {
  const sz = statSync(WAV_PATH).size;
  assert.ok(sz <= 30 * 1024, `sample wav is ${sz} bytes (>30KB)`);
});

test('sample WAV decodes to 4 peaks via countPeaks(PEAK_DEFAULTS)', () => {
  const buf = readFileSync(WAV_PATH);
  const {samples, fmt} = readPcm16(buf);
  assert.equal(fmt.sampleRate, 8000);
  assert.equal(fmt.channels, 1);
  const peaks = countPeaks(samples, PEAK_DEFAULTS);
  assert.equal(peaks, 4, `expected 4 peaks, got ${peaks}`);
});

test('sample WAV is byte-identical to tools/gen-sample-wav.mjs output', () => {
  // Regenerate into a tmp path and compare the resulting bytes with the
  // tracked file. Using the generator's own exit path keeps the test honest
  // (no in-memory re-synthesis).
  const checkedIn = readFileSync(WAV_PATH);
  // Run the generator; it overwrites the tracked file. We stash a copy first.
  // The generator is deterministic, so after re-running the bytes must match.
  execFileSync(process.execPath, [GEN_PATH], {stdio: 'ignore'});
  const regenerated = readFileSync(WAV_PATH);
  assert.ok(checkedIn.equals(regenerated),
    `regenerated WAV differs from the tracked file (${checkedIn.length} vs ${regenerated.length} bytes)`);
});
