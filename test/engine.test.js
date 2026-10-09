// Tests for pin-engine.js: direct expected values + exhaustive oracle sweep.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCandidates, parseWildcards, binom, countPeaks,
  videoAccuracy, thermalDecay, generateCombinations,
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
              `oracle count mismatch: S=${JSON.stringify(S)} n=${n} mode=${mode} dup=${allowDup} w=${JSON.stringify(wilds)}: got ${got.count}, oracle ${expected.count}`);
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
