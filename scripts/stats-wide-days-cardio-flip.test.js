// Flipping Track Cardio on 1Y/All with the same window must not keep showing
// the old wide trained days while the refetch is in flight.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/routes/Statistics.svelte', import.meta.url), 'utf8');

test('a cardio flip with an unchanged limit drops the stale wide days synchronously', () => {
  assert.match(page, /if \(limit !== _wideLimit\) wideLogs = wideDates = wideMeta = null;\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*else if \(cardio !== _wideCardio\) wideDates = null;/);
});
