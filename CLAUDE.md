# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PIN Threat Simulator** is an educational web-based tool that simulates attack techniques against PIN authentication systems. It demonstrates how PINs can be analyzed through various attack vectors and teaches effective defense strategies.

**Purpose**: Educational only - to help students and security professionals understand authentication vulnerabilities in a safe environment.

**Tech Stack**: Pure client-side JavaScript (ES modules), HTML5 Canvas, CSS. No build process, no npm dependencies, no server required for the app itself.

## How to Run

The script tag uses `type="module"`, which browsers refuse to load over `file://`. Serve the repository root over HTTP:

```bash
python -m http.server 8099
# then open http://localhost:8099/
```

For GitHub Pages, files are served directly from the repository root (main branch).

## How to Test

Tests use the Node 22 built-in test runner and have no runtime dependencies.

```bash
npm test
```

CI runs the same command on push and pull_request through `.github/workflows/test.yml`.

## Architecture

### Three-Tab Structure

1. **PINパターン計算 (PIN Pattern Calculation)** - Combinatorics engine for candidate calculation
2. **攻撃シミュレーション (Attack Simulation)** - Multi-method attack demonstration with integrated analysis
3. **セキュリティ解説 (Security)** - Defense strategies and educational content

### File Structure

- `index.html` - Main HTML with 3-tab UI structure, CSP meta, favicon, noscript
- `script.js` - DOM wiring (event handlers, canvas drawing, state management)
- `pin-engine.js` - Pure logic module: `computeCandidates`, `parseWildcards`, `binom`,
  `countPeaks`, `videoAccuracy`, `thermalDecay`, `generateCombinations`
- `pts-messages.js` - Centralized message dictionary (`ja` + `en`)
- `style.css` - Styling and theming (dark/light mode)
- `test/` - Node `--test` suites
- `.github/workflows/test.yml` - CI pipeline

### Candidate Calculation Engine

See `TECHNICAL.md` for the full spec. Three modes:

- `allowed` - each position comes from candidate set S; fixed-position tokens must also be in S
- `must` - every digit of S must appear; `allowDup=false` requires `n == |S|`
- `partial` - each position comes from 0..9; S is unused except to render UI chips

Wildcards are a length-n array (`'*'` or a single digit per position). An invalid token
(multi-digit, non-digit, length mismatch) returns `null` from `parseWildcards`.

### Attack Simulators

- **Fingerprint Analysis**: 3×4 keypad with density values (0-100)
- **Thermal Analysis**: Canvas heatmap with 1°C/sec linear decay (engine export `thermalDecay`
  uses the exponential form `T₀ * e^(-t/τ)`, τ=20)
- **Acoustic Analysis**: Dual-threshold peak detection on audio buffers (rise=0.3, fall=0.1,
  stride=200). File input is capped at 20MB; `AudioContext` is closed after decode
- **Shoulder Surfing**: `videoAccuracy(err) = max(0.5, 1 - err/50)` as the tilt accuracy;
  errorPenalty = `min(50, pixelErr × 1.5)`

### Integration Flow

1. User configures attack parameters in the simulation tab
2. `simRun()` aggregates results from all enabled attack methods
3. Results stored in `window._attackResults`
4. "PINパターン計算へ転送" button pushes the candidate set into the calculation tab

### Key Data Structures

```javascript
// Keypad layout mapping (indices 0-11 to digits 1-9, *, 0, #)
const fingerKeys = [{label:'1'}, {label:'2'}, ..., {label:'#'}]

// Attack results shared state
window._attackResults = {
  finger: ['1', '2', '3'],                    // detected digits
  thermal: {candidates: [...], orderConfidence: 85},
  audio: 4,                                    // digit count
  video: {candidates: [...], confidence: 88}
}
```

## Educational Purpose & Constraints

This tool is **strictly for educational use** in controlled environments (classrooms, workshops, research).

**Do NOT**:
- Modify code to facilitate actual attacks
- Remove or weaken educational disclaimers
- Add functionality for automated PIN cracking

**Acceptable modifications**:
- Adding new educational attack simulations with clear explanations
- Improving calculation algorithm performance
- Enhancing defense strategy demonstrations
- Adding multilingual support

## Common Modifications

### Adding a new attack method

1. Add checkbox in `<div class="card"><h3>手法選択</h3>` section (index.html)
2. Create UI controls in a new `.card` element
3. Add result structure to `window._attackResults`
4. Implement detection logic and call from `simRun()`
5. Update `generatePINRanking()` scoring if needed

### Changing calculation limits

- `ENUM_CAPS` in `pin-engine.js` controls when full enumeration occurs
- Defaults: allowed=5000, must=5000, partial=500
- Display limit: 1000 in `script.js` (CSV export for more)

### Adding or editing a message

- Edit `pts-messages.js` and add the key to BOTH the `ja` and `en` dictionaries
  (the key-set parity is enforced by `test/i18n.test.js`; the English value must
  contain zero Japanese characters)
- Call `t('your.key', {params})` from `script.js`
- Keep `script.js` free of Japanese string literals (enforced by `test/i18n.test.js`)
- In `index.html`, use `data-i18n="key"` on the element whose text to translate,
  and `data-i18n-attr="attr1 attr2"` plus (optionally) `data-i18n-<attr>="key"`
  for attribute-only translation (e.g. `title`, `placeholder`, `aria-label`).
  Every `data-i18n*` key must exist in the dictionary (enforced by `test/html.test.js`)

### Bilingual UI

- The active language is resolved in `script.js` in this order:
  `?lang=ja|en` → `localStorage['lang']` → `navigator.language` (defaults to `en`
  when not Japanese) → `ja`
- `applyI18n()` walks the DOM and injects dictionary values; the language toggle
  button simply calls `setLang(next)` and `applyI18n()`. Prior analysis results
  are redrawn from cached state rather than being recomputed
- When editing documentation, update `README.md` and `README.en.md` together —
  the headings must line up one-for-one (enforced by `test/readme.test.js`)

## Related Documents

- 技術詳細: [TECHNICAL.md](TECHNICAL.md) - Implementation details, algorithms, performance optimizations
- セキュリティポリシー: [SECURITY.md](SECURITY.md) - Usage guidelines, data privacy, CSP
- プロジェクト概要: [README.md](README.md) - Full documentation with usage scenarios
