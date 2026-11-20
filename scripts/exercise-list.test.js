import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foldText } from '../src/lib/search-text.js';
import { filterExercises, groupExercises, capGroups, makeComparator } from '../src/lib/exercise-list.js';

const ex = (id, name, category = 'chest') => ({ id, name, category, equipment: [] });

test('accent-folded search', () => {
  const list = [ex(1, 'Crème Press'), ex(2, 'Squat')];
  assert.deepEqual(filterExercises(list, { q: foldText('creme') }).map(e => e.id), [1]);
  assert.equal(filterExercises(list, { q: '' }).length, 2);
});

test('favorites first, then alpha', () => {
  const list = [ex(1, 'B'), ex(2, 'A'), ex(3, 'C')];
  const g = groupExercises(list, { sortMode: 'alpha', favorites: [3], usage: {} });
  assert.deepEqual(g.chest.map(e => e.id), [3, 2, 1]);
});

test('used and recent match the old comparator, input not mutated', () => {
  const list = [ex(1, 'A'), ex(2, 'B'), ex(3, 'C')];
  const copy = [...list];
  const usage = { 1: { count: 1, last_date: '2024-01-01' }, 2: { count: 5, last_date: '2024-03-01' }, 3: { count: 5, last_date: '2024-02-01' } };
  assert.deepEqual(groupExercises(list, { sortMode: 'used', usage })[''].map(e => e.id), [2, 3, 1]);
  // recent keeps the historical `lb < la ? -1 : 1` direction (newest first)
  assert.deepEqual(groupExercises(list, { sortMode: 'recent', usage })[''].map(e => e.id), [2, 3, 1]);
  assert.deepEqual(list, copy);
  assert.equal(makeComparator({ sortMode: 'alpha' })(list[0], list[1]) < 0, true);
});

test('cap spans groups, no orphan headers, keepId survives', () => {
  const g = { a: [ex(1, 'a1'), ex(2, 'a2')], b: [ex(3, 'b1')], c: [ex(4, 'c1')] };
  assert.deepEqual(Object.keys(capGroups(g, 2)), ['a']);
  assert.deepEqual(Object.keys(capGroups(g, 3)), ['a', 'b']);
  assert.deepEqual(Object.keys(capGroups(g, 2, 4)), ['a', 'c']);
  assert.equal(Object.keys(capGroups(g, 100)).length, 3);
});

test('Exercises.svelte wiring', () => {
  const s = readFileSync(new URL('../src/routes/Exercises.svelte', import.meta.url), 'utf8');
  assert.match(s, /\$: _q = foldText\(search\)/);
  assert.doesNotMatch(s, /exs\.sort\(/);
  assert.match(s, /show_more/);
});
