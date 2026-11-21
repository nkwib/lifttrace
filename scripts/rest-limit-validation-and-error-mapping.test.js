import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { clampLimit } from '../server/lib/mcp/_util.js';

test('clampLimit truncates, clamps and defaults', () => {
  assert.equal(clampLimit(2.5, 10, 50), 2);
  assert.equal(clampLimit('3', 10, 50), 3);
  assert.equal(clampLimit(NaN, 10, 50), 10);
  assert.equal(clampLimit('abc', 10, 50), 10);
  assert.equal(clampLimit(undefined, 10, 50), 10);
  assert.equal(clampLimit(-1, 10, 50), 1);
  assert.equal(clampLimit(0, 10, 50), 1);
  assert.equal(clampLimit(1e9, 10, 50), 50);
  assert.equal(clampLimit(Infinity, 10, 50), 10);
});

test('wiring: Core functions use clampLimit', () => {
  for (const f of ['get-workouts', 'list-recent-workouts', 'search-exercises']) {
    assert.match(readFileSync(`server/lib/mcp/tools/${f}.js`, 'utf8'), /clampLimit\(limit,/, f);
  }
});

test('wiring: core() does not blanket-400 SQLite errors', () => {
  const src = readFileSync('server/routes/public-api.js', 'utf8');
  assert.match(src, /startsWith\('SQLITE_'\)\) throw e/);
});

test('wiring: exercises list validates limit/offset and handles offset-only', () => {
  const src = readFileSync('server/routes/exercises.js', 'utf8');
  assert.match(src, /Number\.isInteger\(lim\)/);
  assert.match(src, /lim \|\| -1/);
});
