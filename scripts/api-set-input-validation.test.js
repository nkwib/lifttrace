/**
 * log_set / POST /api/v1/workouts/:date/sets value validation. The checks
 * live in server/lib/set-input.js (pure), so they run without a database;
 * wiring checks confirm logSetCore and the zod schema use them.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SET_LIMITS, normalizeReps, normalizeWeight, normalizeRpe, normalizeFlag } from '../server/lib/set-input.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('reps: whole numbers 0..1000, numeric strings accepted', () => {
  assert.equal(normalizeReps('5'), 5);
  assert.equal(normalizeReps(0), 0);
  assert.equal(normalizeReps(1000), 1000);
  for (const bad of ['abc', -1, 1001, 1e9, 5.5, NaN, Infinity, true, [], {}]) {
    assert.throws(() => normalizeReps(bad), /reps/, String(bad));
  }
});

test('unsent values (null, undefined, empty string) stay undefined', () => {
  for (const v of [null, undefined, '']) {
    assert.equal(normalizeReps(v), undefined);
    assert.equal(normalizeWeight(v), undefined);
    assert.equal(normalizeRpe(v), undefined);
    assert.equal(normalizeFlag('warmup', v), undefined);
  }
});

test('weight 0..10000 and rpe 1..10, strings and fractions accepted', () => {
  assert.equal(normalizeWeight('52.5'), 52.5);
  assert.equal(normalizeWeight(0), 0);
  for (const bad of [-1, 10001, 'x', Infinity]) assert.throws(() => normalizeWeight(bad), /weight/);
  assert.equal(normalizeRpe('8.5'), 8.5);
  for (const bad of [0, 0.5, 11, 99, 'high']) assert.throws(() => normalizeRpe(bad), /rpe/);
});

test('warmup and completed: booleans, "true"/"false", 1/0; else throws', () => {
  assert.equal(normalizeFlag('warmup', true), true);
  assert.equal(normalizeFlag('warmup', 'false'), false);
  assert.equal(normalizeFlag('warmup', 1), true);
  assert.equal(normalizeFlag('completed', 0), false);
  for (const bad of ['no', 'yes', 2, {}]) assert.throws(() => normalizeFlag('warmup', bad), /warmup/);
});

test('logSetCore uses the shared checks; zod limits match SET_LIMITS', () => {
  const src = read('../server/lib/mcp/tools/log-set.js');
  assert.match(src, /normalizeWeight\(weightSent\)/);
  assert.match(src, /normalizeRpe\(rpeSent\)/);
  assert.match(src, /normalizeFlag\('warmup', warmupSent\)/);
  assert.match(src, /normalizeFlag\('completed', completedSent\)/);
  // reps is not validated on timed/distance/calorie sets (ignored there)
  assert.match(src, /const reps = amount \? undefined : normalizeReps\(repsSent\)/);
  // The zod lines stay literal (other wiring tests grep them); they must match.
  assert.match(src, /reps: z\.number\(\)\.int\(\)\.min\(0\)\.max\(1000\)/);
  assert.match(src, /weight: z\.number\(\)\.min\(0\)\.max\(10000\)/);
  assert.match(src, /rpe: z\.number\(\)\.min\(1\)\.max\(10\)/);
  assert.deepEqual(SET_LIMITS, { reps: { min: 0, max: 1000 }, weight: { min: 0, max: 10000 }, rpe: { min: 1, max: 10 } });
});
