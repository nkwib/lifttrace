// Wiring test: Android Local Settings.clearData must mirror the server's
// clear-data (cardio_log + workout_tombstones), scoped to ME.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/api-native.js', import.meta.url), 'utf8');
const m = src.match(/async clearData\(\) \{([\s\S]*?)\n  \},/);

test('Local clearData deletes cardio and workout tombstones for ME', () => {
  assert.ok(m, 'clearData body found');
  const body = m[1];
  assert.match(body, /DELETE FROM cardio_log WHERE user_id = \?`, \[ME\]/);
  assert.match(body, /DELETE FROM workout_tombstones WHERE user_id = \?`, \[ME\]/);
  assert.doesNotMatch(body, /programs/);
});
