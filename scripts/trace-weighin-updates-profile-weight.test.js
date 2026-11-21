/** Trace log_body_stat adopts a today's weight as the profile weight. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/aiTools.js', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('async function _logBodyStat'), src.indexOf('// A setting the planner reads'));

test('wiring: adopt runs after the PUT, weight only, failure absorbed', () => {
  assert.match(src, /import \{ adoptLoggedWeight \} from '\.\/profile-weight\.js'/);
  const put = fn.indexOf('await _put(');
  const adopt = fn.indexOf('adoptLoggedWeight(');
  assert.ok(put > -1 && adopt > put);
  assert.match(fn, /if \(key === 'weight'\) \{\s*try \{ await adoptLoggedWeight\(d, n, _defaultUnit\('weight'\)\); \} catch/);
});

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
store.set('wl_weightUnit', JSON.stringify('kg'));

test('behaviour: weight tool call still succeeds and saves', async () => {
  const { runTool, forgetToolReads } = await import('../src/lib/aiTools.js');
  forgetToolReads();
  const calls = [];
  globalThis.fetch = async (path, opts = {}) => {
    calls.push({ path, method: opts.method || 'GET' });
    return { ok: true, json: async () => ({}) };
  };
  const r = await runTool('log_body_stat', { stat: 'weight', value: 80 });
  assert.equal(r.stat, 'weight');
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 1);
});
