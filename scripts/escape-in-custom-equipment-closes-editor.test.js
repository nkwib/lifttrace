import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/exercises/ExerciseEditor.svelte', import.meta.url), 'utf8');

test('custom-equipment Escape preventDefaults so the Sheet focus trap does not close the editor', () => {
  const m = src.match(/if \(e\.key === 'Escape'\) \{([^}]*)\}/);
  assert.ok(m, 'Escape branch present');
  assert.match(m[1], /e\.preventDefault\(\)/);
  assert.match(m[1], /addingCustomEq = false/);
});

test('focus-trap ignores defaultPrevented Escape', () => {
  const ft = readFileSync(new URL('../src/lib/focus-trap.js', import.meta.url), 'utf8');
  assert.match(ft, /e\.defaultPrevented/);
});
