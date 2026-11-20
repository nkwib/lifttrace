import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reinsertExercises } from '../src/lib/undoRemove.js';

const mk = (n, extra = {}) => ({ uuid: 'u' + n, exercise_name: n, sets: [{ uuid: 's' + n }], ...extra });
const removed = [
  { ex: mk('b', { superset_id: 'g', superset_size: 2 }), idx: 1 },
  { ex: mk('d', { superset_id: 'g', superset_size: 2 }), idx: 3 },
];

test('reinsertExercises restores order, keeps superset link, fresh uuids', () => {
  const out = reinsertExercises([mk('a'), mk('c'), mk('e')], removed);
  assert.deepEqual(out.map(e => e.exercise_name), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(out[1].superset_id, 'g');
  assert.equal(out[3].superset_size, 2);
  assert.notEqual(out[1].uuid, 'ub');
  assert.notEqual(out[1].sets[0].uuid, 'sb');
});
test('reinsertExercises tolerates short, empty and no removed', () => {
  assert.equal(reinsertExercises([mk('a')], removed).length, 3);
  assert.equal(reinsertExercises([], removed).length, 2);
  assert.equal(reinsertExercises([mk('a')], []).length, 1);
});
test('wiring: removeSuperset offers a guarded Undo', () => {
  const d = readFileSync(new URL('../src/routes/Diary.svelte', import.meta.url), 'utf8');
  assert.match(d, /reinsertExercises\(cur, removed\)/);
});
