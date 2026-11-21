/**
 * A deadline that fires while the request resolves anyway (apiFetch answers
 * an aborted Trace write as a 503 "needs a connection") is trace_timed_out.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { _timed } from '../src/lib/aiChat.js';

test('fn resolving after the deadline fired still throws trace_timed_out', async () => {
  const slow = (sig) => new Promise((resolve) => {
    sig.addEventListener('abort', () => resolve({ res: { ok: false, status: 503 } }), { once: true });
  });
  await assert.rejects(_timed(undefined, slow, 20), (e) => e.code === 'trace_timed_out');
});

test('a stop that resolves fn is still an AbortError', async () => {
  const ctl = new AbortController();
  const slow = (sig) => new Promise((resolve) => {
    sig.addEventListener('abort', () => resolve('x'), { once: true });
  });
  const p = _timed(ctl.signal, slow, 1000);
  ctl.abort();
  await assert.rejects(p, (e) => e.name === 'AbortError');
});

test('a normal answer is returned', async () => {
  assert.equal(await _timed(undefined, async () => 'ok', 1000), 'ok');
});
