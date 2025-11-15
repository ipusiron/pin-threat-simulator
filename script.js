// script.js for PIN Threat Simulator
// Educational tool for demonstrating PIN authentication vulnerabilities
// ⚠️ FOR EDUCATIONAL PURPOSES ONLY - DO NOT USE FOR MALICIOUS ACTIVITIES
// Author: ipusiron
// License: MIT
// Security: All processing is client-side, no data transmission to servers

'use strict';

document.addEventListener('DOMContentLoaded', ()=>{

  /* -----------------------
     Helpers / Utilities
     ----------------------- */
  // DOM selection shortcuts
  const el = id => document.getElementById(id); // Get element by ID
  const q = s => document.querySelector(s); // Query single element
  const qa = s => Array.from(document.querySelectorAll(s)); // Query all elements as array

  // Utility functions
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))} // Clamp value between min and max
  function range(n){return Array.from({length:n},(_,i)=>i)} // Generate array [0, 1, ..., n-1]

  // Toast notification system
  // Displays temporary notification messages with auto-dismiss after 3 seconds
  function showToast(message, type='info'){
    const toast = document.createElement('div');
    toast.className = 'toast';
    if(type) toast.classList.add(type);
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(()=>{
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(()=> toast.remove(), 300);
    }, 3000);
  }

  /* -----------------------
     Theme Management
     ----------------------- */
  // Dark/Light theme toggle with localStorage persistence
  const themeToggle = el('theme-toggle');
  const currentTheme = localStorage.getItem('theme') || 'dark'; // Default: dark theme
  document.documentElement.setAttribute('data-theme', currentTheme);
  themeToggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙'; // Icon shows opposite mode

  themeToggle.addEventListener('click', ()=>{
    const theme = document.documentElement.getAttribute('data-theme');
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme); // Persist choice
    themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';

    // Redraw random keypad canvas with new theme colors
    if(randKeypadInitialized && typeof drawKeypad === 'function'){
      drawKeypad(currentMapping);
    }
  });

  /* -----------------------
     Tab handling
     ----------------------- */
  // Main navigation tabs (PINパターン計算, 攻撃シミュレーション, セキュリティ解説)
  const tabButtons = qa('.tab');
  const tabsContainer = q('.tabs');

  /**
   * Update the animated underline indicator position
   * @param {HTMLElement} activeTab - The currently active tab button
   */
  function updateTabIndicator(activeTab){
    const tabsAfter = q('.tabs::after') || tabsContainer;
    const rect = activeTab.getBoundingClientRect();
    const containerRect = tabsContainer.getBoundingClientRect();
    const left = rect.left - containerRect.left;
    const width = rect.width;

    // Update CSS custom properties for smooth animation
    if(tabsContainer.style){
      tabsContainer.style.setProperty('--tab-indicator-left', left + 'px');
      tabsContainer.style.setProperty('--tab-indicator-width', width + 'px');
    }
  }

  tabButtons.forEach((btn, idx)=>{
    btn.addEventListener('click', ()=>{
      tabButtons.forEach(b=>{b.classList.remove('active');b.setAttribute('aria-selected','false')});
      btn.classList.add('active'); btn.setAttribute('aria-selected','true');
      updateTabIndicator(btn);

      const t = btn.dataset.tab;
      qa('.tab-panel').forEach(p=>p.classList.add('hidden'));
      el('tab-'+t).classList.remove('hidden');

      // Initialize radar chart when sim tab is opened
      if(t === 'sim'){
        initRadarChart();
        // Draw initial empty radar chart
        drawRadarChart({finger: 0, thermal: 0, audio: 0, video: 0});
      }

      // Initialize random keypad when security tab is opened
      if(t === 'sec'){
        setTimeout(()=>{
          if(!randKeypadInitialized){
            initRandomKeypad();
          } else {
            // Already initialized, just redraw
            drawKeypad(currentMapping);
          }
        }, 100);
      }
    });
  });

  // Initialize tab indicator on load
  const activeTab = q('.tab.active');
  if(activeTab) updateTabIndicator(activeTab);

  // Initialize random keypad if security tab is visible on page load
  setTimeout(()=>{
    const secTab = el('tab-sec');
    if(secTab && !secTab.classList.contains('hidden')){
      initRandomKeypad();
    }
  }, 200);

  /* -----------------------
     Radar chart for attack analysis
     ----------------------- */
  // Visualizes effectiveness of each attack method in integrated analysis panel
  const radarCanvas = el('radar-chart');
  let radarCtx, radarDims;

  /**
   * Initialize radar chart canvas with high DPI support
   */
  function initRadarChart(){
    if(!radarCanvas) return;

    // Get container dimensions
    const container = el('radar-chart-container');
    if(!container) return;

    const containerWidth = container.offsetWidth;
    const canvasSize = Math.min(containerWidth, 320);

    // Set canvas dimensions
    const dpr = window.devicePixelRatio || 1;
    radarCanvas.width = canvasSize * dpr;
    radarCanvas.height = canvasSize * dpr;
    radarCanvas.style.width = canvasSize + 'px';
    radarCanvas.style.height = canvasSize + 'px';

    // Get context and scale for high DPI
    radarCtx = radarCanvas.getContext('2d');
    radarCtx.scale(dpr, dpr);

    // Store dimensions
    radarDims = {
      dpr: dpr,
      displayWidth: canvasSize,
      displayHeight: canvasSize
    };
  }

  /**
   * Draw radar chart showing attack method effectiveness
   * @param {Object} scores - Attack scores: {finger, thermal, audio, video} each 0-100
   */
  function drawRadarChart(scores){
    // Always re-initialize to ensure proper sizing
    initRadarChart();
    if(!radarCtx || !radarDims) return;

    const w = radarDims.displayWidth;
    const h = radarDims.displayHeight;
    const cx = w/2, cy = h/2;
    const radius = Math.min(w,h) * 0.35;

    radarCtx.clearRect(0,0,w,h);

    // Draw background circles
    radarCtx.strokeStyle = 'rgba(99,102,241,0.15)';
    radarCtx.lineWidth = 1;
    for(let i=1; i<=5; i++){
      radarCtx.beginPath();
      radarCtx.arc(cx, cy, radius * i/5, 0, Math.PI*2);
      radarCtx.stroke();
    }

    // Draw axes
    const labels = ['指紋', '熱', '音響', '盗撮'];
    const values = [scores.finger, scores.thermal, scores.audio, scores.video];
    const angles = [0, Math.PI/2, Math.PI, Math.PI*3/2];

    radarCtx.strokeStyle = 'rgba(99,102,241,0.2)';
    radarCtx.fillStyle = '#9ca3af';
    radarCtx.font = '12px sans-serif';
    radarCtx.textAlign = 'center';
    radarCtx.textBaseline = 'middle';

    for(let i=0; i<4; i++){
      const angle = angles[i] - Math.PI/2; // rotate to start from top
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      radarCtx.beginPath();
      radarCtx.moveTo(cx, cy);
      radarCtx.lineTo(x, y);
      radarCtx.stroke();

      // Draw labels
      const labelX = cx + Math.cos(angle) * (radius + 20);
      const labelY = cy + Math.sin(angle) * (radius + 20);
      radarCtx.fillText(labels[i], labelX, labelY);
    }

    // Draw data polygon
    radarCtx.beginPath();
    for(let i=0; i<4; i++){
      const angle = angles[i] - Math.PI/2;
      const score = values[i] / 100;
      const x = cx + Math.cos(angle) * radius * score;
      const y = cy + Math.sin(angle) * radius * score;
      if(i===0) radarCtx.moveTo(x, y);
      else radarCtx.lineTo(x, y);
    }
    radarCtx.closePath();
    radarCtx.fillStyle = 'rgba(99,102,241,0.25)';
    radarCtx.fill();
    radarCtx.strokeStyle = 'rgba(99,102,241,0.8)';
    radarCtx.lineWidth = 2;
    radarCtx.stroke();

    // Draw data points
    radarCtx.fillStyle = '#6366f1';
    for(let i=0; i<4; i++){
      const angle = angles[i] - Math.PI/2;
      const score = values[i] / 100;
      const x = cx + Math.cos(angle) * radius * score;
      const y = cy + Math.sin(angle) * radius * score;
      radarCtx.beginPath();
      radarCtx.arc(x, y, 4, 0, Math.PI*2);
      radarCtx.fill();
    }
  }

  /* -----------------------
     Digit picker (calc tab)
     ----------------------- */
  const digitPick = el('digit-pick');
  for(let d=0; d<=9; d++){
    const b = document.createElement('button');
    b.type='button';
    b.className='digit';
    b.textContent = String(d);
    b.dataset.d = String(d);
    b.addEventListener('click', ()=> b.classList.toggle('on'));
    digitPick.appendChild(b);
  }

  /* -----------------------
     Keypad utilities
     ----------------------- */
  const fingerKeys = [
    {label:'1'}, {label:'2'}, {label:'3'},
    {label:'4'}, {label:'5'}, {label:'6'},
    {label:'7'}, {label:'8'}, {label:'9'},
    {label:'*'}, {label:'0'}, {label:'#'},
  ];

  function createKeypad(containerId, clickHandler){
    const container = el(containerId);
    const keys = [];
    fingerKeys.forEach((k,i)=>{
      const node = document.createElement('div');
      node.className = 'finger-key';
      node.dataset.idx = i;
      node.innerHTML = `<div class="label">${k.label}</div><div class="density">0</div>`;
      node._density = 0;
      node._temp = 0;
      node._label = k.label;
      node.addEventListener('click', ()=> clickHandler(node, i));
      container.appendChild(node);
      keys.push(node);
    });
    return keys;
  }

  /* -----------------------
     Finger grid (fingerprint analysis)
     ----------------------- */
  const fingerGridKeys = createKeypad('finger-grid', (node)=>{
    node._density = (node._density + 25) % 125;
    if(node._density>100) node._density=0;
    node.querySelector('.density').textContent = node._density;
    node.style.background = `linear-gradient(180deg, rgba(11,105,255,${node._density/200}), #fff)`;
  });

  /* -----------------------
     Thermal keypad (thermal analysis)
     ----------------------- */
  // Real-time thermal decay simulation with linear cooling (1°C/second)
  let thermalDecayInterval = null; // Interval ID for automatic decay
  let thermalStartTime = null; // Timestamp when input started

  /**
   * Thermal keypad: Click to increase temperature
   * Temperature increases by 10°C per click, max 40°C
   * Automatically starts real-time decay animation
   */
  const thermalKeypadKeys = createKeypad('thermal-keypad', (node)=>{
    // Add 10 degrees per click, max 40 degrees (realistic range)
    node._temp = Math.min((node._temp || 0) + 10, 40);
    baseTemps[parseInt(node.dataset.idx)] = node._temp;
    node.querySelector('.density').textContent = Math.round(node._temp);

    // Reset time slider to 0 and start real-time decay (1 degree/second)
    el('time-since').value = 0;
    el('time-since-value').textContent = '0s';
    thermalStartTime = Date.now();
    startThermalDecay();
    drawThermal(baseTemps);
  });

  el('clear-thermal').addEventListener('click', ()=>{
    stopThermalDecay();
    thermalKeypadKeys.forEach((n,i)=>{
      n._temp = 0;
      n.querySelector('.density').textContent = '0';
      baseTemps[i] = 0;
    });
    el('time-since').value = 0;
    el('time-since-value').textContent = '0s';
    drawThermal(baseTemps);
  });

  /**
   * Start real-time thermal decay animation
   * Temperature decreases by 1°C per second (linear cooling model)
   * Updates slider, keypad displays, and thermal canvas every second
   * Auto-stops after 60 seconds
   */
  function startThermalDecay(){
    stopThermalDecay(); // Clear any existing interval to prevent duplicates

    thermalDecayInterval = setInterval(()=>{
      const elapsed = Math.floor((Date.now() - thermalStartTime) / 1000); // Elapsed seconds
      if(elapsed > 60){
        stopThermalDecay(); // Auto-stop after 60 seconds
        return;
      }

      // Update time slider and display
      el('time-since').value = elapsed;
      el('time-since-value').textContent = elapsed + 's';

      // Calculate decayed temperatures: linear decay at 1°C/second
      const currentTemps = baseTemps.map(t => Math.max(0, t - elapsed));

      // Update temperature displays on keypad
      thermalKeypadKeys.forEach((node, i)=>{
        node.querySelector('.density').textContent = Math.round(currentTemps[i]);
      });

      // Update thermal heatmap canvas
      drawThermal(currentTemps);
    }, 1000); // Update every 1 second
  }

  /**
   * Stop the real-time thermal decay animation
   * Called when user manually adjusts slider or presses analyze button
   */
  function stopThermalDecay(){
    if(thermalDecayInterval){
      clearInterval(thermalDecayInterval);
      thermalDecayInterval = null;
    }
  }

  /* -----------------------
     Audio keypad (acoustic analysis)
     ----------------------- */
  let audioTapCount = 0;
  const audioKeypadKeys = createKeypad('audio-keypad', (node)=>{
    audioTapCount++;
    el('audio-tap-count').textContent = audioTapCount;
    node.style.background = `rgba(99,102,241,0.2)`;
    setTimeout(()=>{ node.style.background = ''; }, 200);
  });

  el('clear-audio').addEventListener('click', ()=>{
    audioTapCount = 0;
    el('audio-tap-count').textContent = '0';
  });

  /* -----------------------
     Video keypad (shoulder surfing)
     ----------------------- */
  let videoPinInput = [];
  const videoKeypadKeys = createKeypad('video-keypad', (node)=>{
    if(/\d/.test(node._label)){
      videoPinInput.push(node._label);
      el('video-pin-display').textContent = videoPinInput.join('');
      node.style.background = `rgba(99,102,241,0.2)`;
      setTimeout(()=>{ node.style.background = ''; }, 200);
    }
  });

  el('clear-video').addEventListener('click', ()=>{
    videoPinInput = [];
    el('video-pin-display').textContent = '****';
  });

  /* -----------------------
     Thermal canvas
     ----------------------- */
  const thermalCanvas = el('thermal-canvas');
  const tctx = thermalCanvas.getContext('2d');
  // High-DPI support
  function setupHighDPICanvas(canvas){
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return {dpr, displayWidth: rect.width, displayHeight: rect.height};
  }
  const thermalDims = setupHighDPICanvas(thermalCanvas);
  function drawThermal(fakeTemps){
    // fakeTemps: array of 12 numbers (0..100)
    tctx.clearRect(0,0,thermalDims.displayWidth,thermalDims.displayHeight);
    const w = thermalDims.displayWidth, h = thermalDims.displayHeight;
    // draw 3x4 grid
    const cols=3, rows=4;
    const cellW = w/cols, cellH = h/rows;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const idx = r*cols+c;
        const t = fakeTemps[idx] || 0;
        // map t (0..100) to color: blue->red (use simple interpolation)
        const hue = 240 - (t/100)*240; // 240 (blue) to 0 (red)
        tctx.fillStyle = `hsl(${hue} 90% ${50 - t/3}%)`;
        tctx.fillRect(c*cellW+4, r*cellH+4, cellW-8, cellH-8);
        tctx.fillStyle = '#fff';
        tctx.font = '14px monospace';
        tctx.fillText(String(Math.round(t)), c*cellW+12, r*cellH+22);
      }
    }
  }

  // generate initial temps (all 0)
  let baseTemps = Array.from({length:12},()=>0);
  drawThermal(baseTemps);

  el('time-since').addEventListener('input', (e)=>{
    const s = Number(e.target.value);
    el('time-since-value').textContent = s + 's';

    // Stop automatic decay when user manually adjusts slider
    stopThermalDecay();

    // Calculate decayed temps: 1 degree per second
    const currentTemps = baseTemps.map(t => Math.max(0, t - s));

    // Update keypad displays
    thermalKeypadKeys.forEach((node, i)=>{
      node.querySelector('.density').textContent = Math.round(currentTemps[i]);
    });

    // Update thermal canvas
    drawThermal(currentTemps);
  });

  // clicking thermal canvas randomize base temps (simulate recent input)
  thermalCanvas.addEventListener('click', ()=>{
    stopThermalDecay();
    baseTemps = Array.from({length:12},()=>Math.random() * 40);
    thermalKeypadKeys.forEach((node, i)=>{
      node._temp = baseTemps[i];
      node.querySelector('.density').textContent = Math.round(baseTemps[i]);
    });
    el('time-since').value = 0;
    el('time-since-value').textContent = '0s';
    thermalStartTime = Date.now();
    startThermalDecay();
    drawThermal(baseTemps);
  });

  /* -----------------------
     PIN Pattern Calculation
     ----------------------- */
  // Core combinatorics engine for computing PIN candidates
  // Implements three modes: allowed, must, partial

  /**
   * Get digits selected in the digit picker UI
   * @returns {number[]} Array of selected digit values (0-9)
   */
  function getSelectedDigits(){
    return qa('#digit-pick .digit.on').map(d=>d.dataset.d).map(s=>parseInt(s,10));
  }

  /**
   * Parse wildcard string into position-specific constraints
   * Format: comma-separated values where '*' represents any digit
   * Example: "1,*,3,*" for 4-digit PIN with positions 1 and 3 fixed
   * @param {string} input - Wildcard specification string
   * @param {number} pinLen - Expected PIN length
   * @returns {string[]|null} Array of per-position constraints, or null if invalid
   */
  function parseWildcards(input, pinLen){
    // User may provide comma separated tokens with '*' representing wildcard in that slot
    // If blank or not matching length, return null (no wildcards)
    if(!input || !input.trim()) return null;
    const tokens = input.split(',').map(t=>t.trim());
    if(tokens.length !== pinLen) return null;
    return tokens; // array of strings per position
  }

  /**
   * Compute PIN candidates using combinatorics and inclusion-exclusion principle
   * Core algorithm that powers the pattern calculation tab
   *
   * Modes:
   * - 'allowed': Only use specified digits (with/without duplicates)
   * - 'must': Must include ALL specified digits at least once (inclusion-exclusion)
   * - 'partial': Allow any digit 0-9 (wildcards specify constraints)
   *
   * @param {Object} params - Calculation parameters
   * @param {number[]} params.digits - Candidate digit set
   * @param {number} params.pinLen - PIN length
   * @param {string} params.mode - Calculation mode
   * @param {boolean} params.allowDup - Allow duplicate digits
   * @param {string[]|null} params.wilds - Per-position wildcard constraints
   * @returns {Object} {count: total combinations, candidates: array (truncated if large), steps: explanation text}
   */
  function computeCandidates({digits, pinLen, mode, allowDup, wilds}){
    // Returns {count, candidates (maybe truncated), steps}
    const steps = [];
    const digitSet = Array.from(new Set(digits.map(d=>String(d))));
    steps.push(`入力候補集合: { ${digitSet.join(', ')} }`);
    // build allowed set for 'allowed' and 'must' modes: candidate digits only come from digitSet
    // for 'partial' mode, allowed digits are 0-9
    const allDigits = Array.from({length:10},(_,i)=>String(i));
    let allowed = (mode === 'partial') ? allDigits : digitSet;
    steps.push(`モード: ${mode}. 使用可能桁集合 = { ${allowed.join(', ')} }`);

    // wildcards is array of tokens per position or null
    if(wilds && wilds.length===pinLen){
      steps.push(`ワイルドカード指定あり: ${wilds.join(',')}`);
    }

    // helper to compute Cartesian product count with per-position sets
    const perPosSets = [];
    for(let i=0;i<pinLen;i++){
      if(wilds && wilds[i] && wilds[i].includes('*')){
        // by default '*' means any allowed digit (0-9) when in partial mode, otherwise allowed set
        perPosSets.push( (mode==='partial') ? allDigits : allowed );
      } else {
        // normal: each pos can be any of allowed
        perPosSets.push( allowed );
      }
    }

    // simple case: allowed-mode with duplicates allowed and no must constraints
    if(mode === 'allowed' && allowDup){
      // count = (|allowed|)^pinLen but must consider wildcards already expand to same allowed sets
      let count = 1;
      perPosSets.forEach(s=> count *= s.length);
      steps.push(`単純計算: 各桁の選択肢数 = [${perPosSets.map(s=>s.length).join(', ')}] よって総数 = ${count}`);
      // generate candidates up to cap
      const cap = 5000;
      let candidates = [];
      if(count <= cap){
        // generate all via recursion
        function rec(i, cur){
          if(i===pinLen){ candidates.push(cur.join('')); return; }
          for(const d of perPosSets[i]) rec(i+1, cur.concat(d));
        }
        rec(0,[]);
      }
      return {count, candidates, steps};
    }

    // must-mode: candidate must include all digits from digitSet at least once (and other digits disallowed unless partial)
    if(mode === 'must'){
      // if duplicates allowed and allowed set length equals size of digitSet and pinLen==digitSet size and no wildcards -> permutations
      if(!allowDup && digitSet.length === pinLen && (!wilds || wilds.every(w=>!w))){
        // permutations of digitSet
        const permute = (arr)=>{
          if(arr.length<=1) return [arr];
          const out = [];
          for(let i=0;i<arr.length;i++){
            const rest = arr.slice(0,i).concat(arr.slice(i+1));
            for(const p of permute(rest)) out.push([arr[i]].concat(p));
          }
          return out;
        };
        const perms = permute(digitSet);
        const candidates = perms.map(p=>p.join(''));
        steps.push(`重複不可かつ各桁が一意で全数字を含むため順列を採用 (${perms.length})`);
        return {count: candidates.length, candidates, steps};
      }
      // general case use inclusion-exclusion over allowed alphabet (allowed is digitSet or others if partial)
      // We'll do inclusion-exclusion for the requirement "include every element of digitSet at least once"
      // Universe size = allowed^pinLen
      const alphabet = (mode==='partial') ? allDigits : digitSet;
      const A = alphabet.length;
      // if A < digitSet.length -> impossible
      if(A < digitSet.length){
        steps.push('可能な桁集合が不足しているため候補は0');
        return {count:0, candidates:[], steps};
      }
      // compute via inclusion-exclusion: number of sequences of length n over alphabet which include all k special items at least once
      const k = digitSet.length;
      const n = pinLen;
      // Use formula: sum_{i=0..k} (-1)^i * C(k,i) * (A - i)^n
      let total = 0;
      for(let i=0;i<=k;i++){
        const comb = binom(k,i);
        const term = comb * Math.pow(A - i, n);
        total += (i%2===0) ? term : -term;
      }
      steps.push(`包除原理で計算: A=${A}, k=${k}, n=${n} -> ${total}`);
      // If count reasonable, attempt to list via brute force with pruning
      const cap = 3000;
      let candidates = [];
      if(total <= cap){
        const alphabetArr = alphabet;
        function rec(i, cur, used){
          if(i===n){
            // check used contains all digitSet
            const usedSet = new Set(used);
            let ok = digitSet.every(d => usedSet.has(String(d)));
            if(ok) candidates.push(cur.join(''));
            return;
          }
          for(const d of alphabetArr){
            rec(i+1, cur.concat(d), used.concat(d));
          }
        }
        rec(0, [], []);
      }
      return {count: total, candidates, steps};
    }

    // partial mode: candidates are sequences of length n over 0-9, but we want to count those that include at least one of digitSet? or digitSet are just possible digits.
    // For simplicity, we'll return Universe size with note.
    if(mode === 'partial'){
      const n = pinLen;
      const count = Math.pow(10, n);
      steps.push(`partial mode: すべての0-9を許容 -> ${count} 通り (10^${n})`);
      const cap=500;
      let candidates=[];
      if(count<=cap){
        function rec(i, cur){
          if(i===n){ candidates.push(cur.join('')); return; }
          for(let d=0; d<10; d++) rec(i+1, cur.concat(String(d)));
        }
        rec(0,[]);
      }
      return {count, candidates, steps};
    }

    // fallback
    return {count:0,candidates:[],steps:['条件が複雑で計算不可（フォールバック）']};
  }

  /**
   * Calculate binomial coefficient C(n,k) = n! / (k!(n-k)!)
   * Used in inclusion-exclusion principle for 'must' mode calculations
   * Implements iterative formula to avoid factorial overflow: C(n,k) = ∏(i=1..k) [(n-k+i)/i]
   * @param {number} n - Total items
   * @param {number} k - Items to choose
   * @returns {number} Binomial coefficient (rounded to avoid floating-point errors)
   */
  function binom(n,k){
    if(k<0||k>n) return 0;
    k = Math.min(k, n-k); // Optimization: C(n,k) = C(n,n-k)
    let res = 1;
    for(let i=1;i<=k;i++){
      res = res * (n - (k - i)) / i; // Iterative multiplication and division to prevent overflow
    }
    return Math.round(res); // Round to handle floating-point precision issues
  }

  // UI binding for calc button
  el('calc-btn').addEventListener('click', ()=>{
    const digits = getSelectedDigits();
    const pinLen = Number(el('pin-length').value) || 4;
    const mode = el('mode').value;
    const allowDup = el('allow-dup').checked;
    const wildsRaw = el('wildcards').value.trim();
    const wilds = parseWildcardsOrNull(wildsRaw, pinLen);
    const maxList = 1000; // Fixed display limit
    const showSteps = el('show-steps').checked;

    const {count,candidates,steps} = computeCandidates({
      digits, pinLen, mode, allowDup, wilds
    });

    // Store full result for CSV export and steps
    window._calcResult = {count, candidates, steps};

    el('result-count').textContent = (count===0) ? '0' : String(count);
    el('result-length').textContent = String(pinLen);

    // Update steps display
    const stepsEl = el('calculation-steps');
    if(showSteps){
      // Create formatted display with proper line breaks
      stepsEl.innerHTML = '';
      steps.forEach((step, idx) => {
        const line = document.createElement('div');
        line.style.marginBottom = '6px';
        line.textContent = `${idx + 1}. ${step}`;
        stepsEl.appendChild(line);
      });
      stepsEl.style.display = 'block';
    } else {
      stepsEl.style.display = 'none';
    }
    const candEl = el('candidates');
    candEl.innerHTML = '';
    if(candidates && candidates.length>0){
      // If count <= 1000, show all candidates. Otherwise use maxList setting.
      const displayLimit = (count <= 1000) ? count : maxList;
      const list = candidates.slice(0, displayLimit);
      for(const c of list){
        const span = document.createElement('span');
        span.className='candidate';
        span.textContent = c;
        candEl.appendChild(span);
      }
      if(candidates.length>displayLimit){
        const more = document.createElement('div');
        more.style.marginTop = '12px';
        more.style.color = 'var(--muted)';
        more.textContent = `... 残り ${candidates.length - displayLimit} 件（全 ${count} 件）`;
        const note = document.createElement('div');
        note.style.fontSize = '13px';
        note.style.marginTop = '6px';
        note.textContent = '※ 全パターンはCSVエクスポートで確認できます';
        more.appendChild(note);
        candEl.appendChild(more);
      }
    } else {
      candEl.textContent = '(一覧は条件次第で省略されました)';
    }
  });

  el('clear-calc').addEventListener('click', ()=>{
    qa('#digit-pick .digit.on').forEach(d=>d.classList.remove('on'));
    el('pin-length').value = 4;
    el('wildcards').value = '';
    el('result-count').textContent = '—';
    el('candidates').innerHTML = '';
    el('calculation-steps').textContent = '';
    el('calculation-steps').style.display = 'none';
    window._calcResult = null;
  });

  el('use-from-sim').addEventListener('click', ()=>{
    if(!window._simResult || !window._simResult.candidates || window._simResult.candidates.length === 0){
      showToast('攻撃シミュレーションタブで解析を実行してください', 'warning');
      return;
    }

    const simCandidates = window._simResult.candidates;
    const simLength = window._simResult.length;

    // Update digit picker with simulation candidates
    qa('#digit-pick .digit').forEach(d=>{
      const val = d.dataset.d;
      if(simCandidates.includes(val)){
        d.classList.add('on');
      } else {
        d.classList.remove('on');
      }
    });

    // Update PIN length if available from audio analysis
    if(simLength){
      el('pin-length').value = simLength;
    }

    showToast('攻撃シミュレーション結果を反映しました', 'success');
  });

  // Show/hide calculation steps in real-time
  el('show-steps').addEventListener('change', (e)=>{
    const stepsEl = el('calculation-steps');
    if(e.target.checked){
      stepsEl.style.display = 'block';
      // If there's a cached result with steps, show them
      if(window._calcResult && window._calcResult.steps && window._calcResult.steps.length > 0){
        stepsEl.innerHTML = '';
        window._calcResult.steps.forEach((step, idx) => {
          const line = document.createElement('div');
          line.style.marginBottom = '6px';
          line.textContent = `${idx + 1}. ${step}`;
          stepsEl.appendChild(line);
        });
      } else if(!stepsEl.textContent.trim()){
        stepsEl.textContent = '計算を実行すると、ここに計算過程が表示されます。';
      }
    } else {
      stepsEl.style.display = 'none';
    }
  });

  // Initialize steps display
  el('calculation-steps').style.display = 'none';

  function parseWildcardsOrNull(raw, pinLen){
    if(!raw) return null;
    const toks = raw.split(',').map(t=>t.trim());
    if(toks.length !== pinLen) return null;
    return toks;
  }

  /* -----------------------
     Attack simulation: Individual analyzers
     ----------------------- */
  // Global storage for attack analysis results (shared across methods)
  window._attackResults = {
    finger: null,    // Array of detected digits from fingerprint analysis
    thermal: null,   // {candidates: string[], orderConfidence: number}
    audio: null,     // Number of detected keypress peaks (estimated PIN length)
    video: null      // {candidates: string[], confidence: number} from shoulder surfing
  };

  /**
   * Fingerprint Analysis
   * Simulates fingerprint residue detection on keypad
   * Detects digits where touch density exceeds threshold
   * User clicks keypad to set density values (0-100)
   */
  el('analyze-finger').addEventListener('click', ()=>{
    const threshold = Number(el('finger-threshold').value) || 30;
    const fingerNodes = qa('.finger-key');
    const candidates = [];
    fingerNodes.forEach((n,i)=>{
      if(n._density >= threshold){
        const label = fingerKeys[i].label;
        if(/\d/.test(label)) candidates.push(label);
      }
    });
    window._attackResults.finger = candidates;
    el('finger-result').innerHTML = `<strong>検出された数字:</strong> ${candidates.length ? candidates.join(', ') : '(なし)'}<br><small>閾値 ${threshold} 以上の濃度を持つキー</small>`;
    showToast('指紋解析完了', 'success');
  });

  el('clear-finger').addEventListener('click', ()=>{
    qa('.finger-key').forEach(n=>{
      n._density = 0;
      n.querySelector('.density').textContent = '0';
      n.style.background = '';
    });
    el('finger-result').innerHTML = '';
    window._attackResults.finger = null;
    showToast('指紋データをクリアしました');
  });

  /**
   * Thermal Analysis
   * Simulates thermal imaging detection of recently pressed keys
   * Uses linear cooling model: temp(t) = max(0, initial_temp - t) at 1°C/second
   * Sorts keys by temperature to estimate digit order (higher temp = more recent)
   * Order confidence calculated as ratio of hottest to second-hottest key
   */
  el('analyze-thermal').addEventListener('click', ()=>{
    // Stop real-time decay
    stopThermalDecay();

    // Use current elapsed time
    const timeS = Number(el('time-since').value);

    // Calculate current temperatures (1 degree per second decay)
    const thermalTemps = baseTemps.map(t => Math.max(0, t - timeS));

    const thermalPairs = thermalTemps.map((t,i)=>({i,t})).sort((a,b)=>b.t-a.t);
    const candidates = thermalPairs.filter(p=>p.t>3).slice(0,6).map(p=>fingerKeys[p.i].label).filter(lbl=>/\d/.test(lbl));
    const orderConfidence = Math.round((thermalPairs[0].t / (thermalPairs[1]?.t || thermalPairs[0].t || 1)) * 100);

    window._attackResults.thermal = {candidates, orderConfidence};
    el('thermal-result').innerHTML = `<strong>検出された数字:</strong> ${candidates.length ? candidates.join(', ') : '(なし)'}<br><strong>順序確度:</strong> ${orderConfidence}%<br><small>経過時間: ${timeS}秒、温度閾値 3℃以上</small>`;
    showToast('熱解析完了（減衰停止）', 'success');
  });

  /**
   * Acoustic Analysis
   * Estimates PIN length by counting keypress sounds
   * Two input methods:
   * 1. Audio file upload: Uses peak detection algorithm with threshold crossing
   * 2. Manual keypad input: Counts number of clicks
   * Peak detection: Scans amplitude with stride for performance, counts threshold crossings
   */
  el('analyze-audio').addEventListener('click', ()=>{
    const file = el('audio-file').files[0];

    if(file){
      // File-based analysis
      const reader = new FileReader();
      reader.onload = (e)=>{
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.decodeAudioData(e.target.result, (buf)=>{
          const data = buf.getChannelData(0);
          let peaks=0;
          let inPeak=false;
          const stride=200;
          for(let i=0;i<data.length;i+=stride){
            const val = Math.abs(data[i]);
            if(!inPeak && val>0.3){ peaks++; inPeak=true; }
            if(inPeak && val<0.1){ inPeak=false; }
          }
          window._attackResults.audio = peaks;
          window.audioPeakCount = peaks;
          el('audio-result').innerHTML = `<strong>検出ピーク数:</strong> ${peaks}<br><strong>推定PIN桁数:</strong> ${peaks}<br><small>音声ファイルから検出</small>`;
          showToast('音響解析完了', 'success');
        }, ()=>{ showToast('音声ファイルの解析に失敗しました', 'error'); });
      };
      reader.readAsArrayBuffer(file);
    } else if(audioTapCount > 0){
      // Keypad-based analysis
      window._attackResults.audio = audioTapCount;
      window.audioPeakCount = audioTapCount;
      el('audio-result').innerHTML = `<strong>検出打鍵回数:</strong> ${audioTapCount}<br><strong>推定PIN桁数:</strong> ${audioTapCount}<br><small>テンキー入力から検出</small>`;
      showToast('音響解析完了', 'success');
    } else {
      showToast('テンキーでPINを入力するか、音声ファイルを選択してください', 'warning');
    }
  });

  /**
   * Shoulder Surfing Simulation
   * Simulates video surveillance of PIN entry
   * User enters PIN on keypad, then simulates detection with angle/error parameters
   * Detection accuracy degrades based on:
   * - Viewing angle: 'top' (better) vs 'tilt' (worse)
   * - Pixel error: Higher values reduce detected digit count
   */
  el('analyze-video').addEventListener('click', ()=>{
    if(videoPinInput.length === 0){
      showToast('テンキーでPINを入力してください', 'warning');
      return;
    }

    const pixelErr = Number(el('pixel-error').value) || 8;
    const videoAngle = el('video-angle').value;

    // Use actual input digits as base
    let candidates = Array.from(new Set(videoPinInput));

    // Calculate confidence based on viewing angle and pixel error
    let confidence = 100;

    // Angle penalty: tilt reduces confidence by 30%
    if(videoAngle === 'tilt'){
      confidence -= 30;
      // Tilted view: lower accuracy, might miss some digits
      const accuracy = Math.max(0.5, 1 - pixelErr/50);
      const detectedCount = Math.ceil(candidates.length * accuracy);
      candidates = candidates.slice(0, detectedCount);
    }

    // Pixel error penalty: 0-50px range, higher error reduces confidence
    const errorPenalty = Math.min(50, pixelErr * 1.5);
    confidence -= errorPenalty;

    if(pixelErr > 20){
      // High error: significantly reduced accuracy
      candidates = candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 2)));
    }

    confidence = Math.max(0, Math.min(100, confidence));

    window._attackResults.video = {candidates, confidence};
    el('video-result').innerHTML = `<strong>入力PIN:</strong> ${videoPinInput.join('')}<br><strong>検出された数字:</strong> ${candidates.join(', ')}<br><strong>視点:</strong> ${videoAngle === 'top' ? '真上' : '斜め'}<br><strong>誤差:</strong> ${pixelErr}px<br><strong>信頼度:</strong> ${confidence.toFixed(0)}%`;
    showToast('盗撮解析完了', 'success');
  });

  /* -----------------------
     Integrate all attack results
     ----------------------- */
  /**
   * Master function that integrates all attack method results
   * Combines fingerprint, thermal, audio, and video analysis
   * Generates:
   * - Union of all detected digits (candidate set)
   * - Attack effectiveness scores (0-100 per method)
   * - Radar chart visualization
   * - Expert security hints based on risk assessment
   * - PIN ranking using combined scoring algorithm
   */
  function simRun(){
    const results = window._attackResults;
    const allCandidates = [];

    if(results.finger) allCandidates.push(...results.finger);
    if(results.thermal) allCandidates.push(...results.thermal.candidates);
    if(results.video) allCandidates.push(...results.video.candidates);

    const union = Array.from(new Set(allCandidates.filter(Boolean)));
    const estimatedLength = results.audio || Number(el('pin-length').value) || 4;
    const thermalOrderConfidence = results.thermal?.orderConfidence || 0;

    // Calculate attack effectiveness scores
    const scores = {
      finger: results.finger ? Math.min(100, results.finger.length * 15) : 0,
      thermal: results.thermal ? Math.min(100, results.thermal.candidates.length * 12 + thermalOrderConfidence/2) : 0,
      audio: results.audio ? Math.min(100, 80) : 0,
      video: results.video ? Math.min(100, results.video.candidates.length * 15 + results.video.confidence * 0.5) : 0
    };

    // Draw radar chart
    drawRadarChart(scores);

    // Generate expert hints
    const hints = generateExpertHints(results, scores, union, estimatedLength);
    el('expert-hints').innerHTML = hints;

    // Generate PIN ranking
    const ranking = generatePINRanking(union, estimatedLength, results);
    console.log('[DEBUG] PIN Ranking:', {union, estimatedLength, rankingLength: ranking.length, ranking});
    displayPINRanking(ranking);

    // Update summary
    el('sim-candidates').textContent = union.length ? union.join(', ') : '(なし)';
    el('sim-length').textContent = String(estimatedLength);
    el('sim-order-confidence').textContent = thermalOrderConfidence ? (thermalOrderConfidence + '%') : '—';

    window._simResult = {
      candidates: union.map(s=>String(s)),
      length: estimatedLength,
      orderConfidence: thermalOrderConfidence,
      scores: scores,
      ranking: ranking
    };
    showToast('全手法を統合しました', 'success');
  }

  /**
   * Generate expert security recommendations based on attack analysis
   * Evaluates overall risk level and provides method-specific countermeasures
   * @param {Object} results - Raw attack results from all methods
   * @param {Object} scores - Effectiveness scores (0-100 per method)
   * @param {string[]} candidates - Detected digit candidates
   * @param {number} length - Estimated PIN length
   * @returns {string} HTML-formatted hints with risk assessment and recommendations
   */
  function generateExpertHints(results, scores, candidates, length){
    const hints = [];

    // Overall assessment
    const totalScore = Object.values(scores).reduce((a,b)=>a+b, 0) / 4;
    if(totalScore > 60){
      hints.push('⚠️ <strong>高リスク:</strong> 複数の攻撃手法から有効な情報が得られています。PIN認証の脆弱性が深刻です。');
    } else if(totalScore > 30){
      hints.push('⚡ <strong>中リスク:</strong> いくつかの攻撃手法が有効でした。追加の防御策を検討してください。');
    } else {
      hints.push('✓ <strong>低リスク:</strong> 現在の攻撃手法では限定的な情報しか得られていません。');
    }

    // Specific method recommendations
    if(scores.finger > 50){
      hints.push('🔍 <strong>指紋対策:</strong> 入力後は画面を清掃し、疎油性コーティングの使用を推奨します。');
    }
    if(scores.thermal > 50){
      hints.push('🌡️ <strong>熱対策:</strong> 熱検出を防ぐため、ダミー入力やランダムキーへのタッチを検討してください。');
    }
    if(scores.audio > 0){
      hints.push('🔊 <strong>音響対策:</strong> 静音キーパッドの使用、または環境音を活用した音響カモフラージュが有効です。');
    }
    if(scores.video > 50){
      hints.push('📹 <strong>盗撮対策:</strong> 入力時は手で覆う、画面に視覚的な障壁を設置することを推奨します。');
    }

    // Candidate space analysis
    if(candidates.length <= 4 && length === 4){
      hints.push('🎯 <strong>危険:</strong> 候補数字が' + candidates.length + '個のみ。' + Math.pow(candidates.length, length) + '通りの総当たり攻撃が現実的です。');
    } else if(candidates.length <= 6){
      hints.push('⚠️ 候補数字が絞り込まれています（' + candidates.length + '個）。組み合わせ数を増やす対策が必要です。');
    }

    return hints.join('<br><br>');
  }

  /**
   * Generate ranked list of most likely PINs based on attack results
   * Scoring algorithm:
   * - Thermal order match: +15 points per position (high weight for sequence data)
   * - Fingerprint detection: +8 points per digit (presence indicator)
   * - Video detection: +10 points per digit (visual confirmation)
   * - Common pattern penalty: -20 for repeating digits, -10 for 1234/0000
   * @param {string[]} candidates - Pool of detected digits
   * @param {number} length - Target PIN length
   * @param {Object} results - Attack method results
   * @returns {Object[]} Top 10 PINs sorted by score: [{pin: string, score: number}, ...]
   */
  function generatePINRanking(candidates, length, results){
    if(candidates.length === 0 || length === 0) return [];

    // Generate possible PINs (limit to reasonable number)
    const maxGenerate = 100;
    let pins = [];

    function generateCombinations(arr, len, prefix=''){
      if(prefix.length === len){
        pins.push(prefix);
        return;
      }
      if(pins.length >= maxGenerate) return;
      for(const d of arr){
        generateCombinations(arr, len, prefix + String(d));
        if(pins.length >= maxGenerate) break;
      }
    }

    generateCombinations(candidates, length);
    console.log('[DEBUG] Generated PINs:', {candidates, length, pinsGenerated: pins.length, samplePins: pins.slice(0, 5)});

    // Score each PIN based on attack results
    const scored = pins.map(pin => {
      let score = 0;

      // Thermal order preference (recently pressed keys)
      if(results.thermal && results.thermal.candidates){
        const thermalOrder = results.thermal.candidates;
        for(let i=0; i<Math.min(pin.length, thermalOrder.length); i++){
          if(pin[i] === thermalOrder[i]) score += 15;
        }
      }

      // Fingerprint intensity (more likely if high density)
      if(results.finger){
        const fingerSet = new Set(results.finger);
        for(const d of pin){
          if(fingerSet.has(d)) score += 8;
        }
      }

      // Video detection (exact matches)
      if(results.video && results.video.candidates){
        const videoSet = new Set(results.video.candidates);
        for(const d of pin){
          if(videoSet.has(d)) score += 10;
        }
      }

      // Penalize common patterns
      if(/^(\d)\1+$/.test(pin)) score -= 20; // All same digit
      if(pin === '1234' || pin === '0000') score -= 10; // Common PINs

      return {pin, score};
    });

    // Sort by score descending and return top 10
    return scored.sort((a,b) => b.score - a.score).slice(0, 10);
  }

  function displayPINRanking(ranking){
    const container = el('pin-ranking');
    console.log('[DEBUG] displayPINRanking called:', {container, ranking});

    if(!container){
      console.error('[ERROR] pin-ranking container not found!');
      return;
    }

    if(!ranking || ranking.length === 0){
      container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px">候補数字を解析後、ランキングが表示されます</div>';
      return;
    }

    container.innerHTML = '';
    ranking.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'pin-rank-item';
      div.innerHTML = `
        <div class="pin-rank-number">${idx + 1}</div>
        <div class="pin-rank-value">${item.pin}</div>
        <div class="pin-rank-score">${item.score}pt</div>
      `;
      container.appendChild(div);
    });
    console.log('[DEBUG] Ranking displayed, container children:', container.children.length);
  }

  el('run-sim').addEventListener('click', simRun);

  el('push-to-calc').addEventListener('click', ()=>{
    if(!window._simResult) { showToast('先に「シミュレーション実行」を押してください', 'warning'); return; }
    const arr = window._simResult.candidates;
    // set digit pick accordingly
    qa('#digit-pick .digit').forEach(d=>{
      const val = d.dataset.d;
      if(arr.includes(val)) d.classList.add('on'); else d.classList.remove('on');
    });
    // set pin length if audio provided
    el('pin-length').value = window._simResult.length || el('pin-length').value;
    // switch to calc tab
    qa('.tab').forEach(b=>b.classList.remove('active'));
    const calcBtn = qa('.tab').find(b=>b.dataset.tab==='calc');
    if(calcBtn){ calcBtn.classList.add('active'); }
    qa('.tab-panel').forEach(p=>p.classList.add('hidden'));
    el('tab-calc').classList.remove('hidden');
  });

  /* -----------------------
     Audio analysis (simple peak detection)
     ----------------------- */
  el('analyze-audio').addEventListener('click', async ()=>{
    const f = el('audio-file').files[0];
    if(!f){ showToast('音声ファイルを選択してください', 'warning'); return; }
    const arr = await f.arrayBuffer();
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await ac.decodeAudioData(arr.slice(0));
      const channelData = buf.getChannelData(0);
      // simple peak count: count number of times amplitude crosses threshold from below
      let peaks = 0;
      const threshold = 0.15;
      let above = false;
      for(let i=0;i<channelData.length;i+=200){ // sample step to reduce compute
        const s = Math.abs(channelData[i]);
        if(!above && s > threshold){ peaks++; above = true; }
        if(above && s < threshold) above = false;
      }
      window.audioPeakCount = peaks;
      el('audio-result').textContent = `${peaks} peaks detected (推定桁数: ${peaks||'—'})`;
    } catch(e){
      console.error(e);
      showToast('音声解析でエラーが発生しました（ブラウザー対応の可能性あり）', 'error');
    }
  });

  /* -----------------------
     Random keypad drawing (security tab)
     ----------------------- */
  // Demonstrates randomized keypad layout defense strategy
  // Uses Fisher-Yates shuffle to randomize digit positions
  // Renders on high-DPI canvas with theme-aware colors
  // Includes "hand cover mode" that masks input after brief display

  const randCanvas = el('random-keypad');
  let randDims, rctx;
  let randKeypadInitialized = false; // Flag to prevent re-initialization and infinite recursion
  let currentMapping = ['1','2','3','4','5','6','7','8','9','*','0','#']; // Current keypad layout
  let handCoverInput = []; // Stores actual PIN input for hand cover mode
  let handCoverMode = false; // Whether hand cover mode is enabled
  let handCoverStartIndex = 0; // Index from which to start masking when mode is turned on
  let maskedIndices = new Set(); // Set of indices that have been permanently masked

  /**
   * Initialize random keypad canvas with retry logic
   * Canvas may not have dimensions immediately after tab switch
   * Retries up to 10 times with 50ms delay between attempts
   * CRITICAL: Sets randKeypadInitialized flag BEFORE calling drawKeypad to prevent recursion
   * @param {number} retries - Current retry count (default 0)
   */
  function initRandomKeypad(retries = 0){
    if(randKeypadInitialized) return;

    // Ensure canvas has proper dimensions
    if(!randCanvas || randCanvas.offsetWidth === 0){
      if(retries < 10){
        setTimeout(()=> initRandomKeypad(retries + 1), 50);
      }
      return;
    }

    randDims = setupHighDPICanvas(randCanvas);
    rctx = randCanvas.getContext('2d');
    rctx.scale(randDims.dpr, randDims.dpr);
    randKeypadInitialized = true;  // Set flag BEFORE calling drawKeypad
    drawKeypad(currentMapping);
  }

  /**
   * Draw keypad with specified digit mapping on canvas
   * Renders 3×4 grid with gradient backgrounds matching other keypads
   * Theme-aware: adapts colors based on data-theme attribute
   * Interactive: handles click events for hand cover mode
   * @param {string[]} mapping - Array of 12 labels in grid order (top-left to bottom-right)
   */
  function drawKeypad(mapping){
    if(!randKeypadInitialized) return; // Safety check: prevents drawing before initialization

    const cols = 3, rows = 4;
    const w = randDims.displayWidth, h = randDims.displayHeight;
    const cellW = w/cols, cellH = h/rows;

    // Clear canvas
    rctx.clearRect(0,0,w,h);

    // Get current theme
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const idx = r*cols + c;
        const x = c*cellW, y = r*cellH;
        const lab = mapping[idx] || '';

        // Draw cell background (matching .finger-key style)
        const gradient = rctx.createLinearGradient(x+4, y+4, x+cellW-4, y+cellH-4);
        if(isDark){
          gradient.addColorStop(0, 'rgba(20,27,45,0.6)');
          gradient.addColorStop(1, 'rgba(30,37,55,0.6)');
        } else {
          gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
          gradient.addColorStop(1, 'rgba(248,250,255,0.8)');
        }
        rctx.fillStyle = gradient;
        rctx.fillRect(x+4, y+4, cellW-8, cellH-8);

        // Draw border
        rctx.strokeStyle = isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.25)';
        rctx.lineWidth = 1;
        rctx.strokeRect(x+4, y+4, cellW-8, cellH-8);

        // Draw label
        rctx.fillStyle = isDark ? '#e5e7eb' : '#1e293b';
        rctx.font = 'bold 18px sans-serif';
        rctx.textAlign = 'center';
        rctx.textBaseline = 'middle';
        rctx.fillText(lab, x + cellW/2, y + cellH/2);
      }
    }
  }

  /**
   * Handle keypad click for input (works with or without hand cover mode)
   * Shows clicked digit briefly if hand cover mode is enabled, otherwise shows normally
   * @param {MouseEvent} e - Click event on canvas
   */
  function handleKeypadClick(e){
    if(!randKeypadInitialized) return;

    const rect = randCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cols = 3, rows = 4;
    const cellW = randDims.displayWidth / cols;
    const cellH = randDims.displayHeight / rows;

    const col = Math.floor(x / cellW);
    const row = Math.floor(y / cellH);
    const idx = row * cols + col;

    if(idx >= 0 && idx < 12){
      const digit = currentMapping[idx];

      // Only add numeric digits (not * or #)
      if(/\d/.test(digit)){
        handCoverInput.push(digit);

        // Show differently based on hand cover mode
        if(handCoverMode){
          updateHandCoverDisplay(true, digit); // Show briefly then mask
        } else {
          updateHandCoverDisplay(false, digit); // Show normally
        }

        // Flash the clicked key on canvas
        flashKey(col, row);
      }
    }
  }

  /**
   * Flash animation for clicked key
   * Briefly highlights the key to provide visual feedback
   * @param {number} col - Column index (0-2)
   * @param {number} row - Row index (0-3)
   */
  function flashKey(col, row){
    const cellW = randDims.displayWidth / 3;
    const cellH = randDims.displayHeight / 4;
    const x = col * cellW;
    const y = row * cellH;

    // Highlight
    rctx.fillStyle = 'rgba(99,102,241,0.3)';
    rctx.fillRect(x+4, y+4, cellW-8, cellH-8);

    // Restore after 200ms
    setTimeout(()=> drawKeypad(currentMapping), 200);
  }

  /**
   * Update hand cover input display
   * Shows digit briefly (300ms) then replaces with asterisk if in hand cover mode
   * Once masked, digits stay masked even if mode is turned off (permanent masking)
   * @param {boolean} showBriefly - Whether to show the digit temporarily (hand cover mode)
   * @param {string} digit - The digit to display
   */
  function updateHandCoverDisplay(showBriefly, digit){
    const displayEl = el('hand-cover-input');

    if(showBriefly && digit){
      // Hand cover mode: Show current digit briefly, then mask it permanently
      const currentIndex = handCoverInput.length - 1;

      // Build display: show each digit unless it's in maskedIndices
      let display = '';
      for(let i = 0; i < handCoverInput.length; i++){
        if(maskedIndices.has(i)){
          display += '*';
        } else if(i === currentIndex){
          display += digit; // Show current digit briefly
        } else {
          display += handCoverInput[i];
        }
      }
      displayEl.textContent = display || '';

      // After 300ms, permanently mask the new digit
      setTimeout(()=>{
        maskedIndices.add(currentIndex); // Mark as permanently masked

        // Rebuild display with the new masked digit
        let display = '';
        for(let i = 0; i < handCoverInput.length; i++){
          if(maskedIndices.has(i)){
            display += '*';
          } else {
            display += handCoverInput[i];
          }
        }
        displayEl.textContent = display || '';
      }, 300);
    } else {
      // Normal mode: Show digits, but keep previously masked digits as asterisks
      let display = '';
      for(let i = 0; i < handCoverInput.length; i++){
        if(maskedIndices.has(i)){
          display += '*';
        } else {
          display += handCoverInput[i];
        }
      }
      displayEl.textContent = display || '';
    }
  }
  /**
   * Generate keypad digit mapping
   * @param {boolean} randomize - If true, shuffle digits using Fisher-Yates algorithm
   * @returns {string[]} Array of 12 digit labels in grid order
   */
  function generateMapping(randomize=true){
    const digits = ['1','2','3','4','5','6','7','8','9','*','0','#'];
    if(randomize) {
      // Fisher-Yates shuffle: iterate backwards, swap with random earlier position
      for(let i=digits.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [digits[i],digits[j]] = [digits[j],digits[i]]; // ES6 destructuring swap
      }
    }
    return digits;
  }

  el('shuffle-keypad').addEventListener('click', ()=>{
    initRandomKeypad();
    currentMapping = generateMapping(true);
    drawKeypad(currentMapping);
  });
  el('reset-keypad').addEventListener('click', ()=>{
    initRandomKeypad();
    currentMapping = generateMapping(false);
    drawKeypad(currentMapping);
  });

  // Hand cover mode toggle
  el('hand-cover-mode').addEventListener('change', (e)=>{
    handCoverMode = e.target.checked;
    if(handCoverMode){
      // Record current input length - only mask digits entered AFTER this point
      handCoverStartIndex = handCoverInput.length;
      // Keep existing input visible (already entered before mode was turned on)
      showToast('手で隠すモードON: これ以降の入力がマスクされます', 'info');
    } else {
      // When turning off, masked digits stay masked (permanent effect)
      showToast('手で隠すモードOFF: マスク済みの数字はそのまま', 'info');
    }
  });

  // Canvas click handler for hand cover mode
  randCanvas.addEventListener('click', handleKeypadClick);

  // Clear hand cover input
  el('clear-hand-input').addEventListener('click', ()=>{
    handCoverInput = [];
    handCoverStartIndex = 0; // Reset masking start index
    maskedIndices.clear(); // Clear all masked indices
    updateHandCoverDisplay(false);
    showToast('入力をクリアしました');
  });

  /* -----------------------
     Export / Import / Utilities
     ----------------------- */
  // Data export functions for saving analysis results
  // Includes timestamp generation and secure blob download

  /**
   * Export full session data as JSON
   * Includes calculation settings and simulation results
   */
  el('download-json').addEventListener('click', ()=>{
    const payload = collectSession();
    const filename = `pin-threat-sim-session_${getTimestamp()}.json`;
    downloadBlob(JSON.stringify(payload, null, 2), filename, 'application/json');
    showToast('セッションデータをエクスポートしました', 'success');
  });
  el('download-csv').addEventListener('click', ()=>{
    // Export all candidates from calculation result
    if(!window._calcResult || !window._calcResult.candidates || window._calcResult.candidates.length === 0){
      showToast('エクスポートする候補がありません', 'warning');
      return;
    }
    const allCandidates = window._calcResult.candidates;
    const csv = 'candidate\n' + allCandidates.join('\n');
    const filename = `candidates_${getTimestamp()}.csv`;
    downloadBlob(csv, filename, 'text/csv');
    showToast(`候補リストをCSVでエクスポートしました（全 ${allCandidates.length} 件）`, 'success');
  });

  el('export-sim').addEventListener('click', ()=>{
    if(!window._simResult){ showToast('先にシミュレーション実行してください', 'warning'); return; }
    const filename = `sim-result_${getTimestamp()}.json`;
    downloadBlob(JSON.stringify(window._simResult,null,2), filename, 'application/json');
    showToast('シミュレーション結果をエクスポートしました', 'success');
  });

  /**
   * Collect current session data for export
   * @returns {Object} Session snapshot with timestamp, calc settings, and sim results
   */
  function collectSession(){
    return {
      timestamp: new Date().toISOString(),
      calc: {
        selectedDigits: getSelectedDigits(),
        pinLength: Number(el('pin-length').value),
        mode: el('mode').value
      },
      sim: window._simResult || null
    };
  }

  /**
   * Generate filename-safe timestamp string
   * Format: YYYYMMDD_HHMMSS (e.g., 20250103_143052)
   * @returns {string} Timestamp string for file naming
   */
  function getTimestamp(){
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth()+1).padStart(2,'0');
    const DD = String(now.getDate()).padStart(2,'0');
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const ss = String(now.getSeconds()).padStart(2,'0');
    return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
  }

  /**
   * Trigger file download from string data
   * Security: Sanitizes filename, prevents window.opener access, cleans up blob URL
   * @param {string} data - File content
   * @param {string} filename - Desired filename (will be sanitized)
   * @param {string} type - MIME type (e.g., 'application/json', 'text/csv')
   */
  function downloadBlob(data, filename, type){
    // Sanitize filename to prevent directory traversal and invalid characters
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    const blob = new Blob([data], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFilename;
    a.rel = 'noopener noreferrer'; // Security: prevent window.opener access in new tab
    document.body.appendChild(a);
    a.click();
    // Cleanup: revoke blob URL and remove anchor element after download
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 500);
  }


  /* -----------------------
     Simple page helpers
     ----------------------- */
  // polyfill for qa find convenience
  if(!Array.prototype.find){
    Array.prototype.find = function(cb){ for(const v of this){ if(cb(v)) return v; } return undefined; };
  }

  // initialize default
  el('finger-threshold').value = 30;
  // initial sim run to populate nothing
  window._simResult = {candidates:[], length:4, orderConfidence:0};
});
