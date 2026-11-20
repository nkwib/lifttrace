import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeEntries } from '../src/lib/workout-merge.js';
import { reinsertSet, reinsertExercise } from '../src/lib/undoRemove.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('reinsertSet restores original index', () => {
  const sets = [{ uuid: 'a', n: 'a' }, { uuid: 'c', n: 'c' }];
  assert.deepEqual(reinsertSet(sets, { uuid: 'b', n: 'b' }, 1).map(s => s.n), ['a', 'b', 'c']);
});
test('reinsertSet clamps index', () => {
  assert.deepEqual(reinsertSet([{ n: 'a' }], { n: 'b' }, 9).map(s => s.n), ['a', 'b']);
  assert.deepEqual(reinsertSet([{ n: 'a' }], { n: 'b' }, -3).map(s => s.n), ['b', 'a']);
});
test('reinsertSet mints a fresh uuid', () => {
  const out = reinsertSet([{ uuid: 'a' }], { uuid: 'b', reps: 5 }, 1);
  assert.notEqual(out[1].uuid, 'b');
  assert.ok(out[1].uuid);
  assert.equal(out[1].reps, 5);
});
test('reinsertSet works without uuid', () => {
  assert.equal(reinsertSet([{ r: 1 }, { r: 3 }], { r: 2 }, 1)[1].r, 2);
  assert.equal(reinsertSet([{ r: 1 }], { r: 2 }, undefined)[1].r, 2);
});
test('reinsertExercise restores at idx, fresh uuids, clears orphaned superset', () => {
  const cur = [{ uuid: 'x' }, { uuid: 'z' }];
  const r = reinsertExercise(cur, { uuid: 'y', sets: [{ uuid: 's1' }] }, 1);
  assert.deepEqual([r[0].uuid, r[2].uuid], ['x', 'z']);
  assert.notEqual(r[1].uuid, 'y');
  assert.notEqual(r[1].sets[0].uuid, 's1');
  const o = reinsertExercise(cur, { uuid: 'y', superset_id: 's', superset_size: 2 }, 0)[0];
  assert.equal(o.superset_id, undefined);
  assert.equal(o.superset_size, undefined);
  const kept = reinsertExercise([{ uuid: 'p', superset_id: 's' }], { uuid: 'y', superset_id: 's' }, 0)[0];
  assert.equal(kept.superset_id, 's');
});

test('wiring: toast action, card event, diary undo', () => {
  assert.match(read('src/stores/toast.js'), /action/);
  assert.match(read('src/components/ui/Toast.svelte'), /toast-action/);
  assert.match(read('src/components/diary/ExerciseCard.svelte'), /dispatch\('removed'/);
  assert.match(read('src/components/diary/SupersetCard.svelte'), /on:removed/);
  const d = read('src/routes/Diary.svelte');
  assert.match(d, /on:removed=\{onSetRemoved\}/);
  assert.match(d, /reinsertExercise/);
  assert.match(d, /\$currentDate !== date/);
  const en = JSON.parse(read('src/i18n/en.json'));
  assert.ok(en.common.undo && en.diary.toast.set_removed && en.diary.toast.exercise_removed);
});

test('undone set/exercise survives mergeEntries with the removal tombstone', () => {
  const set = { uuid: 's1', reps: 5 };
  const sets = reinsertSet([], set, 0);
  // server already holds s1 as tombstoned from the removal save
  assert.equal(mergeEntries([], sets, [], ['s1']).merged.length, 1);
  assert.equal(mergeEntries([], [set], [], ['s1']).merged.length, 0); // old behaviour
  const exs = reinsertExercise([], { uuid: 'e1', sets: [set] }, 0);
  assert.equal(mergeEntries([], exs, [], ['e1']).merged.length, 1);
});

test('wiring: exercise undo is session-scoped', () => {
  const d = read('src/routes/Diary.svelte');
  assert.ok((d.match(/\$todayLog\.id !== logId/g) || []).length >= 2);
});
