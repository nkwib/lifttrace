// Light theme: accent used as small text or behind white text must reach 4.5:1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');
const lum = (hex) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('light orange accent ink reaches 4.5:1 on surfaces and under white text', () => {
  const m = css.match(/\[data-theme="light"\]:not\(\[data-accent\]\) \{([^}]*)\}/);
  assert.ok(m, 'light default accent-ink block');
  const ink = m[1].match(/--accent-ink:\s*(#[0-9a-f]{6})/i)[1];
  const ink2 = m[1].match(/--accent-ink-2:\s*(#[0-9a-f]{6})/i)[1];
  for (const bg of ['#FFFFFF', '#F5F7FA', '#EEF1F7', '#E5E8F0']) {
    assert.ok(ratio(ink, bg) >= 4.5, `ink on ${bg} ${ratio(ink, bg).toFixed(2)}`);
  }
  assert.ok(ratio(ink2, '#FFFFFF') >= 4.5, 'white on button gradient end');
});

test('accent text and white-on-accent buttons use the ink token, not the raw accent', () => {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  assert.match(read('src/styles/buttons.css'), /linear-gradient\(135deg, var\(--accent-ink\), var\(--accent-ink-2\)\);\s*color: var\(--accent-text\)/);
  assert.match(read('src/components/layout/BottomNav.svelte'), /\.nav-tab\.active\s*\{ color: var\(--accent-ink\)/);
  assert.match(read('src/components/exercises/ExerciseInfo.svelte'), /\.tag\.muscle[^\n]*color: var\(--lift-sets\)/);
  assert.match(read('src/stores/settings.js'), /setProperty\('--accent-ink'/);
});

test('no src rule fills with the raw accent behind white or accent-text', () => {
  const walk = (d) => readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const bad = [];
  for (const f of walk(join(root, 'src')).filter((p) => /\.(svelte|css)$/.test(p))) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\{([^{}]*)\}/g)) {
      const b = m[1];
      if (/background(-color)?:\s*var\(--accent\)(?![\w-])/.test(b) && /(^|[;\s])color:\s*(white|#fff(fff)?|var\(--accent-text[^)]*\))/i.test(b)) {
        bad.push(`${f.slice(root.length)}:${s.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'use var(--accent-ink) as the fill');
});
