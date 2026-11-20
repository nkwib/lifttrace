import test from 'node:test';
import assert from 'node:assert/strict';
import { workoutsLimitFor, recentTruncated } from '../src/lib/statsFormat.js';

test('workoutsLimitFor tiers', () => {
  for (const r of ['1W', '1M', '3M', '6M']) assert.equal(workoutsLimitFor(r), 365);
  assert.ok(workoutsLimitFor('1Y') >= 1000);
  assert.equal(workoutsLimitFor('All'), 20000);
});

test('recentTruncated: only when full and oldest row is after the window start', () => {
  const rows = [{ date: '2026-03-01' }, { date: '2026-02-01' }];
  assert.equal(recentTruncated(rows, 2, '2026-01-01'), true);
  assert.equal(recentTruncated(rows, 2, '2026-02-01'), false);
  assert.equal(recentTruncated(rows, 3, '2026-01-01'), false);
  assert.equal(recentTruncated(null, 2, '2026-01-01'), false);
});
