import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBucket, parseTrustProxy, passwordBucket } from '../server/lib/login-throttle.js';

const clock = () => { let t = 1000; const f = () => t; f.adv = (ms) => { t += ms; }; return f; };

test('failure-only IP bucket: nothing counted until a failure is recorded', () => {
  const b = createBucket({ limit: 10, now: clock() });
  for (let i = 0; i < 10; i++) assert.equal(b.isLimited('ip'), false); // successes never hit
  for (let i = 0; i < 10; i++) b.hit('ip');
  assert.equal(b.isLimited('ip'), true);
  assert.equal(b.hit('ip'), true); // 11th failure
});

test('per-username bucket trips at 6 failures (7th hit)', () => {
  const b = createBucket({ limit: 6, now: clock() });
  for (let i = 0; i < 6; i++) assert.equal(b.hit('u:a'), false);
  assert.equal(b.hit('u:a'), true);
});

test('password bucket: 5 failures then limited, success clears, users independent', () => {
  const b = createBucket({ limit: 5, now: clock() });
  for (let i = 0; i < 5; i++) b.hit(1);
  assert.equal(b.isLimited(1), true);
  assert.equal(b.isLimited(2), false);
  b.clear(1);
  assert.equal(b.isLimited(1), false);
  assert.equal(typeof passwordBucket.hit, 'function');
});

test('window expiry and pruning', () => {
  const now = clock();
  const b = createBucket({ limit: 2, windowMs: 100, now });
  b.hit('k'); b.hit('k');
  assert.equal(b.isLimited('k'), true);
  now.adv(101);
  assert.equal(b.isLimited('k'), false);
  b.prune();
  assert.equal(b.size(), 0);
});

test('key cap bounds memory', () => {
  const b = createBucket({ limit: 1, maxKeys: 5, now: clock() });
  for (let i = 0; i < 50; i++) b.hit(`u:${i}`);
  assert.ok(b.size() <= 5);
});

test('parseTrustProxy', () => {
  assert.equal(parseTrustProxy(undefined), undefined);
  assert.equal(parseTrustProxy(''), undefined);
  assert.equal(parseTrustProxy('false'), undefined);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8');
});

test('wiring: trust proxy is opt-in, /login counts failures, /password is throttled', () => {
  const idx = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(idx, /parseTrustProxy\(process\.env\.TRUST_PROXY\)/);
  assert.match(idx, /if \(TRUST_PROXY !== undefined\)[\s\S]{0,40}app\.set\('trust proxy'/);
  const auth = fs.readFileSync(new URL('../server/routes/auth.js', import.meta.url), 'utf8');
  assert.match(auth, /router\.post\('\/login', rateLimitLoginFailures/);
  assert.match(auth, /router\.post\('\/forgot-password', rateLimitLogin,/);
  assert.match(auth, /passwordBucket\.isLimited\(user\.id\)[\s\S]{0,200}bcrypt\.compareSync\(current_password/);
});
