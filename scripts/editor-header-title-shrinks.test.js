import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('editor title input can shrink inside the header flex row', () => {
  const src = readFileSync(new URL('../src/routes/WorkoutEditor.svelte', import.meta.url), 'utf8');
  const rule = src.match(/^\s*\.title-input\s*\{[^}]*\}/m);
  assert.ok(rule, '.title-input rule exists');
  assert.match(rule[0], /min-width:\s*0/);
});
