import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { repMaxes } from '../src/lib/history-set.js';

const set = (weight, reps, extra = {}) => ({ weight, reps, completed: true, ...extra });
const hist = (sets, date = '2026-01-01', extra = {}) => ({ date, sets, ...extra });

test('3RM/5RM/8RM from mixed sets, 10RM absent', () => {
  const r = repMaxes([hist([set(100, 5), set(90, 8), set(110, 3)])]);
  assert.deepEqual(r.map(x => [x.reps, x.weight]), [[3, 110], [5, 100], [8, 90]]);
  assert.equal(r[0].date, '2026-01-01');
});

test('redundant rows collapse to the highest rep count', () => {
  const r = repMaxes([hist([set(100, 10)])]);
  assert.deepEqual(r.map(x => [x.reps, x.weight]), [[10, 100]]);
});

test('warm-ups, incomplete and zero weight excluded', () => {
  const r = repMaxes([hist([set(200, 5, { warmup: true }), set(150, 5, { completed: false }), set(0, 12), set(60, 5)])]);
  assert.deepEqual(r.map(x => [x.reps, x.weight]), [[5, 60]]);
});

test('split L/R uses setReps', () => {
  const r = repMaxes([hist([{ weight: 50, reps_l: 8, reps_r: 8, completed: true }, set(70, 3)])]);
  assert.ok(r.some(x => x.reps === 8 && x.weight === 50));
});

test('non-rep history gives []', () => {
  assert.deepEqual(repMaxes([hist([{ weight: 0, duration: 60, completed: true }], 'd', { set_type: 'timed' })]), []);
  assert.deepEqual(repMaxes(null), []);
});

test('ExerciseInfo wiring and en.json keys', () => {
  const src = fs.readFileSync(new URL('../src/components/exercises/ExerciseInfo.svelte', import.meta.url), 'utf8');
  assert.match(src, /repMaxes\(history\)/);
  const en = JSON.parse(fs.readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
  assert.ok(en.exercise_info.rep_maxes_title && en.exercise_info.rep_maxes_reps);
});
