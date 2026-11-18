import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
const parse = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map(m => [m[1], m[2]]));
const themes = { light: parse(css) };

const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => {
  let h = hex.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const TYPES = ['cafe', 'restaurant', 'bar', 'pub', 'see', 'do', 'trip', 'vintage', 'music'];
const check = (t, fg, bg, min) => {
  const r = ratio(t[fg], t[bg]);
  assert.ok(r >= min, `--${fg} ${t[fg]} on --${bg} ${t[bg]} = ${r.toFixed(2)}, needs ${min}`);
};

test('helper gives 21 for black on white', () => { assert.equal(Math.round(ratio('#000000', '#ffffff') * 100) / 100, 21); });

for (const [name, t] of Object.entries(themes)) {
  describe(`${name} theme`, () => {
    test('text and status colours >= 4.5 on bg, surface, surface-2', () => {
      for (const fg of ['ink', 'ink-2', 'accent', 'ok', 'warn', 'danger']) for (const bg of ['bg', 'surface', 'surface-2']) check(t, fg, bg, 4.5);
    });
    test('on-accent on accent >= 4.5', () => check(t, 'on-accent', 'accent', 4.5));
    test('line-strong and focus >= 3 on bg and surface', () => {
      for (const fg of ['line-strong', 'focus']) for (const bg of ['bg', 'surface']) check(t, fg, bg, 3);
    });
    test('on-type on each type colour >= 3', () => {
      for (const ty of TYPES) check(t, 'on-type', `t-${ty}`, 3);
    });
  });
}

test('light only: no dark colour scheme anywhere', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const allCss = ['tokens', 'base', 'layout', 'explore', 'plan', 'map']
    .map((f) => readFileSync(new URL(`../css/${f}.css`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(allCss, /prefers-color-scheme:\s*dark/);
  assert.match(css, /color-scheme:\s*light;/);
  assert.match(html, /<meta name="color-scheme" content="light only">/);
});
