import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/routes/Diary.svelte', import.meta.url), 'utf8');
const start = src.indexOf('// Only what the sync touched');
const tail = src.slice(start, src.indexOf('\n  }\n', start));

test('empty-pull early return is untouched', () => {
  assert.match(src, /if \(e\?\.detail\?\.changed === false\) \{[\s\S]*?loadSuggestedPrescriptions\(\);\s*return;\s*\}/);
});
test('date rows and prev bests are gated on sync kinds', () => {
  assert.ok(start > 0);
  assert.match(tail, /if \(syncTouched\(e\?\.detail, \['workouts', 'excusedDays'\]\)\) loadDateRows\(\);/);
  assert.match(tail, /if \(syncTouched\(e\?\.detail, \['workouts', 'exercises'\]\)\) loadPrevBests\(\);/);
});
test('cardio and prescriptions stay ungated; feedback ungated before the gates', () => {
  assert.match(tail, /^\s*loadCardio\(\);/m);
  assert.match(tail, /^\s*loadSuggestedPrescriptions\(\);/m);
  assert.match(src, /^\s*loadUnreadFeedback\(\);\n\s*\/\/ Only what the sync touched/m);
});
test('loadWorkoutDates still reads both for other callers', () => {
  assert.match(src, /async function loadWorkoutDates\(\) \{\s*await Promise\.all\(\[loadDateRows\(\), loadCardio\(\)\]\);/);
});
