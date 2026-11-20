/**
 * Trace log_body_stat / get_body_stats use the app's stored shape: plain
 * numbers under the allowlisted keys (bodyFat, not body_fat).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

// The app reads its units from localStorage (db.js).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
const setUnit = (u) => store.set('wl_weightUnit', JSON.stringify(u));

const { runTool, TOOLS, forgetToolReads } = await import('../src/lib/aiTools.js');
const { BODY_STAT_KEYS } = await import('../src/lib/workout-merge.js');

function stubApi(routes) {
  forgetToolReads();
  const calls = [];
  globalThis.fetch = async (path, opts = {}) => {
    calls.push({ path, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    for (const [match, handler] of routes) {
      if (path.startsWith(match)) return { ok: true, json: async () => handler };
    }
    return { ok: true, json: async () => ({}) };
  };
  return calls;
}
const puts = (calls) => calls.filter((c) => c.method === 'PUT');

test('body_fat aliases to bodyFat and is stored as a plain number', async () => {
  for (const alias of ['body_fat', 'bodyfat', 'Body Fat', 'body-fat', 'bodyFat']) {
    const calls = stubApi([]);
    const r = await runTool('log_body_stat', { stat: alias, value: 15 });
    assert.deepEqual(puts(calls)[0].body, { stats: { bodyFat: 15 } }, alias);
    assert.equal(r.stat, 'bodyFat');
    assert.equal(r.unit, '%');
  }
});

test('weight is a plain number, labelled with the weight unit', async () => {
  for (const u of ['lbs', 'kg']) {
    setUnit(u);
    const calls = stubApi([]);
    const r = await runTool('log_body_stat', { stat: 'weight', value: 182, unit: 'kg', note: 'x' });
    assert.deepEqual(puts(calls)[0].body, { stats: { weight: 182 } });
    assert.equal(r.unit, u);
    const w = await runTool('log_body_stat', { stat: 'waist', value: 80 });
    assert.equal(w.unit, u === 'kg' ? 'cm' : 'in');
  }
});

test('singular names map to the stored plural keys', async () => {
  const calls = stubApi([]);
  await runTool('log_body_stat', { stat: 'Thigh', value: 60 });
  assert.deepEqual(puts(calls)[0].body, { stats: { thighs: 60 } });
});

test('unknown stat throws with the valid keys; bad values are refused', async () => {
  const calls = stubApi([]);
  await assert.rejects(runTool('log_body_stat', { stat: 'foo', value: 1 }), /Unknown stat foo; valid: .*bodyFat/);
  await assert.rejects(runTool('log_body_stat', { stat: 'bodyFat', value: 150 }), /between/);
  await assert.rejects(runTool('log_body_stat', { stat: 'weight', value: -3 }), /between/);
  assert.equal(puts(calls).length, 0);
});

test('schema enum is the app key list, without unit or note', () => {
  const t = TOOLS.find((x) => x.name === 'log_body_stat');
  assert.deepEqual(t.parameters.properties.stat.enum, [...BODY_STAT_KEYS]);
  assert.equal(t.parameters.properties.unit, undefined);
  assert.equal(t.parameters.properties.note, undefined);
});

test('get_body_stats reads plain and legacy rows as numbers with units', async () => {
  setUnit('kg');
  stubApi([['/api/body-stats/range', [
    { date: '2026-01-01', stats: { bodyFat: 15, weight: { value: 80, unit: 'kg' } } },
  ]]]);
  const r = await runTool('get_body_stats', { date_from: '2026-01-01', date_to: '2026-01-02' });
  const by = Object.fromEntries(r.series.map((s) => [s.stat, s]));
  assert.equal(by.bodyFat.value, 15);
  assert.equal(by.bodyFat.unit, '%');
  assert.equal(by.weight.value, 80);
  assert.equal(by.weight.unit, 'kg');
});

test('get_body_stats stat filter accepts body_fat', async () => {
  stubApi([['/api/body-stats/range', [{ date: '2026-01-01', stats: { bodyFat: 15, weight: 80 } }]]]);
  const r = await runTool('get_body_stats', { stat: 'body_fat', date_from: '2026-01-01', date_to: '2026-01-02' });
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].stat, 'bodyFat');
});
