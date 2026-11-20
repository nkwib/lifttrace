/**
 * Trace log_set / log_workout reject bad values instead of storing 0 (parity
 * with server/lib/set-input.js). Runs the real executors on a stubbed fetch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { runTool, forgetToolReads } = await import('../src/lib/aiTools.js');
const client = await import('../src/lib/set-values.js');
const server = await import('../server/lib/set-input.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const DAY = new Date().toLocaleDateString('sv-SE');
const bench = () => ({ id: 7, date: DAY, completed: false, exercises: [{ exercise_id: 1, exercise_name: 'Bench Press', sets: [] }] });

function stubApi() {
  forgetToolReads();
  const puts = [];
  globalThis.fetch = async (path, opts = {}) => {
    const method = opts.method || 'GET';
    let body = {};
    if (method === 'PUT') {
      const sent = JSON.parse(opts.body);
      puts.push(sent);
      body = { workout: { id: 7, date: DAY, ...sent } };
    } else if (path.startsWith('/api/exercises')) body = [{ id: 1, name: 'Bench Press' }];
    else if (path.startsWith('/api/workout/recent')) body = [bench()];
    return { ok: true, json: async () => body };
  };
  return puts;
}

const logWorkout = (sets, extra = {}) => runTool('log_workout', { date: DAY, exercises: [{ name: 'Bench Press', sets, ...extra }] });
const logSet = (a) => runTool('log_set', { workout_id: 7, exercise_name: 'Bench Press', ...a });
const failed = (p, re) => assert.rejects(p, re);

test('log_workout rejects bad values naming exercise and set, and writes nothing', async () => {
  for (const [sets, re] of [
    [[{ weight: 100, reps: 5 }, { weight: 'abc', reps: 5 }], /Bench Press, set 2: weight must be a number/],
    [[{ weight: '225 lbs', reps: 5 }], /set 1: weight must be a number/],
    [[{ weight: 100, reps: 5000 }], /reps must be a whole number between 0 and 1000/],
    [[{ weight: 100, reps: 8.5 }], /reps must be a whole number/],
    [[{ weight: 100, reps: 5, rpe: 12 }], /rpe must be a number between 1 and 10/],
    [[{ weight: -5, reps: 5 }], /weight must be a number/],
    [[{ weight: 100 }], /reps is required/],
    [[], /non-empty/],
    [undefined, /non-empty/],
    ['5x5', /non-empty/],
  ]) {
    const puts = stubApi();
    await failed(logWorkout(sets), re);
    assert.equal(puts.length, 0, 'no PUT');
  }
});

test('one bad exercise aborts the whole log_workout', async () => {
  const puts = stubApi();
  const r = runTool('log_workout', { date: DAY, exercises: [
    { name: 'Bench Press', sets: [{ weight: 100, reps: 5 }] },
    { name: 'Bench Press', sets: [] },
  ] });
  await failed(r, /non-empty/);
  assert.equal(puts.length, 0);
});

test('log_workout accepts numeric strings, 8.0, omitted weight and amount sets', async () => {
  const puts = stubApi();
  const r = await logWorkout([{ weight: '225', reps: '5' }, { reps: 8.0, rpe: '8.5' }, { weight: 0, reps: 3, warmup: 'true' }]);
  assert.equal(r.error, undefined, JSON.stringify(r));
  const s = puts[0].exercises[0].sets;
  assert.deepEqual([s[0].weight, s[0].reps, s[1].weight, s[1].reps, s[1].rpe, s[2].warmup], [225, 5, 0, 8, 8.5, true]);
  const puts2 = stubApi();
  const t = await logWorkout([{ duration_sec: 60 }, { duration_sec: 45 }]);
  assert.equal(t.error, undefined, JSON.stringify(t));
  assert.equal(puts2[0].exercises[0].sets[0].reps, 0);
  assert.equal(puts2[0].exercises[0].set_type, 'time');
});

test('log_set rejects bad values, and a rep set with no reps', async () => {
  for (const [a, re] of [
    [{ weight: 'abc', reps: 5 }, /weight must be a number/],
    [{ weight: 100, reps: 5000 }, /reps must be a whole number/],
    [{ weight: 100, reps: 5, rpe: 12 }, /rpe must be a number/],
    [{ weight: 100 }, /reps is required/],
    [{ weight: 100, reps: 5, completed: 'maybe' }, /completed must be true or false/],
  ]) {
    const puts = stubApi();
    await failed(logSet(a), re);
    assert.equal(puts.length, 0);
  }
});

test('log_set valid payloads store the values', async () => {
  let puts = stubApi();
  let r = await logSet({ weight: '225', reps: '5', rpe: 9 });
  assert.equal(r.error, undefined, JSON.stringify(r));
  let set = puts[0].exercises[0].sets[0];
  assert.deepEqual([set.weight, set.reps, set.rpe], [225, 5, 9]);
  puts = stubApi();
  r = await logSet({ reps: 8.0 });
  assert.equal(r.error, undefined, JSON.stringify(r));
  set = puts[0].exercises[0].sets[0];
  assert.deepEqual([set.weight, set.reps], [0, 8]);
  puts = stubApi();
  r = await logSet({ duration_sec: 40 });
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(puts[0].exercises[0].sets[0].duration_sec, 40);
});

test('client validators match the server ones', () => {
  assert.deepEqual(client.SET_LIMITS, server.SET_LIMITS);
  const inputs = [undefined, null, '', 0, 5, 8.0, 8.5, -1, 1000, 1001, 10000, 10001, '12', ' 12 ', '225 lbs', 'abc', NaN, Infinity, true, 'true', 1e9, 10, 11, 0.5, 1];
  const run = (f, ...a) => { try { return { ok: f(...a) }; } catch (e) { return { err: e.message }; } };
  for (const n of ['Reps', 'Weight', 'Rpe']) {
    for (const v of inputs) assert.deepEqual(run(client[`normalize${n}`], v), run(server[`normalize${n}`], v), `${n} ${String(v)}`);
  }
  for (const v of [...inputs, false, 'false', 'yes', 2]) {
    assert.deepEqual(run(client.normalizeFlag, 'x', v), run(server.normalizeFlag, 'x', v), `flag ${String(v)}`);
  }
});

test('wiring: both writers call the normalizer', () => {
  const src = read('../src/lib/aiTools.js');
  assert.match(src, /async function _logWorkout[\s\S]*?normalizeSetValues\([\s\S]*?async function _logSet/);
  assert.match(src, /async function _logSet[\s\S]*?normalizeSetValues\(/);
});
