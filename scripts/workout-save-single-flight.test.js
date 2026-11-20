/**
 * Diary saves go up one at a time.
 *
 * A save is a read of the workout and then the write. With a slow server, a
 * set ticked while the last one's save was still on its way started a second
 * save alongside it, and the two could reach the server in the other order:
 * a set ticked and then unticked came back ticked. Now a save that comes due
 * while another is on its way waits for it, and every one that comes due
 * meanwhile goes up as one save of the latest.
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
const serverSets = (id = 1) => rows.find(r => r.id === id).exercises[0].sets.map(s => s.completed);

test('a set ticked then unticked while the first save is slow stays unticked', async () => {
  await day();
  putDelays = [600, 20];
  const a = tick(0, true);
  await wait(400); // the first save is on its way
  const b = tick(0, false);
  await Promise.all([a, b]);
  await wait(50);
  assert.deepEqual(serverSets(), [false, false, false], 'the later change is the one kept');
  assert.equal(maxInFlight, 1, 'never two requests at once');
  assert.deepEqual(get(store.todayLog).exercises[0].sets.map(s => s.completed), [false, false, false]);
});

test('saves coming due while one is on its way go up as one save of the latest', async () => {
  await day();
  putDelays = [1500];
  const done = [];
  for (let i = 0; i < 3; i++) { done.push(tick(i)); await wait(400); }
  const answers = await Promise.all(done);
  await wait(50);
  assert.deepEqual(requests.filter(r => r !== 'GET sessions'), ['GET', 'PUT', 'GET', 'PUT'], 'two saves, not three');
  assert.equal(maxInFlight, 1);
  assert.deepEqual(serverSets(), [true, true, true]);
  for (const w of answers) assert.equal(w.id, 1, 'every caller is answered with the saved workout');
  assert.deepEqual(answers[1].exercises[0].sets.map(s => s.completed), [true, true, true], 'the waiting ones with the save that carried them');
});

test('a flush while a save waits behind another sends the latest once', async () => {
  await day();
  putDelays = [800];
  const a = tick(0);
  await wait(400); // a's save is on its way
  const b = tick(1);
  await wait(400); // b's timer fired: it waits behind a's
  await store.flushWorkoutSave(DAY);
  await Promise.all([a, b]);
  await wait(50);
  assert.equal(requests.filter(r => r === 'PUT').length, 2, 'b went up once, by the flush');
  assert.deepEqual(serverSets(), [true, true, false]);
});

test('settlePendingSave waits for a save waiting behind another', async () => {
  await day();
  putDelays = [800, 300];
  tick(0);
  await wait(400);
  tick(1);
  await wait(400); // waiting behind the first
  await store.settlePendingSave(DAY);
  assert.deepEqual(serverSets(), [true, true, false], 'both on the server by then');
});
