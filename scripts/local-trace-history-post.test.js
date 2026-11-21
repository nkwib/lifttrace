/**
 * Android Local mode: POST /api/ai/history is routed to AiChat.append, with
 * the server route's role and string-content validation, so Trace's history
 * is saved on the device.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../src/lib/api-native.js', import.meta.url), 'utf8');
const ai = src.slice(src.indexOf("if (r === 'ai') {"), src.indexOf('// ── /api/prescriptions'));

test('POST history reaches AiChat.append', () => {
  assert.match(ai, /id === 'history' && m === 'POST'/);
  assert.match(ai, /AiChat\.append\(role, content\)/);
});

test('POST history rejects a missing role or non-string content like the server', () => {
  assert.match(ai, /!role \|\| !content \|\| typeof content !== 'string'/);
  assert.match(ai, /throw new _BadRequest\(/);
  assert.match(src, /class _BadRequest extends Error[\s\S]*?this\.status = 400/);
});

test('a 4xx a Local handler throws reaches the page as that status, not 500', () => {
  const fetchSrc = readFileSync(new URL('../src/lib/apiFetch.js', import.meta.url), 'utf8');
  const local = fetchSrc.slice(fetchSrc.indexOf('async function _dispatchLocal'), fetchSrc.indexOf('function _jsonResponse'));
  assert.match(local, /e\?\.status >= 400 && e\.status < 500\) return _jsonResponse\(e\.status/);
  assert.ok(local.indexOf('e.status < 500') < local.lastIndexOf('_jsonResponse(500'), 'checked before the 500 fallback');
});
