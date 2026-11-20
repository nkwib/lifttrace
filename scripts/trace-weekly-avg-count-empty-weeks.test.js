import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fillWeeks } from '../src/lib/statsFormat.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('Sunday-start rows fill on Sunday keys (no all-zero rows)', () => {
  const rows = [{ week: '2026-03-01', count: 2 }, { week: '2026-03-22', count: 2 }];
  const r = fillWeeks(rows, '2026-03-01', '2026-03-25', { count: 0 }, 520, 'sunday');
  assert.deepEqual(r.map(x => x.count), [2, 0, 0, 2]);
});

test('filled length is the week count for the average', () => {
  const rows = [{ week: '2026-03-02', count: 2 }, { week: '2026-03-23', count: 2 }];
  assert.equal(fillWeeks(rows, '2026-03-01', '2026-03-25', { count: 0 }).length, 4);
});

test('Trace summary uses fillWeeks with the week start setting', () => {
  const src = read('../src/lib/aiTools.js');
  assert.match(src, /import \{ fillWeeks \} from '\.\/statsFormat\.js'/);
  assert.match(src, /normalizeWeekStart\(DB\.getSetting\('weekStartsOn', 'monday'\)\)/);
  assert.match(src, /fillWeeks\(frequency, from, to, \{ count: 0 \}, 520, startsOn\)/);
  assert.match(src, /freqFilled\.length \|\| Math\.ceil\(days/);
  assert.match(read('../src/routes/Statistics.svelte'), /520, \$weekStartsOn\)/);
});
