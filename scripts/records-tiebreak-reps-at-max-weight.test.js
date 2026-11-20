import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newRecord, accumulateRecord } from '../server/lib/volume.js';

const ex = { exercise_name: 'Bench' };
const run = (sets) => {
  const r = newRecord('Bench');
  for (const [s, d] of sets) accumulateRecord(r, ex, { completed: true, ...s }, d);
  return r;
};

test('equal weight, more reps updates reps and date', () => {
  const r = run([[{ weight: 100, reps: 5 }, '2026-03-01'], [{ weight: 100, reps: 8 }, '2026-06-01']]);
  assert.equal(r.maxReps, 8);
  assert.equal(r.date, '2026-06-01');
});
test('equal weight, fewer or equal reps keeps the first', () => {
  const r = run([[{ weight: 100, reps: 8 }, '2026-03-01'], [{ weight: 100, reps: 5 }, '2026-06-01'], [{ weight: 100, reps: 8 }, '2026-07-01']]);
  assert.equal(r.maxReps, 8);
  assert.equal(r.date, '2026-03-01');
});
test('heavier weight still wins over more reps', () => {
  const r = run([[{ weight: 100, reps: 12 }, '2026-03-01'], [{ weight: 110, reps: 1 }, '2026-06-01']]);
  assert.deepEqual([r.maxWeight, r.maxReps], [110, 1]);
});
test('split reps count at the weaker side', () => {
  const r = run([[{ weight: 100, reps: 6 }, '2026-03-01'], [{ weight: 100, reps: 10, reps_l: 10, reps_r: 4 }, '2026-06-01']]);
  assert.equal(r.maxReps, 6);
  assert.equal(r.date, '2026-03-01');
});
test('warm-up and incomplete sets are ignored', () => {
  const r = run([[{ weight: 100, reps: 5 }, '2026-03-01'], [{ weight: 100, reps: 9, warmup: true }, '2026-04-01'], [{ weight: 100, reps: 9, completed: false }, '2026-05-01']]);
  assert.equal(r.maxReps, 5);
});
test('native Stats.records has the same tie-break and date order', () => {
  const src = readFileSync(new URL('../src/lib/api-native.js', import.meta.url), 'utf8');
  assert.match(src, /wt === records\[id\]\.maxWeight && reps > records\[id\]\.maxReps/);
  assert.match(src, /FROM workout_log WHERE user_id = \? AND deleted_at IS NULL ORDER BY date ASC`/);
});
