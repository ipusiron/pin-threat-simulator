// Tests for pin-engine.js: direct expected values + exhaustive oracle sweep.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCandidates, parseWildcards, binom, countPeaks,
  videoAccuracy, thermalDecay, generateCombinations,
  videoConfidence, radarScore, methodScores, rankPins, hintLevel,
  RANK_WEIGHTS, VIDEO_ANGLE_PENALTY,
} from '../pin-engine.js';

// ---- Oracle (reference implementation) ---------------------------------
// Enumerate every length-n sequence over `alphabet`, then filter by
// mode / allowDup / wilds / S. Returns {count, candidates:sorted}.
function oracle({digits, pinLen, mode, allowDup, wilds}){
  const n = pinLen;
  const S = Array.from(new Set((digits || []).map(d => String(d))));
  const alphabet = (mode === 'partial')
    ? ['0','1','2','3','4','5','6','7','8','9']
    : S.slice();

  const cands = [];
  const buf = new Array(n);
  function rec(i){
    if(i === n){
      if(!accept(buf)) return;
      cands.push(buf.join(''));
      return;
    }
    for(const d of alphabet){
      buf[i] = d;
      rec(i + 1);
    }
  }
  function accept(seq){
    // Fixed-position check (wildcards)
    if(wilds){
      for(let i = 0; i < n; i++){
        const t = wilds[i];
        if(t === '*') continue;
        if(seq[i] !== t) return false;
        // Fixed digit must be in alphabet. For allowed/must this means in S.
        if(mode !== 'partial' && !S.includes(t)) return false;
      }
    }
    // allowDup check (unique across all positions)
    if(!allowDup){
      const seen = new Set();
      for(const d of seq){
        if(seen.has(d)) return false;
        seen.add(d);
      }
    }
    // must-mode: all elements of S appear
    if(mode === 'must'){
      const seen = new Set(seq);
      for(const r of S) if(!seen.has(r)) return false;
    }
    return true;
  }
  if(alphabet.length === 0 || n === 0){
    return {count: 0, candidates: []};
  }
  rec(0);
  cands.sort();
  return {count: cands.length, candidates: cands};
}

// ---- Direct expected values from the spec ------------------------------
const CASES = [
  // S={1,2,3}
  {label:'allowed+dup S={1,2,3} n=4',           in:{digits:[1,2,3], pinLen:4, mode:'allowed', allowDup:true,  wilds:null},                       expect:81},
  {label:'allowed+dup S={1,2,3} n=4 *,*,2,*',   in:{digits:[1,2,3], pinLen:4, mode:'allowed', allowDup:true,  wilds:['*','*','2','*']},          expect:27},
  {label:'allowed+dup S={1,2,3} n=4 *,*,7,* (7∉S)', in:{digits:[1,2,3], pinLen:4, mode:'allowed', allowDup:true, wilds:['*','*','7','*']},     expect:0},
  {label:'allowed+nodup S={1,2,3} n=4',         in:{digits:[1,2,3], pinLen:4, mode:'allowed', allowDup:false, wilds:null},                       expect:0},
  // S={1,2,3,4}
  {label:'allowed+nodup S={1,2,3,4} n=4',       in:{digits:[1,2,3,4], pinLen:4, mode:'allowed', allowDup:false, wilds:null},                     expect:24},
  {label:'allowed+nodup S={1,2,3,4} n=4 *,*,2,*', in:{digits:[1,2,3,4], pinLen:4, mode:'allowed', allowDup:false, wilds:['*','*','2','*']},     expect:6},
  // must
  {label:'must+dup S={1,2,3} n=4',              in:{digits:[1,2,3], pinLen:4, mode:'must', allowDup:true,  wilds:null},                           expect:36},
  {label:'must+dup S={1,2,3} n=4 *,*,2,*',      in:{digits:[1,2,3], pinLen:4, mode:'must', allowDup:true,  wilds:['*','*','2','*']},             expect:12},
  {label:'must+nodup S={1,2,3} n=3',            in:{digits:[1,2,3], pinLen:3, mode:'must', allowDup:false, wilds:null},                           expect:6},
  {label:'must+nodup S={1,2,3} n=3 *,2,*',      in:{digits:[1,2,3], pinLen:3, mode:'must', allowDup:false, wilds:['*','2','*']},                 expect:2},
  {label:'must+nodup S={1,2,3} n=4',            in:{digits:[1,2,3], pinLen:4, mode:'must', allowDup:false, wilds:null},                           expect:0},
  // partial
  {label:'partial+dup n=4',                     in:{digits:[],      pinLen:4, mode:'partial', allowDup:true,  wilds:null},                        expect:10000},
  {label:'partial+dup n=4 *,*,2,*',             in:{digits:[],      pinLen:4, mode:'partial', allowDup:true,  wilds:['*','*','2','*']},           expect:1000},
  {label:'partial+nodup n=4',                   in:{digits:[],      pinLen:4, mode:'partial', allowDup:false, wilds:null},                        expect:5040},
  {label:'partial+nodup n=4 *,*,2,*',           in:{digits:[],      pinLen:4, mode:'partial', allowDup:false, wilds:['*','*','2','*']},           expect:504},
];

test('direct expected values match the spec', () => {
  for(const c of CASES){
    const got = computeCandidates(c.in);
    assert.equal(got.count, c.expect, `${c.label}: count ${got.count} != ${c.expect}`);
  }
});

test('listed candidates are consistent with count when under the cap', () => {
  for(const c of CASES){
    const got = computeCandidates(c.in);
    if(got.candidates && got.candidates.length > 0){
      // When listed, length must equal count.
      assert.equal(got.candidates.length, got.count,
        `${c.label}: listed=${got.candidates.length} vs count=${got.count}`);
      // Monotone sorted and all strings of expected length.
      for(let i = 1; i < got.candidates.length; i++){
        assert.ok(got.candidates[i-1] <= got.candidates[i], 'not sorted');
      }
      for(const s of got.candidates){
        assert.equal(s.length, c.in.pinLen);
      }
    }
  }
});

// ---- Oracle sweep -------------------------------------------------------
const S_SETS = [[1,2,3], [1,2,3,4], [0,5,9], [1,2,3,4,5,6]];
const MODES = ['allowed', 'must', 'partial'];

function wildVariants(S, n){
  const out = [null];
  // single fixed position
  if(S.length){
    const t = String(S[0]);
    const one = Array.from({length:n}, (_, i) => (i === Math.min(1, n-1)) ? t : '*');
    out.push(one);
  }
  // two fixed positions (different digits if available)
  if(S.length >= 2 && n >= 3){
    const t1 = String(S[0]), t2 = String(S[1]);
    const two = Array.from({length:n}, () => '*');
    two[0] = t1; two[n-1] = t2;
    out.push(two);
  }
  return out;
}

test('engine matches brute-force oracle across many cases', () => {
  let caseCount = 0;
  for(const S of S_SETS){
    for(let n = 1; n <= 5; n++){
      for(const mode of MODES){
        for(const allowDup of [true, false]){
          for(const wilds of wildVariants(S, n)){
            const input = {digits: S, pinLen: n, mode, allowDup, wilds};
            const expected = oracle(input);
            const got = computeCandidates(input);
            caseCount++;
            assert.equal(got.count, expected.count,
              `oracle count mismatch: S=${JSON.stringify(S)} n=${n} ` +
              `mode=${mode} dup=${allowDup} w=${JSON.stringify(wilds)}: ` +
              `got ${got.count}, oracle ${expected.count}`);
            if(got.candidates && got.candidates.length > 0){
              assert.deepEqual(got.candidates, expected.candidates,
                `oracle candidates mismatch: S=${JSON.stringify(S)} n=${n} mode=${mode} dup=${allowDup} w=${JSON.stringify(wilds)}`);
            }
          }
        }
      }
    }
  }
  // Record how many oracle cases ran (for the report).
  globalThis.__oracleCases = caseCount;
  assert.ok(caseCount >= 200, `only ${caseCount} oracle cases ran`);
});

// n=6 oracle sweep: keeps the brute-force search tractable by restricting the
// candidate set to |S| = 3 or 4 and only exercising allowed / must (partial
// stays at n <= 5). Wildcards: null and a single fixed digit.
test('engine matches oracle at n=6 for small S (allowed/must only)', () => {
  const SMALL_S = [[1,2,3], [1,2,3,4]];
  const SMALL_MODES = ['allowed', 'must'];
  let caseCount = 0;
  for(const S of SMALL_S){
    for(const mode of SMALL_MODES){
      for(const allowDup of [true, false]){
        const wildOptions = [null, Array.from({length:6}, (_, i) => (i === 2) ? String(S[0]) : '*')];
        for(const wilds of wildOptions){
          const input = {digits: S, pinLen: 6, mode, allowDup, wilds};
          const expected = oracle(input);
          const got = computeCandidates(input);
          caseCount++;
          assert.equal(got.count, expected.count,
            `n=6 oracle count mismatch: S=${JSON.stringify(S)} ` +
            `mode=${mode} dup=${allowDup} w=${JSON.stringify(wilds)}: ` +
            `got ${got.count}, oracle ${expected.count}`);
          if(got.candidates && got.candidates.length > 0){
            assert.deepEqual(got.candidates, expected.candidates,
              `n=6 oracle candidates mismatch: S=${JSON.stringify(S)} mode=${mode} dup=${allowDup} w=${JSON.stringify(wilds)}`);
          }
        }
      }
    }
  }
  globalThis.__oracleCases6 = caseCount;
  assert.ok(caseCount >= 16, `only ${caseCount} n=6 oracle cases ran`);
});

// ---- binom ---------------------------------------------------------------
test('binom covers edges and symmetry', () => {
  assert.equal(binom(0, 0), 1);
  assert.equal(binom(5, 0), 1);
  assert.equal(binom(5, 5), 1);
  assert.equal(binom(5, 6), 0);
  assert.equal(binom(5, -1), 0);
  assert.equal(binom(10, 3), 120);
  assert.equal(binom(10, 7), 120); // symmetry
  assert.equal(binom(20, 10), 184756);
});

// ---- parseWildcards -----------------------------------------------------
test('parseWildcards accepts valid tokens and rejects invalid', () => {
  assert.equal(parseWildcards('', 4), null);
  assert.equal(parseWildcards(null, 4), null);
  assert.equal(parseWildcards('*', 4), null);               // length mismatch
  assert.equal(parseWildcards('*,*,*', 4), null);
  assert.deepEqual(parseWildcards('*,*,2,*', 4), ['*','*','2','*']);
  assert.deepEqual(parseWildcards(' * , 1 , * , 9 ', 4), ['*','1','*','9']);
  assert.equal(parseWildcards('a,*,*,*', 4), null);        // invalid token
  assert.equal(parseWildcards('12,*,*,*', 4), null);       // multi-digit token
});

// ---- countPeaks ---------------------------------------------------------
test('countPeaks: synthetic 3 peaks, below threshold, empty', () => {
  // 1200 samples. With stride=200 that is 6 evaluation points.
  // Pattern (abs values): 0.5, 0.0, 0.4, 0.0, 0.6, 0.0 → 3 rises.
  const data = new Float32Array(1200);
  for(let i = 0; i < 1200; i++) data[i] = 0;
  data[0] = 0.5; data[400] = 0.4; data[800] = 0.6;
  assert.equal(countPeaks(data), 3);

  const quiet = new Float32Array(1000);
  for(let i = 0; i < 1000; i += 200) quiet[i] = 0.05;
  assert.equal(countPeaks(quiet), 0);

  assert.equal(countPeaks([]), 0);
  assert.equal(countPeaks(null), 0);
});

// ---- videoAccuracy ------------------------------------------------------
test('videoAccuracy boundary values', () => {
  assert.equal(videoAccuracy(0), 1);
  assert.equal(videoAccuracy(8), 1 - 8/50);
  assert.equal(videoAccuracy(25), 0.5);
  assert.equal(videoAccuracy(50), 0.5);
  assert.equal(videoAccuracy(100), 0.5);
});

// ---- thermalDecay -------------------------------------------------------
test('thermalDecay follows T0*exp(-t/tau)', () => {
  assert.equal(thermalDecay(40, 0), 40);
  const expected = 40 * Math.exp(-20 / 20);
  assert.ok(Math.abs(thermalDecay(40, 20) - expected) < 1e-9);
  assert.equal(thermalDecay(0, 10), 0);
  assert.equal(thermalDecay(-5, 10), 0);
});

// ---- generateCombinations ----------------------------------------------
test('generateCombinations enumerates lex-sorted and respects cap', () => {
  const out = generateCombinations(['1','2','3'], 2, 100);
  assert.deepEqual(out, ['11','12','13','21','22','23','31','32','33']);
  assert.equal(generateCombinations(['0','1','2','3','4','5','6','7','8','9'], 5, 100), null);
});

// ---- videoConfidence / radarScore (shoulder-surfing model) ---------------
test('VIDEO_ANGLE_PENALTY matches index.html options top=0 and tilt=30', () => {
  assert.equal(VIDEO_ANGLE_PENALTY.top, 0);
  assert.equal(VIDEO_ANGLE_PENALTY.tilt, 30);
});

test('videoConfidence boundary values', () => {
  assert.equal(videoConfidence({viewpoint:'top',  pixelErr:0}),  100);
  assert.equal(videoConfidence({viewpoint:'top',  pixelErr:8}),  88);     // 100-0-12
  assert.equal(videoConfidence({viewpoint:'top',  pixelErr:25}), 62.5);   // 100-0-37.5
  assert.equal(videoConfidence({viewpoint:'tilt', pixelErr:8}),  58);     // 100-30-12
  assert.equal(videoConfidence({viewpoint:'tilt', pixelErr:30}), 25);     // 100-30-45
  assert.equal(videoConfidence({viewpoint:'tilt', pixelErr:50}), 20);     // 100-30-50
  assert.equal(videoConfidence({viewpoint:'tilt', pixelErr:100}), 20);    // cap
  // 33.4 -> 100-0-50.1 clamped to penalty 50 -> 50
  assert.equal(videoConfidence({viewpoint:'top', pixelErr:33.4}), 50);
});

test('radarScore matches the README formula and clamps at 100', () => {
  assert.equal(radarScore(4, 88),  100);        // 4*15 + 88*0.5 = 104 -> 100
  assert.equal(radarScore(2, 62.5), 61.25);
  assert.equal(radarScore(4, 58),  89);
  assert.equal(radarScore(1, 25),  27.5);
  assert.equal(radarScore(0, 0),   0);
});

test('README 4 shoulder-surfing examples match the engine end-to-end', () => {
  const cases = [
    {viewpoint:'top',  pixelErr:8,  cands:4, expectConf:88,   expectScore:100},
    {viewpoint:'top',  pixelErr:25, cands:2, expectConf:62.5, expectScore:61.25},
    {viewpoint:'tilt', pixelErr:8,  cands:4, expectConf:58,   expectScore:89},
    {viewpoint:'tilt', pixelErr:30, cands:1, expectConf:25,   expectScore:27.5},
  ];
  for(const c of cases){
    const conf = videoConfidence({viewpoint:c.viewpoint, pixelErr:c.pixelErr});
    assert.equal(conf, c.expectConf,
      `confidence mismatch: ${JSON.stringify(c)} -> ${conf}`);
    const sc = radarScore(c.cands, conf);
    assert.equal(sc, c.expectScore,
      `score mismatch: ${JSON.stringify(c)} -> ${sc}`);
  }
});

// ---- methodScores -------------------------------------------------------
test('methodScores mirrors the simRun() calculation', () => {
  const results = {
    finger: ['1','2','3'],                                        // 3*15=45
    thermal: {candidates:['4','5'], orderConfidence:80},          // 2*12+40=64
    audio: 4,                                                     // 80
    video: {candidates:['1','2','3','4'], confidence:88},         // radar=100
  };
  const s = methodScores(results);
  assert.equal(s.finger, 45);
  assert.equal(s.thermal, 64);
  assert.equal(s.audio, 80);
  assert.equal(s.video, 100);
  const z = methodScores({});
  assert.deepEqual(z, {finger:0, thermal:0, audio:0, video:0});
});

// ---- rankPins -----------------------------------------------------------
test('rankPins uses RANK_WEIGHTS as documented', () => {
  // Weights must match the published scoring table.
  assert.equal(RANK_WEIGHTS.thermalOrder, 15);
  assert.equal(RANK_WEIGHTS.finger, 8);
  assert.equal(RANK_WEIGHTS.video, 10);
  assert.equal(RANK_WEIGHTS.allSame, -20);
  assert.equal(RANK_WEIGHTS.commonPin, -10);
});

test('rankPins scores "1221" by thermal-order +15, finger +8, video +10', () => {
  const results = {
    finger: ['1','2'],                                      // every digit in pin
    thermal: {candidates:['1','2','2','1'], orderConfidence:0},  // all 4 match in order
    video: {candidates:['1','2']},                          // every digit in pin
  };
  const [{pin, score}] = rankPins(['1221'], results);
  assert.equal(pin, '1221');
  // 4 pos * 15 (thermal order) + 4 digits * 8 (finger) + 4 digits * 10 (video) = 60+32+40=132
  assert.equal(score, 132);
});

test('rankPins penalizes 1111 (all-same) and 1234 (common)', () => {
  const scored = rankPins(['1111','1234','1235'], {});
  const by = Object.fromEntries(scored.map(x => [x.pin, x.score]));
  assert.equal(by['1111'], RANK_WEIGHTS.allSame);
  assert.equal(by['1234'], RANK_WEIGHTS.commonPin);
  assert.equal(by['1235'], 0);
});

// ---- hintLevel ----------------------------------------------------------
test('hintLevel thresholds at 60 and 30 (strict >)', () => {
  assert.equal(hintLevel({a:80, b:80, c:80, d:80}), 'high'); // 80 > 60
  assert.equal(hintLevel({a:60, b:60, c:60, d:60}), 'mid');  // not > 60, but > 30
  assert.equal(hintLevel({a:40, b:40, c:40, d:40}), 'mid');
  assert.equal(hintLevel({a:30, b:30, c:30, d:30}), 'low');  // not > 30
  assert.equal(hintLevel({a:0,  b:0,  c:0,  d:0}),  'low');
  assert.equal(hintLevel({}), 'low');
});
