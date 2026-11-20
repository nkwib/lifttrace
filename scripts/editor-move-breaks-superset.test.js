import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moveBlock, canMove } from '../src/lib/editor-order.js';

const ss = (n, id, pos, size = 2, extra = {}) => ({ exercise_name: n, uuid: 'u' + n, superset_id: id, superset_size: size, superset_position: pos, ...extra });
const names = (a) => a.map(e => e.exercise_name).join('');
const base = () => [ss('A', 's1', 0), ss('B', 's1', 1), { exercise_name: 'C', uuid: 'uC' }];

test('standalone jumps up over a whole superset', () => {
  const r = moveBlock(base(), 2, -1);
  assert.equal(names(r), 'CAB');
  assert.equal(r[1].superset_position, 0);
  assert.equal(r[2].superset_position, 1);
});

test('standalone jumps down over a whole superset', () => {
  const arr = [{ exercise_name: 'C' }, ss('A', 's1', 0), ss('B', 's1', 1)];
  assert.equal(names(moveBlock(arr, 0, 1)), 'ABC');
});

test('member edges: first cannot go up, last cannot go down', () => {
  const arr = base();
  assert.equal(canMove(arr, 0, -1), false);
  assert.equal(canMove(arr, 1, 1), false);
  assert.equal(moveBlock(arr, 0, -1), arr);
  assert.equal(moveBlock(arr, 1, 1), arr);
});

test('in-group swap updates positions, keeps uuids, does not mutate input', () => {
  const arr = base();
  const snap = JSON.stringify(arr);
  const r = moveBlock(arr, 1, -1);
  assert.equal(names(r), 'BAC');
  assert.deepEqual(r.map(e => e.superset_position), [0, 1, undefined]);
  assert.deepEqual(r.map(e => e.uuid), ['uB', 'uA', 'uC']);
  assert.equal(JSON.stringify(arr), snap);
});

test('list ends are no-ops', () => {
  const arr = [{ exercise_name: 'X' }, { exercise_name: 'Y' }];
  assert.equal(moveBlock(arr, 0, -1), arr);
  assert.equal(moveBlock(arr, 1, 1), arr);
  assert.equal(names(moveBlock(arr, 0, 1)), 'YX');
});

test('stale size<=1 superset id is standalone; legacy no-uuid ok', () => {
  const arr = [{ exercise_name: 'A', superset_id: 's', superset_size: 1 }, { exercise_name: 'B' }];
  assert.equal(names(moveBlock(arr, 1, -1)), 'BA');
});

test('non-contiguous legacy group does not throw', () => {
  const arr = [ss('A', 's1', 0), { exercise_name: 'C' }, ss('B', 's1', 1)];
  assert.equal(canMove(arr, 0, 1), false);
  assert.equal(names(moveBlock(arr, 1, -1)), 'CAB');
});

test('editor wires moveBlock/canMove everywhere', () => {
  const src = readFileSync(new URL('../src/routes/WorkoutEditor.svelte', import.meta.url), 'utf8');
  assert.match(src, /function moveUp\(idx\)/);
  assert.match(src, /value: 'move_down'/);
  assert.equal((src.match(/canMove\(exercises, idx, -?1\)/g) || []).length >= 6, true);
  assert.doesNotMatch(src, /\{#if idx > 0\}/);
});
