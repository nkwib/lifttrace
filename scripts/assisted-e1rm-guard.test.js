import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAssisted } from '../src/lib/history-set.js';

test('isAssisted reads equipment (string or array), not load_type', () => {
  assert.equal(isAssisted({ equipment: ['Assisted'] }), true);
  assert.equal(isAssisted({ equipment: 'Assisted machine' }), true);
  assert.equal(isAssisted({ equipment: ['Barbell'], load_type: 'bilateral' }), false);
  assert.equal(isAssisted({ load_type: 'assisted' }), false);
  assert.equal(isAssisted(null), false);
});

test('detail page and info sheet use isAssisted, no dead load_type check', () => {
  const detail = fs.readFileSync(new URL('../src/routes/ExerciseDetail.svelte', import.meta.url), 'utf8');
  const info = fs.readFileSync(new URL('../src/components/exercises/ExerciseInfo.svelte', import.meta.url), 'utf8');
  const lib = fs.readFileSync(new URL('../src/lib/history-set.js', import.meta.url), 'utf8');
  assert.match(detail, /isAssisted\(exercise\) \? \[\] : sessionE1rms/);
  assert.match(info, /isAssisted\(exercise\) \? \[\] : repMaxes/);
  assert.doesNotMatch(detail + lib, /load_type === 'assisted'/);
});
