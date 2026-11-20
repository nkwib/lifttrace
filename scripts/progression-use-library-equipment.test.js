import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextTarget } from '../src/lib/progression.js';

const sets = (w) => [{ reps: 10, weight: w }, { reps: 10, weight: w }];
const step = (equipment, unit = 'kg', w = 20) =>
  nextTarget({ targetReps: '10', lastSets: sets(w), unit, equipment, loadType: 'bilateral' })?.step;

test('library equipment arrays joined for the step', () => {
  assert.equal(step(['Cable'].join(' '), 'lbs'), 10);
  assert.equal(step('Machine', 'lbs'), 10);
  assert.equal(step('Dumbbell'), 2);
  assert.equal(step(['Barbell', 'Bench'].join(' ')), 2.5);
  assert.equal(step(['Bodyweight', 'Dumbbell'].join(' ')), 2);
  assert.equal(step(''), 2.5);
});
test('bodyweight: weighted work progresses, unweighted and assisted do not', () => {
  assert.equal(step('Bodyweight', 'kg', 10), 2.5);
  assert.equal(step('Bodyweight', 'kg', 0), undefined);
  assert.equal(step('Assisted', 'kg', 30), undefined);
});
test('ExerciseCard feeds library equipment and loads it beyond plate split', () => {
  const src = readFileSync(new URL('../src/components/diary/ExerciseCard.svelte', import.meta.url), 'utf8');
  assert.match(src, /equipment: libEquipment\?\.length \? libEquipment\.join\(' '\) : ''/);
  assert.doesNotMatch(src, /equipment: exercise\.equipment/);
  assert.match(src, /\$: if \(\(\$showPlateSplit \|\| \(!notReps && lastSession\)\) && exercise\.exercise_id/);
  assert.match(src, /<script context="module">[\s\S]*const _equipById = new Map\(\)/);
});
