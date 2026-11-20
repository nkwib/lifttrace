/**
 * getWorkoutHistory: concurrent reads for one exercise share a request.
 * Callers (Diary, ExerciseCard, ...) only read the result, none mutate it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const { LtApi } = await import('../src/lib/api.js');

function stub() {
  const calls = [];
  globalThis.fetch = (url, o) => new Promise((resolve, reject) => {
    calls.push({ url, method: o?.method || 'GET', resolve: (body) => resolve({ ok: true, status: 200, json: async () => body }), reject });
  });
  return calls;
}
const tick = () => new Promise((r) => setImmediate(r));
const hist = (calls) => calls.filter((c) => c.url.includes('history')).length;

test('concurrent calls share one fetch; a call after settle refetches', async () => {
  const calls = stub();
  const a = LtApi.getWorkoutHistory(5), b = LtApi.getWorkoutHistory('5'), c = LtApi.getWorkoutHistory(5);
  assert.equal(calls.length, 1);
  calls[0].resolve([{ x: 1 }]);
  assert.deepEqual(await a, [{ x: 1 }]);
  assert.equal(await b, await c);
  await tick();
  const d = LtApi.getWorkoutHistory(5);
  assert.equal(calls.length, 2);
  calls[1].resolve([]);
  await d;
});

test('different exercises are not merged', async () => {
  const calls = stub();
  const a = LtApi.getWorkoutHistory(1), b = LtApi.getWorkoutHistory(2);
  assert.equal(calls.length, 2);
  calls[0].resolve([]); calls[1].resolve([]);
  await Promise.all([a, b]);
});

test('a rejection is not cached', async () => {
  const calls = stub();
  const a = LtApi.getWorkoutHistory(7);
  calls[0].reject(new Error('net'));
  await assert.rejects(a);
  await tick();
  const b = LtApi.getWorkoutHistory(7);
  assert.equal(calls.length, 2);
  calls[1].resolve([]);
  await b;
});

test('a save between calls prevents joining the stale in-flight read', async () => {
  const calls = stub();
  const a = LtApi.getWorkoutHistory(9);
  const s = LtApi.saveWorkout('2026-01-01', {});
  const b = LtApi.getWorkoutHistory(9);
  assert.equal(hist(calls), 2);
  calls.forEach((c) => c.resolve({}));
  await Promise.all([a, s, b]);
});

test('a delete between calls prevents joining too', async () => {
  const calls = stub();
  const a = LtApi.getWorkoutHistory(9);
  const s = LtApi.deleteWorkout('2026-01-01');
  const b = LtApi.getWorkoutHistory(9);
  assert.equal(hist(calls), 2);
  calls.forEach((c) => c.resolve({}));
  await Promise.all([a, s, b]);
});
