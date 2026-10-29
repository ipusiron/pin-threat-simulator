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
  thermalDecay, methodScores, hintLevel, parseHash,
} from '../pin-engine.js';
import {translate} from '../pts-messages.js';

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

  // TECHNICAL.md must at least mention videoAccuracy and the radar-score
  // formula (either the inlined math or a reference to radarScore()).
  assert.ok(technical.includes('videoAccuracy'), 'TECHNICAL.md missing videoAccuracy');
  assert.ok(technical.includes('radarScore')
    || technical.includes('× 15 + ')
    || technical.includes('* 15 + '),
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

// --- 12. "このツールならではの使い方" / "Ways of using this tool in particular" ----
// A plain-text label line (not a heading, so the H2/H3 parity test above is
// unaffected) opens the use-case section in both languages, before the
// general uses and Scenario 1. Every number in its three items is recomputed
// from pin-engine.js; the UI wording and defaults they quote are read from
// pts-messages.js, index.html and script.js. Each number is looked up inside
// a sentence fragment that also carries the words on both sides of it and the
// conditions it was computed under (purchases, length, presses, tau,
// viewpoint, error, input PIN), so changing a digit or a condition in either
// README fails. The script.js lines that produce the on-screen results are
// pinned as plain strings, like the other checks against script.js.
const html = readFileSync(join(root, 'index.html'), 'utf8');
const script = readFileSync(join(root, 'script.js'), 'utf8');

/** The three items between the unique-use label and the general-use label. */
function uniqueUseItems(md, h2, label, generalLabel, scenarioHeading){
  const text = md.replace(/\r\n/g, '\n');
  const start = text.indexOf(`\n${h2}\n`);
  assert.ok(start >= 0, `${h2} is missing`);
  const rest = text.slice(start + h2.length + 2);
  const end = rest.search(/\n## /);
  const sec = end < 0 ? rest : rest.slice(0, end);
  const a = sec.indexOf(`\n${label}\n`);
  const b = sec.indexOf(`\n${generalLabel}\n`);
  const c = sec.indexOf(`\n${scenarioHeading}`);
  assert.ok(a >= 0, `"${label}" label line is missing under ${h2}`);
  assert.ok(b > a, `"${generalLabel}" must follow "${label}"`);
  assert.ok(c > b, `${scenarioHeading} must follow "${generalLabel}"`);
  assert.ok(!/\n- /.test(sec.slice(0, a)), `"${label}" must come before every list item`);
  const items = sec.slice(a + label.length + 2, b).split('\n').filter((l) => l.startsWith('- '));
  assert.equal(items.length, 3, `${label}: expected 3 items, got ${items.length}`);
  return items;
}
const jaItems = () => uniqueUseItems(readme, '## 🎯 ユースケース',
  'このツールならではの使い方', '一般的な使い方', '### シナリオ1');
const enItems = () => uniqueUseItems(readmeEn, '## 🎯 Use Cases',
  'Ways of using this tool in particular', 'General uses', '### Scenario 1');
const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

test('Use cases: the unique-use block opens the section in README.md and README.en.md', () => {
  assert.equal(jaItems().length, 3);
  assert.equal(enItems().length, 3);
});

/** Fail with the missing fragment when `s` does not contain each one verbatim. */
function hasFragments(s, frags, lang){
  for(const f of frags) assert.ok(s.includes(f), `${lang}: missing "${f}"`);
}
const numberWord = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

test('Unique use 1 (collection): must-include / allowed-set ratios match the engine', () => {
  const kinds = [1, 2, 3, 4, 5, 6];
  const K = kinds.length;
  const [n6, n8] = [6, 8]; // number of purchases = PIN length
  const count = (pinLen, mode) =>
    computeCandidates({digits: kinds, pinLen, mode, allowDup: true, wilds: null}).count;
  const [must6, all6, must8, all8] = [count(n6, 'must'), count(n6, 'allowed'), count(n8, 'must'), count(n8, 'allowed')];
  assert.deepEqual([must6, all6, must8, all8], [720, 46656, 191520, 1679616]);
  const pct = (a, b) => (100 * a / b).toFixed(1) + '%';
  const [p6, p8] = [pct(must6, all6), pct(must8, all8)];
  assert.deepEqual([p6, p8], ['1.5%', '11.4%']);
  const maxLen = Number(html.match(/id="pin-length"[^>]*max="(\d+)"/)[1]);
  assert.ok(maxLen >= n8, `the PIN length input must accept ${n8} (max=${maxLen})`);
  const ja = jaItems()[0];
  const en = enItems()[0];
  hasFragments(ja, [
    `: ${K}種類あるおまけを全部集めたい人が、`,
    `として、${n6}個買う場合（候補集合1〜${K}・重複あり・${n6}桁）を計算する。`,
    `。全種類がそろう並びは${comma(must6)}通り、全部の並びは${comma(all6)}通りで、確率は約${p6}になる。`,
    `。${n8}個（${n8}桁）に増やしても${comma(must8)}÷${comma(all8)}で約${p8}にとどまる。`,
    `。サイコロを${n8}回振って1〜${K}の目がすべて出る確率も同じ計算で求まる。`,
    `。[${n8}個の場合の共有リンク](`,
  ], 'ja');
  hasFragments(en, [
    `: someone who wants all ${K} kinds of a bonus toy works out`,
    `, calculate buying ${n6} (candidate set 1-${K}, duplicates allowed, length ${n6}).`,
    `. The sequences that contain every kind number ${comma(must6)} out of ${comma(all6)} in total, a chance of about ${p6}.`,
    `. Even with ${n8} purchases (length ${n8}) it is only ${comma(must8)} / ${comma(all8)}, about ${p8}.`,
    `. The chance that ${n8} rolls of a die show every face from 1 to ${K} comes from the same calculation.`,
    `. The [shareable link for ${n8} purchases](`,
  ], 'en');
  // The shareable link opens the 8-purchase must-include count (a link with
  // digits= runs the calculation once on load).
  assert.ok(script.includes("parseHash(window.location.hash).digits){ el('calc-btn').click(); }"));
  for(const [s, lang] of [[ja, 'ja'], [en, 'en']]){
    const m = s.match(/\(https:\/\/ipusiron\.github\.io\/pin-threat-simulator\/(#[^)\s]+)\)/);
    assert.ok(m, `shareable link missing (${lang})`);
    const h = parseHash(m[1]);
    assert.deepEqual(h, {digits: kinds.join(''), len: n8, mode: 'must', allowDup: true, lang});
    const r = computeCandidates({
      digits: h.digits.split('').map(Number), pinLen: h.len, mode: h.mode, allowDup: h.allowDup, wilds: null,
    });
    assert.equal(r.count, must8);
  }
  // Mode names quoted in the README exist in the UI dictionary.
  assert.ok(translate('ja', 'ui.modeMust').startsWith('必須包含モード') && ja.includes('必須包含モード'));
  assert.ok(translate('ja', 'ui.modeAllowed').startsWith('許容集合モード') && ja.includes('許容集合モード'));
  assert.ok(translate('en', 'ui.modeMust').startsWith('Must-include mode') && en.includes('must-include'));
  assert.ok(translate('en', 'ui.modeAllowed').startsWith('Allowed-set mode') && en.includes('allowed-set'));
});

test('Unique use 2 (RC discharge): thermalDecay readings match the engine', () => {
  // A click on a thermal key adds `step`, capped at T0.
  const press = script.match(/node\._temp = Math\.min\(\(node\._temp \|\| 0\) \+ (\d+), (\d+)\);/);
  assert.ok(press, 'thermal key click handler not found in script.js');
  const [step, T0] = press.slice(1).map(Number);
  assert.deepEqual([step, T0], [10, 40]);
  const presses = T0 / step;
  // The engine's default tau is 20 s, and the UI never passes another value.
  const tau = 20;
  for(const t of [0, 7, 14, tau, 3 * tau]){
    assert.ok(Math.abs(thermalDecay(T0, t) - T0 * Math.exp(-t / tau)) < 1e-12, `thermalDecay(${T0}, ${t})`);
  }
  const argCounts = [...script.matchAll(/thermalDecay\(([^()]+)\)/g)].map((m) => m[1].split(',').length);
  assert.ok(argCounts.length >= 2 && argCounts.every((n) => n === 2), `thermalDecay calls in script.js: ${argCounts}`);
  // Moving the slider rewrites each key with the rounded value; the label
  // next to the slider shows the seconds only.
  for(const s of [
    "el('time-since-value').textContent = s + 's';",
    'const currentTemps = baseTemps.map(t => thermalDecay(t, s));',
    "node.querySelector('.density').textContent = Math.round(currentTemps[i]);",
  ]) assert.ok(script.includes(s), `script.js: ${s}`);
  const sliderMax = Number(html.match(/id="time-since" type="range" min="0" max="(\d+)"/)[1]);
  assert.ok(sliderMax >= 3 * tau, `the slider must reach ${3 * tau} s (max=${sliderMax})`);
  // RC = 200 kOhm x 100 uF = 20 s, the same as tau.
  const [kOhm, uF] = [200, 100];
  const rc = kOhm * uF / 1000;
  assert.equal(rc, tau);
  // First whole second at which the rounded value on the key reaches half.
  let half = 0;
  while(Math.round(thermalDecay(T0, half)) > T0 / 2) half++;
  assert.equal(half, 14);
  const at1 = thermalDecay(T0, tau);
  const at3 = thermalDecay(T0, 3 * tau);
  const p = (v) => (100 * v / T0).toFixed(1) + '%';
  assert.deepEqual([Math.round(at1), at1.toFixed(2), p(at1)], [15, '14.72', '36.8%']);
  assert.deepEqual([Math.round(at3), at3.toFixed(2), p(at3)], [2, '1.99', '5.0%']);
  const halfLife = (tau * Math.log(2)).toFixed(1);
  const discharged = (100 * (1 - at3 / T0)).toFixed(0) + '%';
  assert.deepEqual([halfLife, discharged], ['13.9', '95%']);
  const ja = jaItems()[1];
  const en = enItems()[1];
  hasFragments(ja, [
    ': 電子工作をする人が、熱解析の減衰の式 `T₀ × exp(-t/τ)` を、RC回路の放電の式 `V₀ × exp(-t/RC)` と同じ形の式として読む。',
    `。時定数τ=${tau}秒は、${kOhm}kΩの抵抗と${uF}μFのコンデンサーをつないだ回路（RC=${rc}秒）にあたる。`,
    `。τは${tau}秒で固定なので、ほかの抵抗とコンデンサーの組では、${tau}秒を時定数1つ分として読み替える。`,
    `。熱解析のテンキーの1つのキーを${presses}回押して${T0}にし、経過時間のスライダーを動かす。`,
    `。キーの表示は${half}秒で半分の${T0 / 2}、${tau}秒（時定数の1倍）で${Math.round(at1)}（計算では${at1.toFixed(2)}、${p(at1)}）、`
      + `${3 * tau}秒（3倍）で${Math.round(at3)}（${at3.toFixed(2)}、${p(at3)}）になる。`,
    `。半分になるまでの時間は計算では${tau}×ln2≈${halfLife}秒で、表示が${half}秒で${T0 / 2}になることと合う。`,
    `。「時定数の3倍で約${discharged}放電する」という電子回路の目安を、スライダーを動かしたときのキーの数字で確かめられる。`,
  ], 'ja');
  hasFragments(en, [
    ': someone building circuits reads the thermal decay formula `T0 * exp(-t / tau)`'
      + ' as having the same form as the RC discharge formula `V0 * exp(-t / RC)`.',
    `. The time constant tau = ${tau} seconds matches a circuit with a ${kOhm} kΩ resistor`
      + ` and a ${uF} μF capacitor (RC = ${rc} seconds).`,
    `. Tau is fixed at ${tau} seconds, so for other resistor and capacitor values, read ${tau} seconds as one time constant.`,
    `. Press one key of the thermal keypad ${presses} times to reach ${T0} and move the elapsed-time slider.`,
    `. The key shows ${T0 / 2} (half) at ${half} seconds,`
      + ` ${Math.round(at1)} at ${tau} seconds (one time constant; ${at1.toFixed(2)} by calculation, ${p(at1)}),`
      + ` and ${Math.round(at3)} at ${3 * tau} seconds (three time constants; ${at3.toFixed(2)}, ${p(at3)}).`,
    `. By calculation the time to fall to half is ${tau} × ln 2 ≈ ${halfLife} seconds,`
      + ` which agrees with the display reaching ${T0 / 2} at ${half} seconds.`,
    '. The number on the key as you move the slider lets you check the electronics rule of thumb'
      + ` that a capacitor is about ${discharged} discharged after three time constants.`,
  ], 'en');
  assert.ok(translate('ja', 'ui.thermalTimeLabel').startsWith('経過時間'));
  assert.ok(translate('en', 'ui.thermalTimeLabel').startsWith('Elapsed time'));
});

test('Unique use 3 (averaging): a shoulder-surfing-only run tiers as low risk', () => {
  // Defaults the README relies on, read from index.html: the first viewpoint
  // option, the pixel error and the PIN length.
  const vp = html.match(/<select id="video-angle">\s*<option value="(\w+)"/)[1];
  const px = Number(html.match(/id="pixel-error"[^>]*value="(\d+)"/)[1]);
  const pinLen = Number(html.match(/id="pin-length"[^>]*value="(\d+)"/)[1]);
  assert.deepEqual([vp, px, pinLen], ['top', 8, 4]);
  // The script.js paths behind the result: the distinct digits of the input
  // PIN are the candidates, only a tilted view or an error above 20px drops
  // any of them, the tier is the engine's hintLevel over the four scores, the
  // "Danger" hint fires for at most 4 digits at length 4, and the radar plots
  // each score as a fraction of its outer ring.
  for(const s of [
    'let candidates = Array.from(new Set(videoPinInput));',
    'const confidence = videoConfidence({viewpoint: videoAngle, pixelErr});',
    "if(videoAngle === 'tilt'){",
    'if(pixelErr > 20){',
    'const scores = methodScores(results);',
    'const level = hintLevel(scores);',
    "const estimatedLength = results.audio || Number(el('pin-length').value) || 4;",
    'if(candidates.length <= 4 && length === 4){',
    "hints.push(t('hint.candidateTight', {len: candidates.length, total: Math.pow(candidates.length, length)}));",
    'const values = [scores.finger, scores.thermal, scores.audio, scores.video];',
  ]) assert.ok(script.includes(s), `script.js: ${s}`);
  // A score of 100 lands on the outermost of the radar's rings.
  const scales = [...script.matchAll(/const score = values\[i\] \/ (\d+);/g)].map((m) => Number(m[1]));
  assert.ok(scales.length >= 2 && scales.every((d) => d === 100), `radar scales: ${scales}`);
  const rings = script.match(/for\(let i=1; i<=(\d+); i\+\+\)\{\s*radarCtx\.beginPath\(\);\s*radarCtx\.arc\(cx, cy, radius \* i\/(\d+),/);
  assert.ok(rings && rings[1] === rings[2], 'the outermost radar ring must sit at the full radius');
  assert.ok(px <= 20, 'the default error must keep every detected digit');
  const pin = '1234';
  const digits = [...new Set(pin)];
  const confidence = videoConfidence({viewpoint: vp, pixelErr: px});
  const video = radarScore(digits.length, confidence);
  const scores = methodScores({finger: null, thermal: null, audio: null, video: {candidates: digits, confidence}});
  assert.deepEqual(scores, {finger: 0, thermal: 0, audio: 0, video: 100});
  const vals = Object.values(scores);
  const methods = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / methods;
  const max = Math.max(...vals);
  assert.deepEqual([methods, mean, hintLevel(scores), max, hintLevel({max})], [4, 25, 'low', 100, 'high']);
  // Tier thresholds: strictly above 60 is high, strictly above 30 is mid.
  const [hi, mid] = [60, 30];
  assert.deepEqual([hi, hi + 1, mid, mid + 1].map((a) => hintLevel({a})), ['mid', 'high', 'low', 'mid']);
  // The "Danger" hint's brute-force count: the 4 digits over the PIN length.
  const brute = computeCandidates({digits: digits.map(Number), pinLen, mode: 'allowed', allowDup: true, wilds: null}).count;
  assert.equal(brute, 256);
  // UI words the README quotes: the viewpoint option and the radar axis.
  const topJa = translate('ja', 'ui.videoAngleTop').split('（')[0];
  const topEn = translate('en', 'ui.videoAngleTop').split(' (')[0].toLowerCase();
  const axisJa = translate('ja', 'radar.video');
  const axisEn = translate('en', 'radar.video');
  assert.deepEqual([topJa, topEn, axisJa, axisEn], ['真上', 'overhead', '盗撮', 'Video']);
  const runJa = translate('ja', 'ui.runSim');
  const runEn = translate('en', 'ui.runSim');
  assert.deepEqual([runJa, runEn], ['全手法を統合', 'Integrate all methods']);
  const ja = jaItems()[2];
  const en = enItems()[2];
  assert.ok(ja.startsWith('- 平均でまとめると危険度が満点の項目が埋もれることを確かめる（評価表の設計）: '), ja.slice(0, 40));
  assert.ok(en.startsWith('- Seeing how averaging buries a maximum risk score (designing evaluation sheets): '), en.slice(0, 60));
  hasFragments(ja, [
    `。段階は${methods}手法のスコアの平均で決まり、平均が${hi}を超えると高リスク、${mid}を超えると中リスク、それ以外は低リスクになる。`,
    `。盗撮解析だけを、初期設定の${topJa}・誤差${px}pxのまま入力PINを${pin}にして解析し、「${runJa}」を押す。`,
    `。レーダーチャートでは${axisJa}の点が外周（上限の${video}）に届くが、`
      + `ほかの${methods - 1}手法の点は中心（0）にあるので平均は${mean}となり、「低リスク」と表示される。`,
    `。同じ画面には、候補数字が${digits.length}個で${brute}通りの総当たりが現実的だという「危険」の警告も並ぶ。`,
    `。最大値でまとめれば${max}で高リスクになる。`,
    '。1つの手段だけで破られる対象を平均で採点すると、危険度が満点の項目が埋もれることを、評価表を作る前に数字で確かめられる。',
  ], 'ja');
  hasFragments(en, [
    `. The tier comes from the mean of the ${numberWord[methods]} method scores:`
      + ` above ${hi} is high risk, above ${mid} is medium risk, otherwise low risk.`,
    `. Run only the shoulder-surfing analysis with the default ${topEn} viewpoint and ${px}px error`
      + ` on the input PIN ${pin}, then press "${runEn}".`,
    `. On the radar chart the point on the ${axisEn} axis reaches the outer ring (the cap of ${video}),`
      + ` but the points of the other ${numberWord[methods - 1]} methods stay at the center (0),`
      + ` so the mean is ${mean} and the panel shows "Low risk".`,
    `. The same panel also shows the "Danger" warning that only ${digits.length} candidate digits remain`
      + ` and a brute force over ${brute} combinations is realistic.`,
    `. Combining by the maximum would give ${max} and high risk.`,
    '. Before designing a sheet, you can check in numbers that averaging buries a maximum risk score'
      + ' when a single method alone is enough to break the target.',
  ], 'en');
  // UI wording quoted in the README exists in the dictionary.
  const tightJa = translate('ja', 'hint.candidateTight', {len: digits.length, total: brute});
  const tightEn = translate('en', 'hint.candidateTight', {len: digits.length, total: brute});
  assert.ok(translate('ja', 'ui.videoHeading').includes('盗撮解析'));
  assert.ok(translate('en', 'ui.videoHeading').includes('Shoulder-surfing analysis'));
  assert.ok(translate('ja', 'hint.riskLow').includes('低リスク'));
  assert.ok(translate('en', 'hint.riskLow').includes('Low risk'));
  assert.ok(tightJa.includes('危険') && tightJa.includes(`${digits.length}個のみ`) && tightJa.includes(`${brute}通り`));
  assert.ok(tightEn.includes('Danger') && tightEn.includes(`Only ${digits.length} candidate digits`)
    && tightEn.includes(`${brute} combinations`));
});
