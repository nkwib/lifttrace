// Programs and Exercises show a retry state when the first read fails,
// not the "no programs yet" / "library is empty" empty state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/routes/${f}`, import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));

for (const [file, list, emptyBranch] of [
  ['Programs.svelte', 'programs', '{:else if programs.length === 0}'],
  ['Exercises.svelte', 'exercises', '{:else if filtered.length === 0}'],
]) {
  test(`${file}: error branch precedes the empty branch and retries`, () => {
    const s = src(file);
    const err = s.indexOf(`{:else if loadError && ${list}.length === 0}`);
    assert.ok(err > 0, 'error branch only when the list is empty');
    assert.ok(err < s.indexOf(emptyBranch), 'error branch before empty state');
    assert.match(s.slice(err, s.indexOf(emptyBranch)), /sync\.retry/);
    assert.match(s, /loadError = ''/, 'cleared on success');
    assert.match(s, /loadError = e\.message/, 'set in catch');
  });
}

test('Programs: retry calls load, sync reload is quiet', () => {
  const s = src('Programs.svelte');
  assert.match(s, /on:click=\{\(\) => load\(\)\}/);
  assert.match(s, /load\(true\)/);
  assert.match(s, /if \(!quiet\) loading = true/);
});

test('Exercises: shared loadExercises, no empty catch after import/save/sync', () => {
  const s = src('Exercises.svelte');
  assert.match(s, /async function loadExercises\(/);
  assert.equal((s.match(/getExercises\(\)/g) || []).length, 2, 'loadExercises plus syncWger');
  assert.ok(!/getExercises\(\)[^\n]*catch\s*\{\s*\}/.test(s), 'no swallowed read');
  assert.match(s, /loadExercises\(true\)/, 'user actions speak on failure');
  assert.match(s, /exercises_page\.refresh_failed/);
});

test('literals moved to en.json', () => {
  for (const [f, lits] of [
    ['Programs.svelte', ['Loading programs', 'Create a training program']],
    ['Exercises.svelte', ['Loading exercises', 'Your library is empty', 'No exercises match', 'Clear filters']],
    ['ExerciseDetail.svelte', ['Loading exercise', "Log this in today's workout", '} sessions</span>']],
  ]) for (const l of lits) assert.ok(!src(f).includes(l), `${f} still has "${l}"`);
  for (const k of ['loading', 'load_failed', 'empty_desc']) assert.ok(en.programs[k], `programs.${k}`);
  for (const k of ['loading', 'load_failed', 'refresh_failed', 'library_empty', 'no_match', 'clear_filters']) assert.ok(en.exercises_page[k], `exercises_page.${k}`);
  for (const k of ['loading', 'log_today', 'sessions_count']) assert.ok(en.exercise_detail[k], `exercise_detail.${k}`);
  assert.ok(en.sync.retry);
});
