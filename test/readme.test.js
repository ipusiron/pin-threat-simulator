// test/readme.test.js
// README validation: calculation examples, YAML metadata, image refs,
// directory structure consistency, forbidden-word check, and small
// synchronization checks against TECHNICAL.md / pin-engine.js.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {
  computeCandidates, PEAK_DEFAULTS,
  videoConfidence, radarScore,
} from '../pin-engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const readmeEn = readFileSync(join(root, 'README.en.md'), 'utf8');
const technical = readFileSync(join(root, 'TECHNICAL.md'), 'utf8');

function h2h3(markdown){
  // Return the ordered list of H2 and H3 headings.
  const out = [];
  let inCode = false;
  for(const raw of markdown.split(/\r?\n/)){
    if(/^```/.test(raw)){ inCode = !inCode; continue; }
    if(inCode) continue;
    const m = raw.match(/^(#{2,3})\s+(.+?)\s*$/);
    if(m) out.push({level: m[1].length, text: m[2]});
  }
  return out;
}

// --- 1. Compute the examples the README shows and compare to engine --------
test('README calc examples match the engine', () => {
  const cases = [
    {label:'81', in:{digits:[2,5,9], pinLen:4, mode:'allowed', allowDup:true, wilds:null},                                 expect:81},
    {label:'27', in:{digits:[2,5,9], pinLen:4, mode:'allowed', allowDup:true, wilds:['*','*','2','*']},                    expect:27},
    {label:'24 allowed+nodup', in:{digits:[1,2,3,4], pinLen:4, mode:'allowed', allowDup:false, wilds:null},                expect:24},
    {label:'36 must+dup', in:{digits:[1,2,3], pinLen:4, mode:'must', allowDup:true, wilds:null},                           expect:36},
    {label:'12 must+dup +*,*,2,*', in:{digits:[1,2,3], pinLen:4, mode:'must', allowDup:true, wilds:['*','*','2','*']},     expect:12},
    {label:'6 must+nodup n=3', in:{digits:[1,2,3], pinLen:3, mode:'must', allowDup:false, wilds:null},                     expect:6},
    {label:'10000 partial+dup', in:{digits:[], pinLen:4, mode:'partial', allowDup:true, wilds:null},                       expect:10000},
    {label:'1000 partial+dup +*,*,2,*', in:{digits:[], pinLen:4, mode:'partial', allowDup:true, wilds:['*','*','2','*']},  expect:1000},
  ];
  for(const c of cases){
    const r = computeCandidates(c.in);
    assert.equal(r.count, c.expect, c.label);
  }
  // README text includes the numbers 81, 27, 24, 36, 12, 6, 10,000 / 10000, 1,000 / 1000
  for(const n of ['81', '27', '24', '36', '12', '6', '10,000', '1,000']){
    assert.ok(readme.includes(n), `README is missing the number ${n}`);
  }
  // When enumeration happens, the number of listed candidates should match.
  const r27 = computeCandidates({digits:[2,5,9], pinLen:4, mode:'allowed', allowDup:true, wilds:['*','*','2','*']});
  assert.equal(r27.candidates.length, 27);
});

// --- 2. YAML metadata block structure ------------------------------------
test('README YAML metadata is well-formed inside the HTML comment', () => {
  assert.match(readme, /^<!--\n---\n[\s\S]+?---\n-->/, 'metadata block missing');
  const m = readme.match(/^<!--\n---\n([\s\S]+?)\n---\n-->/);
  const body = m[1];
  for(const line of ['id: day088', 'slug: pin-threat-simulator', 'hub: true']){
    assert.ok(body.includes(line), `metadata missing: ${line}`);
  }
  // tags: must be a YAML block list
  assert.match(body, /\ntags:\n(  - [a-z0-9-]+\n)+/,
    'tags: must be a block list of lowercase slugs');
  // category_ja: must be a block list
  assert.match(body, /\ncategory_ja:\n(  - .+\n)+/,
    'category_ja: must be a block list');
});

// --- 3. Image refs: all referenced images exist; all PNGs in assets/
//       are referenced from README ----------------------------------------
test('README image refs exist and every assets/*.png is referenced', () => {
  const refs = Array.from(readme.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)).map(m => m[1]);
  for(const r of refs){
    assert.ok(existsSync(join(root, r)), `${r} is referenced but missing`);
  }
  const pngs = readdirSync(join(root, 'assets')).filter(f => f.toLowerCase().endsWith('.png'));
  for(const png of pngs){
    const needle = `assets/${png}`;
    assert.ok(readme.includes(needle), `assets/${png} exists but is not referenced in README`);
  }
});

// --- 4. Directory structure block includes every tracked file ------------
test('Directory structure in README covers every tracked file (with description)', () => {
  // Pull the fenced code block that starts with "pin-threat-simulator/"
  const m = readme.match(/```[\r\n]+pin-threat-simulator\/[\r\n]+([\s\S]+?)[\r\n]+```/);
  assert.ok(m, 'directory structure code block not found');
  const block = m[1];
  const files = execSync('git ls-files', {cwd: root}).toString().trim().split(/\r?\n/);
  for(const f of files){
    const base = f.split('/').pop();
    assert.ok(block.includes(base), `${f} (basename ${base}) missing from directory block`);
  }
  // Every file (leaf) line must have a description after '#'. Pure directory
  // marker lines (ending in "/") describe structure and don't need a comment.
  for(const raw of block.split(/\r?\n/)){
    const line = raw.trimEnd();
    if(!line) continue;
    const stripped = line.replace(/^[│├└─\s]+/, '');
    if(!stripped) continue;
    // Directory marker lines look like "assets/" or "assets/   ".
    // Leaves have no trailing slash before the "#" comment.
    const name = stripped.split('#')[0].trim();
    if(name.endsWith('/')) continue;
    assert.ok(line.includes('#'), `directory line without description: ${line}`);
  }
});

// --- 5. Forbidden words (in prose; code and URLs excluded) ---------------
test('Forbidden words are not present in README prose', () => {
  // Strip fenced code blocks and inline URLs/code.
  let body = readme.replace(/```[\s\S]*?```/g, '');
  body = body.replace(/`[^`]*`/g, '');
  body = body.replace(/\]\([^)]+\)/g, '');
  body = body.replace(/https?:\/\/\S+/g, '');
  const banned = ['全て', '分かる', '既に', '無い', 'インターフェース', 'もっとも'];
  for(const w of banned){
    assert.ok(!body.includes(w), `forbidden word in README prose: "${w}"`);
  }
});

// --- 6. README must not claim X-Content-Type-Options is implemented ------
test('README does not claim X-Content-Type-Options is implemented', () => {
  assert.ok(!/X-Content-Type-Options.*実装済み/.test(readme),
    'README should not claim X-Content-Type-Options as implemented');
});

// --- 7. Acoustic thresholds in TECHNICAL.md match pin-engine defaults ----
test('TECHNICAL.md documents the same acoustic thresholds as pin-engine.js', () => {
  assert.ok(technical.includes(`rise = ${PEAK_DEFAULTS.rise}`),
    `TECHNICAL.md should mention rise = ${PEAK_DEFAULTS.rise}`);
  assert.ok(technical.includes(`fall = ${PEAK_DEFAULTS.fall}`),
    `TECHNICAL.md should mention fall = ${PEAK_DEFAULTS.fall}`);
  assert.ok(readme.includes('0.3') && readme.includes('0.1'),
    'README should mention the dual threshold values 0.3 / 0.1');
});

// --- 8. Bold emphasis budget: at most 2 per H2 section (outside code) ----
test('Each H2 section in README has at most 2 bold spans', () => {
  const lines = readme.split(/\r?\n/);
  let inCode = false;
  let section = '(前書き)';
  const counts = new Map();
  counts.set(section, 0);
  for(const line of lines){
    if(/^```/.test(line)){ inCode = !inCode; continue; }
    if(inCode) continue;
    if(/^##\s/.test(line)){
      section = line.trim();
      counts.set(section, 0);
      continue;
    }
    // Strip inline code so **…** inside `code` is not counted.
    const stripped = line.replace(/`[^`]*`/g, '');
    const bolds = stripped.match(/\*\*[^*\n]+\*\*/g) || [];
    counts.set(section, (counts.get(section) || 0) + bolds.length);
  }
  for(const [sec, n] of counts){
    assert.ok(n <= 2, `Section "${sec}" has ${n} bold spans (max 2 allowed)`);
  }
});

// --- 9. README.en.md structure ------------------------------------------
test('README.en.md starts with the English/Japanese toggle line and no YAML', () => {
  const firstLine = readmeEn.split(/\r?\n/)[0];
  assert.equal(firstLine, 'English · [日本語](README.md)',
    'first line of README.en.md must be the toggle line');
  assert.ok(!/^<!--/.test(readmeEn),
    'README.en.md must not carry a YAML / HTML comment header');
});

test('README.md includes the English toggle after the YAML comment, before H1', () => {
  // The YAML lives in an HTML comment at the top. The toggle line must sit
  // between the end of that comment and the first H1.
  const m = readme.match(/^<!--[\s\S]+?-->\s*\n([^\n]+)\n/);
  assert.ok(m, 'YAML HTML comment at top of README.md not found');
  assert.equal(m[1].trim(), '[English](README.en.md) · 日本語');
});

test('README.md and README.en.md expose the same H2 / H3 structure', () => {
  const jaH = h2h3(readme);
  const enH = h2h3(readmeEn);
  const jaLv = jaH.map(h => h.level).join(',');
  const enLv = enH.map(h => h.level).join(',');
  assert.equal(enLv, jaLv,
    `heading levels differ.\nja (${jaH.length}): ${jaLv}\nen (${enH.length}): ${enLv}`);
  assert.equal(enH.length, jaH.length,
    `heading count differs: ja=${jaH.length} en=${enH.length}`);
});

test('README.en.md image refs exist and every assets/en/*.png is referenced', () => {
  const refs = Array.from(readmeEn.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)).map(m => m[1]);
  for(const r of refs){
    assert.ok(existsSync(join(root, r)), `${r} is referenced from README.en.md but missing`);
  }
  const enDir = join(root, 'assets', 'en');
  if(existsSync(enDir)){
    const pngs = readdirSync(enDir).filter(f => f.toLowerCase().endsWith('.png'));
    for(const png of pngs){
      const needle = `assets/en/${png}`;
      assert.ok(readmeEn.includes(needle),
        `assets/en/${png} exists but is not referenced from README.en.md`);
    }
  }
});

test('README.en.md includes the same calc numbers (81 and 27)', () => {
  for(const n of ['81', '27', '24', '36', '12', '6', '10,000', '1,000']){
    assert.ok(readmeEn.includes(n), `README.en.md is missing the number ${n}`);
  }
});

// --- 10. List items must not start with "- **name**" ----------------------
// --- 11. Shoulder-surfing score examples in README / README.en.md /
//         TECHNICAL.md are consistent with the engine ---------------------
test('shoulder-surfing confidence + score examples match the engine', () => {
  // The 4 published cases, one per paragraph.
  const cases = [
    {viewpoint:'top',  pixelErr:8,  cands:4, conf:88,   score:100},
    {viewpoint:'top',  pixelErr:25, cands:2, conf:62.5, score:61.25},
    {viewpoint:'tilt', pixelErr:8,  cands:4, conf:58,   score:89},
    {viewpoint:'tilt', pixelErr:30, cands:1, conf:25,   score:27.5},
  ];
  for(const c of cases){
    assert.equal(
      videoConfidence({viewpoint:c.viewpoint, pixelErr:c.pixelErr}),
      c.conf,
      `videoConfidence ${JSON.stringify(c)}`
    );
    assert.equal(radarScore(c.cands, c.conf), c.score,
      `radarScore ${JSON.stringify(c)}`);
  }

  // README.md must mention each published number verbatim, and there must be
  // exactly 4 "ケース" headings (the task spec requires 4 examples).
  const needlesJa = ['88%', '100', '62.5%', '61.25', '58%', '89', '25%', '27.5'];
  for(const n of needlesJa){
    assert.ok(readme.includes(n), `README.md missing shoulder-surfing number ${n}`);
  }
  const jaCaseCount = (readme.match(/^ケース\d:/gm) || []).length;
  assert.equal(jaCaseCount, 4, `README.md has ${jaCaseCount} 'ケースN:' headings (expected 4)`);

  // README.en.md must mention each published number.
  const needlesEn = ['88%', '100', '62.5%', '61.25', '58%', '89', '25%', '27.5'];
  for(const n of needlesEn){
    assert.ok(readmeEn.includes(n), `README.en.md missing shoulder-surfing number ${n}`);
  }
  const enCaseCount = (readmeEn.match(/^Case \d:/gm) || []).length;
  assert.equal(enCaseCount, 4, `README.en.md has ${enCaseCount} 'Case N:' headings (expected 4)`);

  // TECHNICAL.md must at least mention videoAccuracy and the formula.
  assert.ok(technical.includes('videoAccuracy'), 'TECHNICAL.md missing videoAccuracy');
  assert.ok(technical.includes('candidates.length * 15 + results.video.confidence * 0.5')
    || technical.includes('candidates.length × 15')
    || technical.includes('results.video.candidates.length * 15'),
    'TECHNICAL.md missing the radar-score formula for video');
});

test('No list item in README starts with a bolded label like "- **name**"', () => {
  const lines = readme.split(/\r?\n/);
  let inCode = false;
  const offenders = [];
  lines.forEach((line, i) => {
    if(/^```/.test(line)){ inCode = !inCode; return; }
    if(inCode) return;
    // Match "- **…**" or "  - **…**" etc. Also catches "* **…**".
    if(/^\s*[-*]\s+\*\*[^*]+\*\*/.test(line)){
      offenders.push(`${i + 1}: ${line.trim()}`);
    }
  });
  assert.equal(offenders.length, 0,
    `list items with bold labels found:\n${offenders.join('\n')}`);
});
