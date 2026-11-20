import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../server/routes/auth.js', import.meta.url), 'utf8');

test('auth.js sets lt_token only through setSessionCookie', () => {
  const calls = src.match(/res\.cookie\(\s*'lt_token'/g) || [];
  assert.equal(calls.length, 1, 'one raw res.cookie lt_token call (inside the helper)');
  const helper = src.match(/function setSessionCookie\([^)]*\)\s*{[\s\S]*?\n}/)[0];
  assert.match(helper, /res\.cookie\(\s*'lt_token'[^;]*maxAge:\s*sessionMaxAge\(\)/);
});

test('sign-in, reissue, register, reset-password and accept-invite use the helper', () => {
  const uses = src.match(/setSessionCookie\(res, \w+\);/g) || [];
  assert.equal(uses.length, 5);
});
