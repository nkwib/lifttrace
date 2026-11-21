// Wiring test: editor chips expose pressed state and named groups.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/exercises/ExerciseEditor.svelte', import.meta.url), 'utf8');

test('every .chip toggle with class:active has aria-pressed', () => {
  const chips = src.match(/<button type="button" class="chip[^"]*"[^>]*class:active=/g) || [];
  assert.ok(chips.length >= 12);
  for (const c of chips) assert.match(c, /aria-pressed=\{/);
});

test('each chips container is a group labelled by a title span', () => {
  const groups = [...src.matchAll(/<div class="chips" role="group" aria-labelledby="([^"]+)">/g)].map(m => m[1]);
  assert.strictEqual(groups.length, 5);
  assert.strictEqual(new Set(groups).size, 5);
  for (const id of groups) assert.ok(src.includes(`<span class="label" id="${id}"`), id);
});
