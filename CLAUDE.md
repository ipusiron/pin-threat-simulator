# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PIN Threat Simulator** is an educational web-based tool that simulates attack techniques against PIN authentication systems. It demonstrates how PINs can be analyzed through various attack vectors and teaches effective defense strategies.

**Purpose**: Educational only - to help students and security professionals understand authentication vulnerabilities in a safe environment.

**Tech Stack**: Pure client-side JavaScript, HTML5 Canvas, CSS. No build process, no dependencies, no server required.

## How to Run

Open `index.html` directly in a browser. No server or build step required.

For GitHub Pages deployment, files are served directly from the repository root.

## Architecture

### Three-Tab Structure

1. **PINパターン計算 (PIN Pattern Calculation)** - Combinatorics engine for candidate calculation
2. **攻撃シミュレーション (Attack Simulation)** - Multi-method attack demonstration with integrated analysis
3. **セキュリティ (Security)** - Defense strategies and educational content

### File Structure

- `index.html` - Main HTML with 3-tab UI structure
- `script.js` - All application logic (~1400 lines)
- `style.css` - Styling and theming (dark/light mode)

### Core Components (script.js)

**Candidate Calculation Engine** (`computeCandidates` function):
- Three modes: `allowed` (restriction-based), `must` (inclusion-based), `partial` (wildcard-based)
- Uses inclusion-exclusion principle for `must` mode with binomial coefficients
- Supports wildcards (`*`) for partial digit specification

**Attack Simulators**:
- **Fingerprint Analysis**: Interactive 3×4 keypad with density values (0-100)
- **Thermal Analysis**: Canvas-based heatmap with exponential decay simulation (τ=20s)
- **Acoustic Analysis**: Peak detection in audio waveforms to estimate digit count
- **Shoulder Surfing**: Coordinate error degradation based on viewing angle

**Integration Flow**:
1. User configures attack parameters in simulation tab
2. `simRun()` aggregates results from all enabled attack methods
3. Results stored in `window._attackResults`
4. "Push to Calc" button transfers candidates to calculation tab

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
2. Create UI controls in new `.card` element
3. Add result structure to `window._attackResults`
4. Implement detection logic and call from `simRun()`
5. Update `generatePINRanking()` scoring if needed

### Changing calculation limits

- `cap` variables in `computeCandidates` control when full enumeration occurs
- Generation limits: allowed=5000, must=3000, partial=500
- Display limit: 1000 (CSVエクスポート for more)

### Modifying thermal decay

- Decay constant `dec=20` in thermal analysis
- Formula: `T(t) = T₀ × e^(-t/τ)`

### Key algorithms

- **Binomial calculation**: Iterative formula avoiding factorial overflow
- **Inclusion-exclusion**: `Σ(i=0 to k) (-1)^i × C(k,i) × (A-i)^n`
- **Peak detection**: Threshold-based crossing with 200-sample stride

## Related Documents

- 技術詳細: [TECHNICAL.md](TECHNICAL.md) - Implementation details, algorithms, performance optimizations
- セキュリティポリシー: [SECURITY.md](SECURITY.md) - Usage guidelines, data privacy
- プロジェクト概要: [README.md](README.md) - Full documentation with usage scenarios
