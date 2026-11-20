/**
 * The empty-day trigger for loadRecentWorkouts must depend on a derived
 * boolean, so it fires on the transition and not on every todayLog update.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const diary = readFileSync(new URL('../src/routes/Diary.svelte', import.meta.url), 'utf8');

test('recent workouts load is keyed on a derived isEmptyDay boolean', () => {
  assert.match(diary, /\$: isEmptyDay = !loading && exercises\.length === 0;/);
  assert.match(diary, /\$: if \(isEmptyDay\) loadRecentWorkouts\(\);/);
  assert.doesNotMatch(diary, /\$: if \(!loading && exercises\.length === 0\)/);
});

test('onMount load stays for the rail during active sessions', () => {
  assert.match(diary, /onMount\(loadRecentWorkouts\)/);
});
