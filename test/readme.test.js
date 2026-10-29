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
// pts-messages.js, index.html and script.js.
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

test('Unique use 1 (collection): must-include / allowed-set ratios match the engine', () => {
  const kinds = [1, 2, 3, 4, 5, 6];
  const count = (pinLen, mode) =>
    computeCandidates({digits: kinds, pinLen, mode, allowDup: true, wilds: null}).count;
  const [must6, all6, must8, all8] = [count(6, 'must'), count(6, 'allowed'), count(8, 'must'), count(8, 'allowed')];
  assert.deepEqual([must6, all6, must8, all8], [720, 46656, 191520, 1679616]);
  const pct = (a, b) => (100 * a / b).toFixed(1) + '%';
  assert.deepEqual([pct(must6, all6), pct(must8, all8)], ['1.5%', '11.4%']);
  assert.match(html, /id="pin-length"[^>]*max="8"/, 'the PIN length input must accept 8');
  const ja = jaItems()[0];
  const en = enItems()[0];
  for(const s of [ja, en]){
    for(const n of [must6, all6, must8, all8]) assert.ok(s.includes(comma(n)), `missing ${comma(n)}: ${s.slice(0, 40)}`);
    for(const p of [pct(must6, all6), pct(must8, all8)]) assert.ok(s.includes(p), `missing ${p}: ${s.slice(0, 40)}`);
  }
  assert.ok(ja.includes(`${comma(must8)}÷${comma(all8)}`) && ja.includes('サイコロを8回'));
  assert.ok(en.includes(`${comma(must8)} / ${comma(all8)}`) && en.includes('8 rolls of a die'));
  // The shareable link opens the 8-purchase must-include count (a link with
  // digits= runs the calculation once on load).
  assert.ok(script.includes("parseHash(window.location.hash).digits){ el('calc-btn').click(); }"));
  for(const [s, lang] of [[ja, 'ja'], [en, 'en']]){
    const m = s.match(/\(https:\/\/ipusiron\.github\.io\/pin-threat-simulator\/(#[^)\s]+)\)/);
    assert.ok(m, `shareable link missing (${lang})`);
    const h = parseHash(m[1]);
    assert.deepEqual(h, {digits: '123456', len: 8, mode: 'must', allowDup: true, lang});
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
  const T0 = 40; // 4 clicks of +10, capped at 40
  assert.ok(script.includes('Math.min((node._temp || 0) + 10, 40)'));
  assert.match(html, /id="time-since" type="range" min="0" max="60"/);
  // RC = 200 kOhm x 100 uF = 20 s, the engine's default tau.
  assert.ok(Math.abs(200e3 * 100e-6 - 20) < 1e-9);
  assert.ok(Math.abs(thermalDecay(T0, 20) - T0 * Math.exp(-1)) < 1e-12);
  // First whole second at which the rounded on-screen value reaches half.
  let half = 0;
  while(Math.round(thermalDecay(T0, half)) > T0 / 2) half++;
  assert.equal(half, 14);
  const at20 = thermalDecay(T0, 20);
  const at60 = thermalDecay(T0, 60);
  const p = (v) => (100 * v / T0).toFixed(1) + '%';
  assert.deepEqual([Math.round(at20), at20.toFixed(2), p(at20)], [15, '14.72', '36.8%']);
  assert.deepEqual([Math.round(at60), at60.toFixed(2), p(at60)], [2, '1.99', '5.0%']);
  const halfLife = (20 * Math.log(2)).toFixed(1);
  const discharged = (100 * (1 - at60 / T0)).toFixed(0) + '%';
  assert.deepEqual([halfLife, discharged], ['13.9', '95%']);
  const ja = jaItems()[1];
  const en = enItems()[1];
  for(const s of [ja, en]){
    for(const n of [at20.toFixed(2), p(at20), at60.toFixed(2), p(at60), halfLife, discharged]){
      assert.ok(s.includes(n), `missing ${n}: ${s.slice(0, 40)}`);
    }
  }
  assert.ok(ja.includes(`${T0}にし`) && ja.includes(`${half}秒で半分の${T0 / 2}`));
  assert.ok(ja.includes(`20秒（時定数の1倍）で${Math.round(at20)}`) && ja.includes(`60秒（3倍）で${Math.round(at60)}`));
  assert.ok(ja.includes('200kΩ') && ja.includes('100μF') && ja.includes('RC=20秒'));
  assert.ok(en.includes(`reach ${T0}`) && en.includes(`${T0 / 2} (half) at ${half} seconds`));
  assert.ok(en.includes(`${Math.round(at20)} at 20 seconds`) && en.includes(`${Math.round(at60)} at 60 seconds`));
  assert.ok(en.includes('200 kΩ') && en.includes('100 μF') && en.includes('RC = 20 seconds'));
  assert.ok(translate('ja', 'ui.thermalTimeLabel').startsWith('経過時間') && ja.includes('経過時間のスライダー'));
  assert.ok(translate('en', 'ui.thermalTimeLabel').startsWith('Elapsed time') && en.includes('elapsed-time slider'));
});

test('Unique use 3 (averaging): a shoulder-surfing-only run tiers as low risk', () => {
  // UI defaults quoted in the README: overhead viewpoint, 8px error, PIN length 4.
  assert.match(html, /<select id="video-angle">\s*<option value="top"/);
  assert.match(html, /id="pixel-error"[^>]*value="8"/);
  assert.match(html, /id="pin-length"[^>]*value="4"/);
  const confidence = videoConfidence({viewpoint: 'top', pixelErr: 8});
  const digits = ['1', '2', '3', '4'];
  const video = radarScore(digits.length, confidence);
  const scores = methodScores({finger: null, thermal: null, audio: null, video: {candidates: digits, confidence}});
  assert.deepEqual(scores, {finger: 0, thermal: 0, audio: 0, video: 100});
  const mean = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
  const max = Math.max(...Object.values(scores));
  assert.deepEqual([mean, hintLevel(scores), max, hintLevel({max})], [25, 'low', 100, 'high']);
  // Tier thresholds: strictly above 60 is high, strictly above 30 is mid.
  assert.deepEqual([60, 61, 30, 31].map((a) => hintLevel({a})), ['mid', 'high', 'low', 'mid']);
  // The "Danger" hint's brute-force count: 4 digits over length 4.
  const brute = computeCandidates({digits: [1, 2, 3, 4], pinLen: 4, mode: 'allowed', allowDup: true, wilds: null}).count;
  assert.equal(brute, 256);
  const ja = jaItems()[2];
  const en = enItems()[2];
  assert.ok(ja.includes('平均が60を超えると高リスク、30を超えると中リスク'));
  assert.ok(ja.includes('誤差8px') && ja.includes('1234'));
  assert.ok(ja.includes(`上限の${video}`) && ja.includes(`平均は${mean}`));
  assert.ok(ja.includes(`候補数字が${digits.length}個で${brute}通り`));
  assert.ok(ja.includes(`最大値でまとめれば${max}で高リスク`));
  assert.ok(en.includes('above 60 is high risk, above 30 is medium risk'));
  assert.ok(en.includes('8px error') && en.includes('1234'));
  assert.ok(en.includes(`cap of ${video}`) && en.includes(`the mean is ${mean}`));
  assert.ok(en.includes(`only ${digits.length} candidate digits remain and a brute force over ${brute} combinations`));
  assert.ok(en.includes(`maximum would give ${max} and high risk`));
  // UI wording quoted in the README exists in the dictionary.
  const tightJa = translate('ja', 'hint.candidateTight', {len: digits.length, total: brute});
  const tightEn = translate('en', 'hint.candidateTight', {len: digits.length, total: brute});
  assert.ok(translate('ja', 'ui.runSim') === '全手法を統合' && ja.includes('「全手法を統合」'));
  assert.ok(translate('ja', 'hint.riskLow').includes('低リスク') && ja.includes('「低リスク」'));
  assert.ok(tightJa.includes('危険') && tightJa.includes(`${brute}通り`) && ja.includes('「危険」'));
  assert.ok(translate('en', 'ui.runSim') === 'Integrate all methods' && en.includes('"Integrate all methods"'));
  assert.ok(translate('en', 'hint.riskLow').includes('Low risk') && en.includes('"Low risk"'));
  assert.ok(tightEn.includes('Danger') && tightEn.includes(`${brute} combinations`) && en.includes('"Danger"'));
});
