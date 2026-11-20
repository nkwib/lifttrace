/**
 * Local-mode body stats keep the server's semantics: the range reads
 * start/end (what the client sends), and PUT merges per key.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { mergeStatsObject } from '../src/lib/workout-merge.js';

const src = readFileSync(new URL('../src/lib/api-native.js', import.meta.url), 'utf8');
const put = src.slice(src.indexOf('const BodyStats = {'), src.indexOf('async range(from, to)'));

test('body-stats range route reads start/end, falling back to from/to', () => {
  assert.match(src, /BodyStats\.range\(query\?\.start \?\? query\?\.from, query\?\.end \?\? query\?\.to\)/);
});

test('local put merges per key and revives a soft-deleted day', () => {
  assert.match(put, /await import\('\.\/workout-merge\.js'\)/);
  assert.match(put, /mergeStatsObject\(/);
  assert.match(put, /deleted_at = NULL/);
  assert.doesNotMatch(put, /\.\.\.existing\.stats/);
  assert.doesNotMatch(src, /^import .*workout-merge/m);
});

test('mergeStatsObject clears nulls and drops junk keys', () => {
  assert.deepEqual(mergeStatsObject({ weight: 80, waist: 90 }, { waist: null, foo: 1 }), { weight: 80 });
});
