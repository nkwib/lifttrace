import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('.page-header h1 is not a flex container (text-overflow needs block)', () => {
  const css = readFileSync('src/styles/base.css', 'utf8');
  const rule = css.match(/\.page-header h1 \{[^}]*\}/)[0];
  assert.match(rule, /text-overflow:\s*ellipsis/);
  assert.match(rule, /overflow:\s*hidden/);
  assert.doesNotMatch(rule, /display:\s*flex/);
});

test('ExerciseDetail wraps actions below the title on narrow screens', () => {
  const s = readFileSync('src/routes/ExerciseDetail.svelte', 'utf8');
  assert.match(s, /class="page-header ed-header"/);
  assert.match(s, /\.ed-header \{ flex-wrap: wrap/);
  assert.doesNotMatch(s, /\|\| 'Exercise'/);
});
