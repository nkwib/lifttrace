import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { missingCalorieProfileFields, estimateWorkoutCalories } from '../src/lib/workout.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('missingCalorieProfileFields mirrors the estimator inputs (sex optional)', () => {
  assert.deepEqual(missingCalorieProfileFields({}), ['weight', 'height', 'dob']);
  assert.deepEqual(missingCalorieProfileFields(null), ['weight', 'height', 'dob']);
  assert.deepEqual(missingCalorieProfileFields({ weight_kg: 80, height_cm: 180, age: 0 }), ['dob']);
  const full = { weight_kg: 80, height_cm: 180, age: 30 };
  assert.deepEqual(missingCalorieProfileFields(full), []);
  const w = { duration_min: 30, exercises: [] };
  assert.notEqual(estimateWorkoutCalories(w, { ...full, sex: null }), null);
});

test('Settings row uses the helper and links to Profile; strings exist', () => {
  const src = read('../src/components/settings/SettingsWorkout.svelte');
  assert.match(src, /missingCalorieProfileFields\(/);
  assert.match(src, /push\('\/profile'\)/);
  assert.match(src, /\$currentUser\?\.birthday \|\| DB\.getSetting\('dob', null\)/);
  const g = JSON.parse(read('../src/i18n/en.json')).settings_workout.goals;
  for (const k of ['calorie_missing', 'calorie_missing_weight', 'calorie_missing_height', 'calorie_missing_dob', 'calorie_missing_action']) {
    assert.ok(g[k], k);
  }
  assert.doesNotMatch(g.calorie_est_desc, /and sex/);
});
