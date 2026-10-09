// pin-engine.js
// Pure logic module for PIN Threat Simulator (no DOM access).
// Spec: see TECHNICAL.md / CLAUDE.md.

'use strict';

// Generation caps for exhaustive listing. Over the cap, only the count is returned.
export const ENUM_CAPS = {
  allowed: 5000,
  must: 5000,
  partial: 500,
};

// Audio peak detection defaults.
export const PEAK_DEFAULTS = { rise: 0.3, fall: 0.1, stride: 200 };

// Video (shoulder surfing) accuracy as a function of pixel error.
export function videoAccuracy(pixelErr){
  const err = Math.max(0, Number(pixelErr) || 0);
  return Math.max(0.5, 1 - err / 50);
}

// Thermal decay (exponential, tau=20s by default).
export function thermalDecay(initial, elapsed, tau = 20){
  const t0 = Math.max(0, Number(initial) || 0);
  const t = Math.max(0, Number(elapsed) || 0);
  return Math.max(0, t0 * Math.exp(-t / tau));
}

// Binomial coefficient (iterative, overflow-safe for small n).
export function binom(n, k){
  if(k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let res = 1;
  for(let i = 1; i <= k; i++){
    res = res * (n - (k - i)) / i;
  }
  return Math.round(res);
}

// Count audio peaks via dual-threshold crossing with a stride.
// `data` can be any array-like of numbers (e.g. Float32Array).
export function countPeaks(data, options = {}){
  if(!data || typeof data.length !== 'number' || data.length === 0) return 0;
  const rise = options.rise ?? PEAK_DEFAULTS.rise;
  const fall = options.fall ?? PEAK_DEFAULTS.fall;
  const stride = Math.max(1, options.stride ?? PEAK_DEFAULTS.stride);
  let peaks = 0;
  let inPeak = false;
  for(let i = 0; i < data.length; i += stride){
    const v = Math.abs(data[i]);
    if(!inPeak && v > rise){ peaks++; inPeak = true; }
    else if(inPeak && v < fall){ inPeak = false; }
  }
  return peaks;
}

// Parse wildcard string ("*" or a single digit per position, comma-separated).
// Returns a length-n array of tokens, or null if the input is empty / invalid.
export function parseWildcards(raw, pinLen){
  if(raw == null) return null;
  const s = String(raw).trim();
  if(!s) return null;
  const toks = s.split(',').map(t => t.trim());
  if(toks.length !== pinLen) return null;
  for(const t of toks){
    if(t === '*') continue;
    if(!/^[0-9]$/.test(t)) return null;
  }
  return toks;
}

// Produce the per-position alphabet given mode, candidate set S, and wildcards.
function perPositionDigits(mode, digitSet, wilds, pinLen){
  const universe = (mode === 'partial')
    ? ['0','1','2','3','4','5','6','7','8','9']
    : digitSet.slice();
  const result = [];
  for(let i = 0; i < pinLen; i++){
    const tok = wilds ? wilds[i] : '*';
    if(tok === '*' || tok == null){
      result.push({fixed: false, choices: universe});
    } else {
      // Fixed digit at position i. For 'allowed'/'must' it must be in S.
      if(mode !== 'partial' && !digitSet.includes(tok)){
        result.push({fixed: true, choices: [], impossible: true, token: tok});
      } else {
        result.push({fixed: true, choices: [tok], token: tok});
      }
    }
  }
  return {perPos: result, universe};
}

// Generate every n-tuple over `alphabet` in lexicographic order up to `cap`.
// Returns `null` when the search space would exceed `cap`.
export function generateCombinations(alphabet, n, cap){
  if(n === 0) return [''];
  if(Math.pow(alphabet.length, n) > cap) return null;
  const out = [];
  const buf = new Array(n);
  function rec(i){
    if(out.length > cap) return;
    if(i === n){ out.push(buf.join('')); return; }
    for(const d of alphabet){
      buf[i] = d;
      rec(i + 1);
      if(out.length > cap) return;
    }
  }
  rec(0);
  return out;
}

// Count ordered sequences over `alphabet` of length n that include every
// element of `required` at least once, using inclusion-exclusion.
function countWithRequired(alphabetSize, n, requiredCount){
  const k = requiredCount;
  const A = alphabetSize;
  let total = 0;
  for(let i = 0; i <= k; i++){
    const term = binom(k, i) * Math.pow(A - i, n);
    total += (i % 2 === 0) ? term : -term;
  }
  return total;
}

// Compute PIN candidates according to the three-mode spec.
// Input: {digits: number[], pinLen: number, mode: 'allowed'|'must'|'partial',
//         allowDup: boolean, wilds: string[]|null}
// Returns: {count: number, candidates: string[], steps: {key, params}[]}
// Steps are structured (key + params); the UI layer formats them.
export function computeCandidates({digits, pinLen, mode, allowDup, wilds}){
  const steps = [];
  const n = Math.max(0, Math.floor(pinLen));
  const digitSet = Array.from(new Set((digits || []).map(d => String(d))));

  steps.push({key: 'inputSet', params: {set: digitSet}});
  steps.push({key: 'mode', params: {mode, allowDup}});
  if(wilds && wilds.length === n){
    steps.push({key: 'wildcards', params: {wilds}});
  }

  const {perPos, universe} = perPositionDigits(mode, digitSet, wilds, n);

  // Early exits for impossible fixed digits.
  const badFixed = perPos.find(p => p.impossible);
  if(badFixed){
    steps.push({key: 'fixedNotInSet', params: {token: badFixed.token}});
    return {count: 0, candidates: [], steps};
  }

  // Indices of free (wildcard) and fixed positions.
  const freeIdx = [];
  const fixedTokens = [];
  for(let i = 0; i < n; i++){
    if(perPos[i].fixed) fixedTokens.push(perPos[i].token);
    else freeIdx.push(i);
  }
  const f = freeIdx.length;

  // Helper for exhaustive filtered enumeration (used when the free-space
  // size is tractable). Returns {count, candidates, listed}.
  function enumerateFiltered(freeAlphabet, predicate, cap){
    const spaceSize = Math.pow(freeAlphabet.length, f);
    if(spaceSize > cap){
      return {listed: false, candidates: [], tried: spaceSize};
    }
    const candidates = [];
    const buf = new Array(n);
    for(let i = 0; i < n; i++) if(perPos[i].fixed) buf[i] = perPos[i].token;
    function rec(j){
      if(j === f){
        if(predicate(buf)) candidates.push(buf.join(''));
        return;
      }
      const pos = freeIdx[j];
      for(const d of freeAlphabet){
        buf[pos] = d;
        rec(j + 1);
      }
    }
    rec(0);
    return {listed: true, candidates};
  }

  if(mode === 'allowed'){
    // Each free position: digitSet. Fixed: forced token (already in S).
    if(allowDup){
      const count = Math.pow(digitSet.length, f);
      steps.push({key: 'allowedDupCount', params: {A: digitSet.length, f, count}});
      const cap = ENUM_CAPS.allowed;
      let candidates = [];
      if(count <= cap){
        const {candidates: cand} = enumerateFiltered(digitSet, () => true, cap);
        candidates = cand.sort();
      }
      return {count, candidates, steps};
    }
    // No duplicates: all n digits must differ. Fixed digits also count as used.
    const fixedDup = new Set();
    for(const t of fixedTokens){
      if(fixedDup.has(t)){
        steps.push({key: 'fixedDup', params: {token: t}});
        return {count: 0, candidates: [], steps};
      }
      fixedDup.add(t);
    }
    const available = digitSet.filter(d => !fixedDup.has(d));
    if(available.length < f){
      steps.push({key: 'allowedNoDupShort', params: {A: digitSet.length, n}});
      return {count: 0, candidates: [], steps};
    }
    // Count: P(available.length, f) = ∏_{i=0..f-1}(available.length - i)
    let count = 1;
    for(let i = 0; i < f; i++) count *= (available.length - i);
    steps.push({key: 'allowedNoDupCount', params: {A: digitSet.length, f, count}});
    const cap = ENUM_CAPS.allowed;
    let candidates = [];
    if(count <= cap){
      const used = new Set(fixedTokens);
      const buf = new Array(n);
      for(let i = 0; i < n; i++) if(perPos[i].fixed) buf[i] = perPos[i].token;
      function rec(j){
        if(j === f){ candidates.push(buf.join('')); return; }
        const pos = freeIdx[j];
        for(const d of digitSet){
          if(used.has(d)) continue;
          used.add(d);
          buf[pos] = d;
          rec(j + 1);
          used.delete(d);
        }
      }
      rec(0);
      candidates.sort();
    }
    return {count, candidates, steps};
  }

  if(mode === 'must'){
    const A = digitSet.length;
    if(A === 0 || n < A){
      steps.push({key: 'mustImpossible', params: {A, n}});
      return {count: 0, candidates: [], steps};
    }
    if(!allowDup){
      // Each digit used at most once; all S must appear → n must equal A.
      if(n !== A){
        steps.push({key: 'mustNoDupLen', params: {A, n}});
        return {count: 0, candidates: [], steps};
      }
      // Fixed digits must be distinct and all in S.
      const used = new Set();
      for(const t of fixedTokens){
        if(used.has(t)){
          steps.push({key: 'fixedDup', params: {token: t}});
          return {count: 0, candidates: [], steps};
        }
        used.add(t);
      }
      const remaining = digitSet.filter(d => !used.has(d));
      // Permutations of `remaining` placed into free positions.
      let count = 1;
      for(let i = 1; i <= remaining.length; i++) count *= i;
      steps.push({key: 'mustNoDupCount', params: {A, n, count}});
      const cap = ENUM_CAPS.must;
      let candidates = [];
      if(count <= cap){
        const buf = new Array(n);
        for(let i = 0; i < n; i++) if(perPos[i].fixed) buf[i] = perPos[i].token;
        const inUse = new Set(fixedTokens);
        function rec(j){
          if(j === f){ candidates.push(buf.join('')); return; }
          const pos = freeIdx[j];
          for(const d of digitSet){
            if(inUse.has(d)) continue;
            inUse.add(d);
            buf[pos] = d;
            rec(j + 1);
            inUse.delete(d);
          }
        }
        rec(0);
        candidates.sort();
      }
      return {count, candidates, steps};
    }
    // allowDup = true. Fixed digits may cover some required ones.
    const fixedSet = new Set(fixedTokens);
    const remaining = digitSet.filter(d => !fixedSet.has(d));
    const kprime = remaining.length;
    // Count: number of length-f strings over digitSet that include every
    // element of `remaining` at least once.
    const count = countWithRequired(A, f, kprime);
    steps.push({key: 'mustDupCount', params: {A, f, kprime, count}});
    const cap = ENUM_CAPS.must;
    let candidates = [];
    if(count <= cap && count > 0){
      const result = enumerateFiltered(digitSet, (buf) => {
        const seen = new Set(buf);
        for(const r of remaining) if(!seen.has(r)) return false;
        return true;
      }, cap);
      if(result.listed) candidates = result.candidates.sort();
    }
    return {count, candidates, steps};
  }

  if(mode === 'partial'){
    const allDigits = ['0','1','2','3','4','5','6','7','8','9'];
    if(allowDup){
      const count = Math.pow(10, f);
      steps.push({key: 'partialDupCount', params: {f, count}});
      const cap = ENUM_CAPS.partial;
      let candidates = [];
      if(count <= cap){
        const {candidates: cand} = enumerateFiltered(allDigits, () => true, cap);
        candidates = cand.sort();
      }
      return {count, candidates, steps};
    }
    // No duplicates across all n positions (including fixed digits).
    const fixedDup = new Set();
    for(const t of fixedTokens){
      if(fixedDup.has(t)){
        steps.push({key: 'fixedDup', params: {token: t}});
        return {count: 0, candidates: [], steps};
      }
      fixedDup.add(t);
    }
    const avail = allDigits.filter(d => !fixedDup.has(d));
    if(avail.length < f){
      steps.push({key: 'partialNoDupShort', params: {n}});
      return {count: 0, candidates: [], steps};
    }
    let count = 1;
    for(let i = 0; i < f; i++) count *= (avail.length - i);
    steps.push({key: 'partialNoDupCount', params: {f, count}});
    const cap = ENUM_CAPS.partial;
    let candidates = [];
    if(count <= cap){
      const used = new Set(fixedTokens);
      const buf = new Array(n);
      for(let i = 0; i < n; i++) if(perPos[i].fixed) buf[i] = perPos[i].token;
      function rec(j){
        if(j === f){ candidates.push(buf.join('')); return; }
        const pos = freeIdx[j];
        for(const d of allDigits){
          if(used.has(d)) continue;
          used.add(d);
          buf[pos] = d;
          rec(j + 1);
          used.delete(d);
        }
      }
      rec(0);
      candidates.sort();
    }
    return {count, candidates, steps};
  }

  return {count: 0, candidates: [], steps: [{key: 'unknownMode', params: {mode}}]};
}
