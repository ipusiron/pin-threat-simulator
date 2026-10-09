// test/format.test.js
// Simple sanity checks on file formatting / size.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

function readLines(rel){
  return readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n').split('\n');
}

function maxLineLen(lines){
  let max = 0;
  for(const l of lines) if(l.length > max) max = l.length;
  return max;
}

test('JS/CSS/test files keep lines under 160 chars', () => {
  const files = ['script.js', 'pin-engine.js', 'pts-messages.js', 'style.css',
                 'test/engine.test.js', 'test/html.test.js',
                 'test/contrast.test.js', 'test/format.test.js',
                 'test/i18n.test.js'];
  for(const f of files){
    const lines = readLines(f);
    const m = maxLineLen(lines);
    assert.ok(m <= 160, `${f}: longest line is ${m} chars`);
  }
});

test('index.html keeps lines under 250 chars', () => {
  const lines = readLines('index.html');
  const m = maxLineLen(lines);
  assert.ok(m <= 250, `index.html longest line is ${m}`);
});

test('major files meet minimum size expectations', () => {
  const minima = {
    'script.js': 800,
    'pin-engine.js': 100,
    'style.css': 300,
  };
  for(const [file, min] of Object.entries(minima)){
    const n = readLines(file).length;
    assert.ok(n >= min, `${file}: ${n} lines (expected ≥ ${min})`);
  }
});
