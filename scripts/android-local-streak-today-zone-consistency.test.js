import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localDateStr, monthsAgo } from '../src/lib/date-local.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('today and range start use date-local helpers, not sv-SE', () => {
  for (const p of [
    'src/lib/api-native.js',
    'src/components/ai/Trace.svelte',
    'src/components/progress-photos/ProgressPhotosTimeline.svelte',
  ]) {
    assert.ok(!read(p).includes("'sv-SE'"), `${p} still uses sv-SE`);
  }
  assert.match(read('src/components/progress-photos/ProgressPhotosTimeline.svelte'), /monthsAgo\(new Date\(\), range\)/);
});

test('range start clamps instead of overflowing (Mar 31 - 1 month)', () => {
  assert.equal(localDateStr(monthsAgo(new Date(2026, 2, 31), 1)), '2026-02-28');
  assert.equal(localDateStr(new Date(2026, 0, 5)), '2026-01-05');
});
