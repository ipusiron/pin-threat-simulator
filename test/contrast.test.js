// test/contrast.test.js
// Verify WCAG AA contrast (4.5:1) for key text/background pairs across
// both light and dark themes. Pure number crunching; no DOM is required.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const css = readFileSync(join(root, 'style.css'), 'utf8');

// --- Minimal color parser ------------------------------------------------
function parseHex(hex){
  hex = hex.replace('#','');
  if(hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
  const n = parseInt(hex, 16);
  return {r:(n>>16)&255, g:(n>>8)&255, b:n&255, a:1};
}
function parseRgb(str){
  const m = str.match(/rgba?\(\s*([^)]+)\)/i);
  if(!m) return null;
  const parts = m[1].split(',').map(s => s.trim());
  const r = parseFloat(parts[0]);
  const g = parseFloat(parts[1]);
  const b = parseFloat(parts[2]);
  const a = parts[3] != null ? parseFloat(parts[3]) : 1;
  return {r, g, b, a};
}
function parseColor(str){
  str = String(str).trim();
  if(str.startsWith('#')) return parseHex(str);
  if(str.startsWith('rgb')) return parseRgb(str);
  // Named colors we actually use.
  if(str === 'white') return {r:255,g:255,b:255,a:1};
  if(str === 'black') return {r:0,g:0,b:0,a:1};
  return null;
}
function blend(fg, bg){
  // Composite fg (possibly translucent) over opaque bg.
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}
function relLum({r,g,b}){
  const srgb = [r,g,b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055)/1.055, 2.4);
  });
  return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
}
function contrast(fg, bg){
  const opaqueFg = fg.a < 1 ? blend(fg, bg) : fg;
  const L1 = relLum(opaqueFg);
  const L2 = relLum(bg);
  const lo = Math.min(L1, L2), hi = Math.max(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

// --- Extract :root and [data-theme="light"] variables --------------------
function extractVars(blockHeader){
  const re = new RegExp(blockHeader + '\\{([\\s\\S]*?)\\}');
  const m = css.match(re);
  if(!m) throw new Error('block not found: ' + blockHeader);
  const vars = {};
  const varRe = /--([a-zA-Z-]+)\s*:\s*([^;]+);/g;
  let r;
  while((r = varRe.exec(m[1])) !== null){
    vars[r[1]] = r[2].trim();
  }
  return vars;
}
const darkVars = extractVars(':root');
const lightVars = extractVars('\\[data-theme="light"\\]');

function resolveVar(name, vars){
  const v = vars[name];
  if(!v) throw new Error('unknown var: ' + name);
  const c = parseColor(v);
  if(!c) throw new Error('unparseable: ' + v);
  return c;
}

// --- Pair matrix ---------------------------------------------------------
// (fg var, bg var, label). Backgrounds: --bg (opaque) and the opaque-ified
// --card over --bg to approximate the glass look.
function pairs(vars){
  const bg = resolveVar('bg', vars);
  const card = resolveVar('card', vars);
  const cardOver = blend(card, bg); // approximate "card background on body"
  const accent = resolveVar('accent', vars);
  const muted = resolveVar('muted', vars);
  const brand = resolveVar('brand', vars);
  return [
    ['accent on bg', accent, bg],
    ['muted on bg', muted, bg],
    ['brand on bg', brand, bg],
    ['accent on card', accent, cardOver],
    ['muted on card', muted, cardOver],
    ['brand on card', brand, cardOver],
  ];
}

function collectBelow(theme, vars){
  const fails = [];
  for(const [label, fg, bg] of pairs(vars)){
    const r = contrast(fg, bg);
    if(r < 4.5) fails.push(`${theme}: ${label} = ${r.toFixed(2)}`);
  }
  return fails;
}

test('dark theme meets 4.5:1 contrast on core text/background pairs', () => {
  const fails = collectBelow('dark', darkVars);
  assert.equal(fails.length, 0, fails.join('\n'));
});

test('light theme meets 4.5:1 contrast on core text/background pairs', () => {
  const fails = collectBelow('light', lightVars);
  assert.equal(fails.length, 0, fails.join('\n'));
});
