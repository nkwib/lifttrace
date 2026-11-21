import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/routes/ExerciseDetail.svelte', import.meta.url), 'utf8');

test('ExerciseDetail reloads when only params.id changes', () => {
  assert.match(src, /\$:\s*if \(params\.id !== loadedId\) \{ loadedId = params\.id; showId\(\); \}/);
  const fn = src.match(/function showId\(\) \{([\s\S]*?)\n  \}/)[1];
  for (const r of ['exercise = null', 'history = []', 'showEditor = false', 'load()']) assert.ok(fn.includes(r), r);
  assert.doesNotMatch(src, /onMount\(\(\) => \{ load\(\); \}\)/);
});
