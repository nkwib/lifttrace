// The PR card drops the e1RM sub-label for assisted lifts (weight is help, not load).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exerciseWeightPr } from '../src/lib/history-set.js';

const history = [{ date: '2026-01-01', sets: [{ completed: true, weight: 40, reps: 5 }] }];
const fmt = (v, u) => `${v} ${u}`;

test('exerciseWeightPr gives an e1RM sub only when a formatter is passed', () => {
  assert.ok(exerciseWeightPr(history, 'kg', fmt).sub);
  assert.equal(exerciseWeightPr(history, 'kg', null).sub, undefined);
});

test('ExerciseDetail passes no formatter for assisted exercises', () => {
  const src = fs.readFileSync(new URL('../src/routes/ExerciseDetail.svelte', import.meta.url), 'utf8');
  assert.match(src, /exerciseWeightPr\(history, \$weightUnit, isAssisted\(exercise\) \? null : /);
});
