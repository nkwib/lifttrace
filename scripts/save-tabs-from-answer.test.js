/**
 * After a save the Diary's tab strip takes the saved workout's answer in
 * place instead of reading the day's list again: one request less per set
 * logged. A new workout, or a save queued offline, still reads the list.
 *
 * These run the real store (src/stores/workout.js) with its API module
 * swapped for an in-memory one that records each request.
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

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-20';
let rows = [];
let requests = [];
let inFlight = 0;
let maxInFlight = 0;
// How long the next PUTs take, in order (then 20ms each).
let putDelays = [];
async function call(name, ms, fn) {
  requests.push(name);
  inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
  await wait(ms);
  try { return fn(); } finally { inFlight--; }
}
globalThis.__ltApi = {
  getWorkout: (d, id = null) => call('GET', 20, () => {
    const w = id != null ? rows.find(r => r.id === id) : rows[0];
    return { workout: w ? structuredClone(w) : null };
  }),
  getWorkoutSessions: () => call('GET sessions', 20, () => ({ sessions: structuredClone(rows) })),
  getMyPrescriptionForDate: async () => null,
  // Written as it arrives, the request's copy of each set it says it changed.
  saveWorkout: (d, body) => call('PUT', putDelays.shift() ?? 20, () => {
    let row = rows.find(r => r.id === body.id);
    if (!row) { row = { id: 100 + rows.length, date: d, exercises: [] }; rows.push(row); }
    const changed = body.changed_uuids?.sets;
    row.exercises = body.exercises.map(ex => {
      const mine = row.exercises.find(e => e.uuid === ex.uuid);
      if (!changed || !mine) return structuredClone(ex);
      return { ...mine, sets: ex.sets.map(s => (changed[ex.uuid] || []).includes(s.uuid) ? structuredClone(s) : mine.sets.find(m => m.uuid === s.uuid) || structuredClone(s)) };
    });
    row.name = body.name;
    row.completed = body.completed ? 1 : 0;
    return { workout: structuredClone(row) };
  }),
};
globalThis.window = new EventTarget();
const { get } = await import('svelte/store');
const store = await import('../src/stores/workout.js');

async function day(n = 1) {
  rows = Array.from({ length: n }, (_, i) => ({
    id: i + 1, date: DAY, name: `W${i + 1}`, completed: 0,
    exercises: [{ uuid: `e${i}`, exercise_id: 1, sets: [0, 1, 2].map(k => ({ uuid: `s${i}${k}`, reps: 8, weight: 60, completed: false })) }],
  }));
  await store.loadWorkout(DAY);
  await wait(50);
  requests = []; maxInFlight = 0; putDelays = [];
}
function tick(set, done = true, change = {}) {
  const w = structuredClone(get(store.todayLog));
  w.exercises[0].sets[set].completed = done;
  return store.saveWorkout(DAY, { ...w, ...change });
}

test('the saved workout\'s tab takes its answer without reading the list again', async () => {
  await day(2);
  await store.loadWorkoutSessions(DAY);
  requests = [];
  await tick(0, true, { name: 'Push', completed: true });
  await wait(50);
  assert.deepEqual(requests, ['GET', 'PUT']);
  const tabs = get(store.todaySessions);
  assert.deepEqual(tabs.map(s => [s.id, s.name, !!s.completed]), [[1, 'Push', true], [2, 'W2', false]]);
});

test('a new workout\'s first save still reads the list', async () => {
  rows = [];
  await store.loadWorkout(DAY);
  await wait(50);
  requests = [];
  await store.saveWorkout(DAY, { name: 'New', exercises: [{ exercise_id: 1, sets: [{ reps: 5, weight: 100, completed: true }] }] });
  await wait(50);
  assert.deepEqual(requests, ['GET', 'PUT', 'GET sessions']);
  assert.deepEqual(get(store.todaySessions).map(s => s.name), ['New']);
});

