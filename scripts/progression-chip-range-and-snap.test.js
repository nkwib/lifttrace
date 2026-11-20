import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextTarget, parseRepTarget, incrementFor } from '../src/lib/progression.js';

const sets = (n, reps, weight = 100) => Array.from({ length: n }, () => ({ reps, weight }));

test('range needs every set at the top', () => {
  assert.equal(nextTarget({ targetReps: '8-12', lastSets: sets(3, 10), unit: 'kg' }), null);
  const r = nextTarget({ targetReps: '8-12', lastSets: sets(3, 12), unit: 'kg' });
  assert.equal(r.weight, 102.5);
  assert.equal(r.reasonKey, 'diary.progression.reason_range');
});
test('single target, en dash, whitespace, non-numeric', () => {
  assert.equal(nextTarget({ targetReps: '10', lastSets: sets(3, 10), unit: 'lbs' }).weight, 105);
  assert.deepEqual(parseRepTarget('8 – 12'), { min: 8, max: 12 });
  for (const t of ['AMRAP', '8+', '', null]) assert.equal(parseRepTarget(t), null);
});
test('warm-ups and zero-rep sets ignored', () => {
  const last = [{ reps: 5, weight: 40, warmup: true }, { reps: 0, weight: 100 }, ...sets(3, 12)];
  assert.equal(nextTarget({ targetReps: '8-12', lastSets: last, unit: 'kg' }).weight, 102.5);
  assert.equal(nextTarget({ targetReps: '8-12', lastSets: [{ reps: 12, weight: 200, warmup: true }], unit: 'kg' }), null);
});
test('equipment increments and fallback', () => {
  assert.equal(incrementFor('kg', 'Dumbbell'), 2);
  assert.equal(incrementFor('lbs', 'Cable'), 10);
  assert.equal(incrementFor('kg', 'Machine'), 5);
  assert.equal(incrementFor('lbs', ''), 5);
  assert.equal(incrementFor('kg', 'Kettlebell'), 2.5);
  assert.equal(nextTarget({ targetReps: '10', lastSets: sets(2, 10), unit: 'kg', equipment: 'Bodyweight' }), null);
});
test('zero weight null; split reps via repsOf', () => {
  assert.equal(nextTarget({ targetReps: '10', lastSets: sets(3, 10, 0) }), null);
  const split = [{ reps_l: 10, reps_r: 8, weight: 20 }];
  assert.equal(nextTarget({ targetReps: '8', lastSets: split, repsOf: s => Math.min(s.reps_l, s.reps_r) }).weight, 25);
});
test('ExerciseCard wiring', () => {
  const src = readFileSync(new URL('../src/components/diary/ExerciseCard.svelte', import.meta.url), 'utf8');
  assert.match(src, /import \{ nextTarget \} from '\.\.\/\.\.\/lib\/progression\.js'/);
  assert.doesNotMatch(src, /split\(\/\[-\\u2013\]\/\)/);
  assert.doesNotMatch(src, /Last session hit target reps/);
});
