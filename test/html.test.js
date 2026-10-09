// test/html.test.js
// Static checks on index.html: CSP header, favicon, noscript, type=module,
// absence of X-Content-Type-Options meta, no inline on* handlers / style
// attributes, presence of the primary element ids, i18n coverage, and the
// absence of full-width Japanese punctuation (which belongs in the dict).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import DICT from '../pts-messages.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const html = readFileSync(join(root, 'index.html'), 'utf8');

test('CSP meta is present, no unsafe-inline, no frame-ancestors', () => {
  // The content attribute itself is quoted with double quotes but holds
  // single-quoted CSP keywords like 'self' — so we match on double-quote
  // delimiters specifically.
  const re = /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"/i;
  const m = html.match(re);
  assert.ok(m, 'CSP meta is missing');
  const policy = m[1];
  assert.ok(!/unsafe-inline/.test(policy), 'CSP must not include unsafe-inline');
  assert.ok(!/frame-ancestors/.test(policy),
    'frame-ancestors is ignored in <meta>; policy should not mention it');
  for(const token of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ]){
    assert.ok(policy.includes(token), `CSP missing directive: ${token}`);
  }
});

test('X-Content-Type-Options meta is NOT present (meta cannot set it)', () => {
  assert.ok(!/http-equiv=["']X-Content-Type-Options/i.test(html));
});

test('referrer meta is "no-referrer"', () => {
  assert.match(html, /<meta[^>]+name=["']referrer["'][^>]+content=["']no-referrer["']/i);
});

test('favicon link is present', () => {
  assert.match(html, /<link[^>]+rel=["']icon["'][^>]+href=/i);
});

test('noscript block is present', () => {
  assert.match(html, /<noscript[\s\S]*?<\/noscript>/i);
});

test('script tag uses type="module"', () => {
  assert.match(html, /<script[^>]+type=["']module["'][^>]+src=["']script\.js/i);
});

test('no inline on* handlers and no style attributes', () => {
  // Allow href/src/role/etc. Only inline event handlers are disallowed.
  const onHandlers = html.match(/\son[a-z]+\s*=/gi) || [];
  assert.deepEqual(onHandlers, [], 'inline on* handlers present: ' + onHandlers.join(','));
  const styleAttrs = html.match(/\sstyle\s*=\s*["']/gi) || [];
  assert.deepEqual(styleAttrs, [], 'inline style attributes present');
});

test('index.html has no full-width Japanese punctuation (belongs in dict)', () => {
  // Full-width parens, period, comma, bullet-dot, Japanese quotes.
  const banned = /[（）、。「」『』・]/;
  if(banned.test(html)){
    const lines = html.split(/\r?\n/);
    const hits = [];
    lines.forEach((line, i) => {
      if(banned.test(line)) hits.push(`line ${i + 1}: ${line.trim().slice(0, 100)}`);
    });
    assert.fail('full-width punctuation present in HTML:\n' + hits.slice(0, 10).join('\n'));
  }
});

test('every data-i18n key resolves in the ja dictionary', () => {
  const keys = [];
  // data-i18n="..."
  for(const m of html.matchAll(/\bdata-i18n=["']([^"']+)["']/g)){
    keys.push(m[1]);
  }
  // data-i18n-<attr>="..." but NOT data-i18n-attr (meta attribute list)
  for(const m of html.matchAll(/\bdata-i18n-([a-z-]+)=["']([^"']+)["']/g)){
    if(m[1] === 'attr') continue; // meta: list of attributes to translate
    keys.push(m[2]);
  }
  const unique = Array.from(new Set(keys));
  const missing = unique.filter(k => !DICT.ja.hasOwnProperty(k));
  assert.equal(missing.length, 0,
    `data-i18n keys with no dictionary entry: ${missing.join(', ')}`);
});

test('primary element ids are present', () => {
  const ids = [
    'tab-calc','digit-pick','pin-length','mode','allow-dup','wildcards',
    'calc-btn','result-count','result-length','show-steps','calculation-steps',
    'download-csv','candidates','tab-sim','finger-grid','finger-threshold',
    'analyze-finger','thermal-keypad','time-since','thermal-canvas',
    'analyze-thermal','audio-keypad','audio-file','analyze-audio',
    'video-keypad','video-angle','pixel-error','analyze-video','run-sim',
    'radar-chart','expert-hints','pin-ranking','push-to-calc','tab-sec',
    'random-keypad','shuffle-keypad','hand-cover-mode','theme-toggle',
    'download-json','lang-toggle','try-audio-sample','copy-share-link',
    'share-fallback',
  ];
  for(const id of ids){
    const re = new RegExp(`id=["']${id}["']`);
    assert.ok(re.test(html), `id="${id}" missing in index.html`);
  }
});
