import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('wiring: delete dialog shows workout count, falls back for none', () => {
  const det = readFileSync('src/routes/ExerciseDetail.svelte', 'utf8');
  const en = JSON.parse(readFileSync('src/i18n/en.json', 'utf8'));
  const fn = det.slice(det.indexOf('async function removeExercise'), det.indexOf('export let params'));
  assert.match(fn, /history\.length/);
  assert.match(fn, /delete_msg_used/);
  assert.match(fn, /confirm\.delete_msg'/);
  const c = en.exercise_detail.confirm;
  assert.match(c.delete_msg_used, /\{count, plural, one \{# workout\} other \{# workouts\}\}/);
  assert.ok(c.delete_msg);
  assert.match(fn, /delete_msg_many/);
  assert.match(fn, /HISTORY_CAP/);
  assert.match(c.delete_msg_used, /\{count, plural/);
  assert.match(c.delete_msg_many, /\{count\}\+/);
  assert.match(c.delete_msg_used, /break/);
  // Local historyFor caps at 50; the UI cap must match.
  assert.match(det, /HISTORY_CAP = 50/);
  assert.match(readFileSync('src/lib/api-native.js', 'utf8'), /ORDER BY date DESC LIMIT 50/);
});
