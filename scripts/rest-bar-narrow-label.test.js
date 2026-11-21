import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../src/components/diary/RestTimer.svelte', import.meta.url), 'utf8');

test('rest bar drops the label column on narrow screens', () => {
  assert.match(src, /@media \(max-width: 360px\)[^}]*\.rest-label-col \{ display: none; \}/);
});

test('rest label clips and the clock never shrinks', () => {
  assert.match(src, /\.rest-label \{ overflow: hidden;/);
  assert.match(src, /\.rest-time-col \{[^}]*flex-shrink: 0;/);
});
