// test/i18n.test.js
// Guard: script.js must not contain Japanese string literals. All user-facing
// Japanese comes from pts-messages.js now (HTML strings are addressed in a
// later batch per the task plan).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

// Match Hiragana (3040-309F), Katakana (30A0-30FF), CJK Unified (4E00-9FFF).
const JP = /[぀-ヿ一-鿿]/;

// Remove line comments and block comments, roughly. Not a full parser, but
// enough to catch stray literals outside of comments.
function stripComments(src){
  // Block comments
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Line comments (strip from // to end of line, but try not to touch URLs
  // like https://... — none of our files have that in literals today).
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
