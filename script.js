// script.js for PIN Threat Simulator
// Educational tool for demonstrating PIN authentication vulnerabilities
// ⚠️ FOR EDUCATIONAL PURPOSES ONLY - DO NOT USE FOR MALICIOUS ACTIVITIES
// Author: ipusiron
// License: MIT
// Security: All processing is client-side, no data transmission to servers

import {
  computeCandidates, parseWildcards,
  countPeaks, videoAccuracy, PEAK_DEFAULTS, thermalDecay,
} from './pin-engine.js';
import {t, translateStep} from './pts-messages.js';

const AUDIO_MAX_BYTES = 20 * 1024 * 1024; // 20MB cap for acoustic analysis

function bootstrap(){

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
    const labels = [t('radar.finger'), t('radar.thermal'), t('radar.audio'), t('radar.video')];
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
  // Real-time thermal decay simulation driven by the exponential model in
  // pin-engine.js: T(t) = T0 * exp(-t / tau), with tau = 20s. The UI calls
  // `thermalDecay()` so the on-screen cooling curve matches the engine.
  let thermalDecayInterval = null; // Interval ID for automatic decay
  let thermalStartTime = null; // Timestamp when input started

  /**
   * Thermal keypad: Click to increase temperature
   * Temperature increases by 10°C per click, max 40°C
   * Automatically starts real-time decay animation (exponential, tau=20s)
   */
  const thermalKeypadKeys = createKeypad('thermal-keypad', (node)=>{
    // Add 10 degrees per click, max 40 degrees (realistic range)
    node._temp = Math.min((node._temp || 0) + 10, 40);
    baseTemps[parseInt(node.dataset.idx)] = node._temp;
    node.querySelector('.density').textContent = Math.round(node._temp);

    // Reset time slider to 0 and start real-time exponential decay (tau=20s)
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
   * Uses the engine's exponential model: T(t) = T0 * exp(-t / tau), tau = 20s
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

      // Exponential decay (tau=20s) via the pure engine function
      const currentTemps = baseTemps.map(t => thermalDecay(t, elapsed));

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

    // Exponential decay (tau=20s) via the engine function
    const currentTemps = baseTemps.map(t => thermalDecay(t, s));

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

  // computeCandidates / parseWildcards / binom live in pin-engine.js now and
  // are imported at the top of this file. The legacy inline implementations
  // were removed so that the engine has a single source of truth.

  // UI binding for calc button
  el('calc-btn').addEventListener('click', ()=>{
    const digits = getSelectedDigits();
    const pinLen = Number(el('pin-length').value) || 4;
    const mode = el('mode').value;
    const allowDup = el('allow-dup').checked;
    const wildsRaw = el('wildcards').value.trim();
    const wilds = parseWildcards(wildsRaw, pinLen);
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
        line.textContent = `${idx + 1}. ${translateStep(step)}`;
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
        more.textContent = t('cand.truncated', {remaining: candidates.length - displayLimit, count});
        const note = document.createElement('div');
        note.style.fontSize = '13px';
        note.style.marginTop = '6px';
        note.textContent = t('cand.csvNote');
        more.appendChild(note);
        candEl.appendChild(more);
      }
    } else {
      candEl.textContent = t('cand.empty');
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
      showToast(t('sim.needSimTab'), 'warning');
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

    showToast(t('sim.pushedToast'), 'success');
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
          line.textContent = `${idx + 1}. ${translateStep(step)}`;
          stepsEl.appendChild(line);
        });
      } else if(!stepsEl.textContent.trim()){
        stepsEl.textContent = t('steps.placeholder');
      }
    } else {
      stepsEl.style.display = 'none';
    }
  });

  // Initialize steps display
  el('calculation-steps').style.display = 'none';

  // parseWildcardsOrNull was removed; parseWildcards (from pin-engine) is
  // now the only entry point and performs stricter validation.

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
    el('finger-result').innerHTML = t('finger.result', {digits: candidates, threshold});
    showToast(t('finger.doneToast'), 'success');
  });

  el('clear-finger').addEventListener('click', ()=>{
    qa('.finger-key').forEach(n=>{
      n._density = 0;
      n.querySelector('.density').textContent = '0';
      n.style.background = '';
    });
    el('finger-result').innerHTML = '';
    window._attackResults.finger = null;
    showToast(t('finger.clearedToast'));
  });

  /**
   * Thermal Analysis
   * Simulates thermal imaging detection of recently pressed keys
   * Uses the engine's exponential cooling model: T(t) = T0 * exp(-t / tau), tau=20s
   * Sorts keys by temperature to estimate digit order (higher temp = more recent)
   * Order confidence calculated as ratio of hottest to second-hottest key
   */
  el('analyze-thermal').addEventListener('click', ()=>{
    // Stop real-time decay
    stopThermalDecay();

    // Use current elapsed time
    const timeS = Number(el('time-since').value);

    // Current temperatures via the engine's exponential decay (tau=20s)
    const thermalTemps = baseTemps.map(t => thermalDecay(t, timeS));

    const thermalPairs = thermalTemps.map((t,i)=>({i,t})).sort((a,b)=>b.t-a.t);
    const candidates = thermalPairs.filter(p=>p.t>3).slice(0,6).map(p=>fingerKeys[p.i].label).filter(lbl=>/\d/.test(lbl));
    const orderConfidence = Math.round((thermalPairs[0].t / (thermalPairs[1]?.t || thermalPairs[0].t || 1)) * 100);

    window._attackResults.thermal = {candidates, orderConfidence};
    el('thermal-result').innerHTML = t('thermal.result', {digits: candidates, orderConfidence, timeS});
    showToast(t('thermal.doneToast'), 'success');
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
      // File-based analysis. Enforce an upper size bound and always close
      // the AudioContext (both success and failure paths) so decoded buffers
      // and the audio thread don't linger across repeated analyses.
      if(file.size > AUDIO_MAX_BYTES){
        showToast(t('audio.tooLarge', {limitMB: Math.floor(AUDIO_MAX_BYTES / 1024 / 1024)}), 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e)=>{
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const finish = ()=>{ try { ctx.close(); } catch (_) { /* ignore */ } };
        ctx.decodeAudioData(e.target.result, (buf)=>{
          const data = buf.getChannelData(0);
          const peaks = countPeaks(data, PEAK_DEFAULTS);
          window._attackResults.audio = peaks;
          window.audioPeakCount = peaks;
          el('audio-result').innerHTML = t('audio.resultFile', {peaks});
          showToast(t('audio.doneToast'), 'success');
          finish();
        }, ()=>{
          showToast(t('audio.decodeFailed'), 'error');
          finish();
        });
      };
      reader.readAsArrayBuffer(file);
    } else if(audioTapCount > 0){
      // Keypad-based analysis
      window._attackResults.audio = audioTapCount;
      window.audioPeakCount = audioTapCount;
      el('audio-result').innerHTML = t('audio.resultKeypad', {taps: audioTapCount});
      showToast(t('audio.doneToast'), 'success');
    } else {
      showToast(t('audio.inputNeeded'), 'warning');
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
      showToast(t('video.needInput'), 'warning');
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
      const accuracy = videoAccuracy(pixelErr);
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
    el('video-result').innerHTML = t('video.result', {
      pin: videoPinInput.join(''),
      digits: candidates,
      angle: videoAngle,
      pixelErr,
      confidence: Math.round(confidence),
    });
    showToast(t('video.doneToast'), 'success');
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
    displayPINRanking(ranking);

    // Update summary
    el('sim-candidates').textContent = union.length ? union.join(', ') : t('label.none');
    el('sim-length').textContent = String(estimatedLength);
    el('sim-order-confidence').textContent = thermalOrderConfidence ? (thermalOrderConfidence + '%') : '—';

    window._simResult = {
      candidates: union.map(s=>String(s)),
      length: estimatedLength,
      orderConfidence: thermalOrderConfidence,
      scores: scores,
      ranking: ranking
    };
    showToast(t('sim.doneToast'), 'success');
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
      hints.push(t('hint.riskHigh'));
    } else if(totalScore > 30){
      hints.push(t('hint.riskMid'));
    } else {
      hints.push(t('hint.riskLow'));
    }

    // Specific method recommendations
    if(scores.finger > 50)  hints.push(t('hint.finger'));
    if(scores.thermal > 50) hints.push(t('hint.thermal'));
    if(scores.audio > 0)    hints.push(t('hint.audio'));
    if(scores.video > 50)   hints.push(t('hint.video'));

    // Candidate space analysis
    if(candidates.length <= 4 && length === 4){
      hints.push(t('hint.candidateTight', {len: candidates.length, total: Math.pow(candidates.length, length)}));
    } else if(candidates.length <= 6){
      hints.push(t('hint.candidateNarrow', {len: candidates.length}));
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
    if(!container) return;

    if(!ranking || ranking.length === 0){
      const empty = document.createElement('div');
      empty.className = 'ranking-empty';
      empty.textContent = t('sim.rankingPlaceholder');
      container.innerHTML = '';
      container.appendChild(empty);
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
  }

  el('run-sim').addEventListener('click', simRun);

  el('push-to-calc').addEventListener('click', ()=>{
    if(!window._simResult) { showToast(t('sim.needRun'), 'warning'); return; }
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
     Tooltip positioning system
     ----------------------- */
  // Pre-calculate and set tooltip positions to prevent visible movement
  function preCalculateTooltipPosition(tooltipWrapper) {
    const tooltip = tooltipWrapper.querySelector('.tooltip');
    if (!tooltip) return;

    // Get viewport and element positions
    const viewportWidth = window.innerWidth;
    const wrapperRect = tooltipWrapper.getBoundingClientRect();

    // Estimate tooltip width without showing it (using max-width)
    const estimatedWidth = Math.min(400, viewportWidth - 48);

    // Calculate ideal center position
    const idealLeft = wrapperRect.left + (wrapperRect.width / 2) - (estimatedWidth / 2);

    // Reset classes first
    tooltip.classList.remove('tooltip-left', 'tooltip-right');

    // Check for left overflow
    if (idealLeft < 24) {
      tooltip.classList.add('tooltip-left');
    }
    // Check for right overflow
    else if (idealLeft + estimatedWidth > viewportWidth - 24) {
      tooltip.classList.add('tooltip-right');
    }
    // Center position is fine - keep default
  }

  // Add event listeners to all tooltip wrappers
  const tooltipWrappers = qa('.tooltip-wrapper');
  tooltipWrappers.forEach(wrapper => {
    // Pre-calculate position on mouseenter (before tooltip becomes visible)
    wrapper.addEventListener('mouseenter', () => {
      preCalculateTooltipPosition(wrapper);
    });

    // Recalculate on window resize
    window.addEventListener('resize', () => {
      preCalculateTooltipPosition(wrapper);
    });
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

    // Get container dimensions for responsive sizing
    const container = randCanvas.parentElement;
    const containerWidth = container ? container.offsetWidth : randCanvas.offsetWidth;
    const canvasWidth = Math.min(containerWidth, 260);
    const canvasHeight = (canvasWidth / 260) * 320; // Maintain aspect ratio

    // Set canvas dimensions
    const dpr = window.devicePixelRatio || 1;
    randCanvas.width = canvasWidth * dpr;
    randCanvas.height = canvasHeight * dpr;
    randCanvas.style.width = canvasWidth + 'px';
    randCanvas.style.height = canvasHeight + 'px';

    // Get context and scale for high DPI
    rctx = randCanvas.getContext('2d');
    rctx.scale(dpr, dpr);

    // Store dimensions
    randDims = {
      dpr: dpr,
      displayWidth: canvasWidth,
      displayHeight: canvasHeight
    };

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
      showToast(t('cover.on'), 'info');
    } else {
      // When turning off, masked digits stay masked (permanent effect)
      showToast(t('cover.off'), 'info');
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
    showToast(t('cover.cleared'));
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
    showToast(t('export.sessionDone'), 'success');
  });
  el('download-csv').addEventListener('click', ()=>{
    // Export all candidates from calculation result
    if(!window._calcResult || !window._calcResult.candidates || window._calcResult.candidates.length === 0){
      showToast(t('export.csvEmpty'), 'warning');
      return;
    }
    const allCandidates = window._calcResult.candidates;
    const csv = 'candidate\n' + allCandidates.join('\n');
    const filename = `candidates_${getTimestamp()}.csv`;
    downloadBlob(csv, filename, 'text/csv');
    showToast(t('export.csvDone', {total: allCandidates.length}), 'success');
  });

  el('export-sim').addEventListener('click', ()=>{
    if(!window._simResult){ showToast(t('sim.needSim'), 'warning'); return; }
    const filename = `sim-result_${getTimestamp()}.json`;
    downloadBlob(JSON.stringify(window._simResult,null,2), filename, 'application/json');
    showToast(t('export.simDone'), 'success');
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
  // (Array.prototype.find has been standard since ES2015; the polyfill was
  // removed because the module target is modern evergreen browsers.)

  // initialize default
  el('finger-threshold').value = 30;
  // initial sim run to populate nothing
  window._simResult = {candidates:[], length:4, orderConfidence:0};
}

// With type="module", scripts are deferred. Fire bootstrap either now or
// when the DOM finishes parsing.
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
