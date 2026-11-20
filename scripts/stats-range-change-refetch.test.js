// A range chip tap reloads only the range-bound stats; the base set (recent
// workouts, records, streaks, excused and cardio days) loads on mount, sync
// and Track Cardio change. Progress loads once, from its own statement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const page = fs.readFileSync(path.join(__dirname, '..', 'src/routes/Statistics.svelte'), 'utf8');
const fn = (name) => {
  const i = page.indexOf(`async function ${name}(`);
  assert.ok(i > 0, name);
  return page.slice(i, page.indexOf('\n  }\n', i));
};

test('range loader does not fetch the base set', () => {
  const r = fn('loadRangeData');
  assert.doesNotMatch(r, /workout\/recent|listExcusedDays|getRecords|getStreaks/);
  assert.match(r, /loadBodyWeights/);
});

test('recent workouts: one fetch helper, base and wide loaders use it, range loader never', () => {
  assert.match(fn('loadBaseData'), /fetchRecentLogs\(365\)/);
  assert.match(fn('loadWideData'), /fetchRecentLogs\(limit\)/);
  assert.doesNotMatch(fn('loadRangeData'), /fetchRecentLogs|workout\/recent/);
  assert.equal(page.split('/api/workout/recent').length - 1, 1);
  assert.doesNotMatch(page, /limit=365/);
});

test('wide loader has its own seq guard and does not touch base state', () => {
  const w = fn('loadWideData');
  assert.match(w, /_wideSeq/);
  assert.doesNotMatch(w, /_baseSeq|loadStart|recentWorkouts\s*=/);
  assert.match(page, /\$: range, \$cardioEnabled, loadWideData\(\);/);
  assert.match(page, /loadWideData\(true\)/);
});

test('range change triggers only the range loader', () => {
  assert.match(page, /\$: range, \$cardioEnabled, \$weekStartsOn, loadRangeData\(\);/);
  assert.match(page, /\$: \$cardioEnabled, loadBaseData\(\);/);
  assert.doesNotMatch(page, /\$: range, loadData\(\)/);
});

test('loaders do not call loadProgress; only the wrapper and the reactive statement do', () => {
  assert.doesNotMatch(fn('loadRangeData'), /loadProgress/);
  assert.doesNotMatch(fn('loadBaseData'), /loadProgress/);
  assert.match(page, /function loadData\(\) \{[\s\S]*?loadRangeData\(\);[\s\S]*?loadBaseData\(\);[\s\S]*?loadProgress\(\)/);
  assert.match(page, /\$: selectedExerciseId, range, metric === 'progress' && loadProgress\(\);/);
});

test('loading div only before the first load; later loads dim the content', () => {
  assert.match(page, /\{#if !loadedOnce\}\s*<div class="loading">/);
  assert.match(page, /class:reloading=\{loading\}/);
});

test('one toast when both loaders fail', () => {
  assert.match(page, /if \(failed && !other\) showError/);
});
