/**
 * loadWorkout: a stale or failed load must not wipe what the latest one shows.
 * Runs the real store with its API module swapped for a controllable one.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

const STUB = `export const LtApi = globalThis.__ltApi;`;
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === '../lib/api.js' && context.parentURL?.endsWith('/src/stores/workout.js')) {
      return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(STUB)}), shortCircuit: true };
    }
    return next(specifier, context);
  }`), import.meta.url);

const pending = new Map(); // date -> { resolve, reject } of the latest call
globalThis.__ltApi = {
  getWorkout(date) {
    return new Promise((resolve, reject) => pending.set(date, { resolve, reject }));
  },
  async getWorkoutSessions() { return { sessions: [] }; },
  async getMyPrescriptionForDate() { return null; },
};
globalThis.window = new EventTarget();
const { get } = await import('svelte/store');
const store = await import('../src/stores/workout.js');
const tick = () => new Promise(r => setTimeout(r, 0));
const w = (id, date) => ({ id, date, exercises: [], updated_at: '2026-10-07 08:00:00' });

test('an older load failing after a newer one resolved keeps the newer', async () => {
  const a = store.loadWorkout('2026-10-01');
  const pa = pending.get('2026-10-01');
  const b = store.loadWorkout('2026-10-02');
  pending.get('2026-10-02').resolve({ workout: w(7, '2026-10-02') });
  await b;
  pa.reject(new Error('offline'));
  await a;
  assert.equal(get(store.todayLog)?.id, 7);
  assert.equal(get(store.currentSessionId), 7);
  assert.equal(get(store.currentDate), '2026-10-02');
});

test('a lone failing load still clears the stores', async () => {
  store.showWorkout('2026-10-03', w(9, '2026-10-03'));
  const a = store.loadWorkout('2026-10-03');
  pending.get('2026-10-03').reject(new Error('boom'));
  await a;
  assert.equal(get(store.todayLog), null);
  assert.equal(get(store.currentSessionId), null);
});

test('an _epoch bump from another action during a pending load still applies it', async () => {
  const a = store.loadWorkout('2026-10-04');
  await tick();
  store.showWorkout('2026-10-04', w(1, '2026-10-04')); // bumps _epoch, not _loadSeq
  pending.get('2026-10-04').resolve({ workout: w(11, '2026-10-04') });
  await a;
  assert.equal(get(store.todayLog)?.id, 11);
});

test('a sessionId restore load issued last wins over an earlier one', async () => {
  const a = store.loadWorkout('2026-10-05');
  const pa = pending.get('2026-10-05');
  const b = store.loadWorkout('2026-10-05', { sessionId: 22 });
  const pb = pending.get('2026-10-05');
  assert.notEqual(pa, pb);
  pa.resolve({ workout: w(21, '2026-10-05') });
  await a;
  assert.notEqual(get(store.todayLog)?.id, 21, 'stale load does not apply');
  pb.resolve({ workout: w(22, '2026-10-05') });
  await b;
  assert.equal(get(store.todayLog)?.id, 22);
});
