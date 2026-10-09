// test/i18n.test.js
// Guards for the bilingual dictionary (ja / en) in pts-messages.js, plus
// the long-standing check that script.js carries no Japanese literals.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import DICT from '../pts-messages.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

// Hiragana (3040-309F), Katakana (30A0-30FF), CJK Unified (4E00-9FFF).
const JP = /[぀-ヿ一-鿿]/;

function stripComments(src){
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/(^|[^:])\/\/.*$/gm, '$1');
  return out;
}

test('script.js has zero Japanese string literals (comments excluded)', () => {
  const src = readFileSync(join(root, 'script.js'), 'utf8');
  const cleaned = stripComments(src);
  const hits = [];
  cleaned.split('\n').forEach((line, i) => {
    if(JP.test(line)) hits.push(`line ${i + 1}: ${line.trim()}`);
  });
  assert.equal(hits.length, 0, 'unexpected Japanese literals:\n' + hits.join('\n'));
});

test('dictionary has both ja and en, with identical key sets', () => {
  const jaKeys = Object.keys(DICT.ja).sort();
  const enKeys = Object.keys(DICT.en).sort();
  assert.ok(jaKeys.length > 0, 'ja dictionary is empty');
  const missingInEn = jaKeys.filter(k => !DICT.en.hasOwnProperty(k));
  const extraInEn = enKeys.filter(k => !DICT.ja.hasOwnProperty(k));
  assert.equal(missingInEn.length, 0,
    `keys missing from en: ${missingInEn.slice(0, 10).join(', ')}`);
  assert.equal(extraInEn.length, 0,
    `keys extra in en: ${extraInEn.slice(0, 10).join(', ')}`);
});

// Representative parameter bag used to evaluate each dict entry when it is
// a function. We pass broadly-shaped params so every formatter resolves.
const PARAMS = {
  set: [1,2,3], mode: 'allowed', allowDup: true, wilds: ['*','*','2','*'],
  token: '7', A: 3, f: 3, count: 27, n: 4, kprime: 2,
  digits: ['1','2'], threshold: 30, orderConfidence: 85, timeS: 10,
  pin: '1234', angle: 'top', pixelErr: 8, confidence: 88,
  taps: 4, peaks: 4, limitMB: 20,
  len: 3, total: 81, remaining: 2,
};

function evalEntry(entry){
  return typeof entry === 'function' ? entry(PARAMS) : String(entry);
}

test('en dictionary values contain zero Japanese characters', () => {
  const hits = [];
  for(const [key, entry] of Object.entries(DICT.en)){
    const val = evalEntry(entry);
    if(JP.test(val)) hits.push(`${key}: ${val.slice(0, 80)}`);
  }
  assert.equal(hits.length, 0, 'en entries contain Japanese:\n' + hits.join('\n'));
});

test('ja dictionary values are non-empty strings', () => {
  for(const [key, entry] of Object.entries(DICT.ja)){
    const val = evalEntry(entry);
    assert.ok(val && val.length > 0, `ja[${key}] is empty`);
  }
});
