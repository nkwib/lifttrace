import assert from 'node:assert/strict';
import test from 'node:test';
import { createRanRecently, pruneMarkers } from '../server/lib/sched-dedupe.js';

const memStore = () => {
  const m = new Map();
  return { m, get: (k) => m.get(k), set: (k, v) => m.set(k, v) };
};

test('dedupe persists across a fresh cache on the same store', () => {
  const store = memStore();
  let t = 1000;
  const a = createRanRecently(store, () => t);
  assert.equal(a(5, 'weeklySummary', 60000), false);
  assert.equal(a(5, 'weeklySummary', 60000), true);
  const b = createRanRecently(store, () => t + 1000); // "restart"
  assert.equal(b(5, 'weeklySummary', 60000), true);
  assert.equal(b(6, 'weeklySummary', 60000), false);
  t += 61000;
  const c = createRanRecently(store, () => t);
  assert.equal(c(5, 'weeklySummary', 60000), false);
});

test('null user maps to sched:0 and a throwing store never throws', () => {
  const store = memStore();
  createRanRecently(store, () => 1)(null, 'x', 10);
  assert.ok(store.m.has('sched:0:x'));
  const bad = { get() { throw new Error('x'); }, set() { throw new Error('x'); } };
  const r = createRanRecently(bad, () => 1);
  assert.equal(r(1, 't', 10), false);
  assert.equal(r(1, 't', 10), true);
});

test('pruneMarkers deletes only old sched rows', () => {
  const calls = [];
  const db = { prepare: (sql) => ({ run: (...a) => calls.push([sql, a]) }) };
  pruneMarkers(db, 10 * 24 * 3600000);
  assert.match(calls[0][0], /sched:%/);
  assert.equal(calls[0][1][0], 3 * 24 * 3600000);
});
