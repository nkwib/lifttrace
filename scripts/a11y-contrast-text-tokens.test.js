// Text tokens must reach WCAG AA (4.5:1) on every surface, in both themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');

function block(selector) {
  const i = css.indexOf(selector + ' {');
  assert.ok(i >= 0, `block ${selector}`);
  return css.slice(i, css.indexOf('}', i));
}
function tokens(body) {
  const out = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const parse = (v) => {
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return { rgb: [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)), a: 1 };
  m = v.match(/^rgba\(([^)]+)\)$/);
  assert.ok(m, `unparsable ${v}`);
  const p = m[1].split(',').map(Number);
  return { rgb: p.slice(0, 3), a: p[3] };
};
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));

const dark = tokens(block(':root,\n[data-theme="dark"]'));
const light = tokens(block('[data-theme="light"]'));
const SURFACES = ['bg', 'surface-1', 'surface-2', 'surface-3'];

for (const [name, t] of [['dark', dark], ['light', light]]) {
  const worst = (tok) => Math.min(...SURFACES.map((s) => {
    const bg = parse(t[s]).rgb;
    return ratio(over(parse(t[tok]), bg), bg);
  }));

  test(`${name}: text-1/2/3 reach 4.5:1 on every surface`, () => {
    for (const tok of ['text-1', 'text-2', 'text-3']) {
      assert.ok(worst(tok) >= 4.5, `${name} ${tok} ${worst(tok).toFixed(2)}`);
    }
  });

  test(`${name}: hierarchy text-1 > text-2 > text-3 stays visible`, () => {
    assert.ok(worst('text-2') - worst('text-3') >= 1.5, 'text-2 vs text-3 gap');
    assert.ok(worst('text-1') - worst('text-2') >= 1.5, 'text-1 vs text-2 gap');
  });

  test(`${name}: status text tokens reach 4.5:1`, () => {
    for (const tok of ['success-text', 'warning-text']) {
      assert.ok(worst(tok) >= 4.5, `${name} ${tok} ${worst(tok).toFixed(2)}`);
    }
  });
}

test('light status fills are unchanged', () => {
  assert.equal(light.success, '#00C47A');
  assert.equal(light.warning, '#E09400');
});

test('text color never uses the raw status fills', () => {
  const bad = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(svelte|js|css)$/.test(e.name)
        && /(^|[^-\w])color:\s*var\(--(success|warning)\)/m.test(readFileSync(p, 'utf8'))) bad.push(p);
    }
  };
  walk(join(root, 'src'));
  assert.deepEqual(bad, []);
});
