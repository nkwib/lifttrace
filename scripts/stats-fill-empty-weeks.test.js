import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fillWeeks } from '../src/lib/statsFormat.js';

const z = { count: 0 };
const weeks = (r) => r.map(x => x.week);

test('fills gaps between data weeks with zero rows', () => {
  const r = fillWeeks([{ week: '2026-03-02', count: 3 }, { week: '2026-03-23', count: 2 }], '2026-03-01', '2026-03-25', z);
  assert.deepEqual(weeks(r), ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23']);
  assert.deepEqual(r.map(x => x.count), [3, 0, 0, 2]);
});

test('empty input stays empty', () => {
  assert.deepEqual(fillWeeks([], '2026-01-01', '2026-03-01', z), []);
});

test('single row stays single, no weeks before the first data week', () => {
  const r = fillWeeks([{ week: '2026-03-09', count: 1 }], '2025-01-01', '2026-03-12', z);
  assert.deepEqual(weeks(r), ['2026-03-09']);
});

test('all-time start from before epoch does not fill from there', () => {
  const r = fillWeeks([{ week: '2026-03-09', count: 1 }], '2000-01-01', '2026-03-12', z);
  assert.equal(r.length, 1);
});

test('mid-week start is clamped to its Monday week', () => {
  const rows = [{ week: '2026-03-02', count: 1 }, { week: '2026-03-16', count: 1 }];
  assert.deepEqual(weeks(fillWeeks(rows, '2026-03-04', '2026-03-18', z)), ['2026-03-02', '2026-03-09', '2026-03-16']);
});

test('trailing weeks are filled up to the week before an empty current week', () => {
  const rows = [{ week: '2026-03-02', count: 2 }];
  // end Wed 2026-03-25: current week 03-23 has no data yet, so it is not added
  assert.deepEqual(weeks(fillWeeks(rows, '2026-03-01', '2026-03-25', z)), ['2026-03-02', '2026-03-09', '2026-03-16']);
});

test('current week with data is included exactly once', () => {
  const rows = [{ week: '2026-03-02', count: 2 }, { week: '2026-03-23', count: 1 }];
  const r = fillWeeks(rows, '2026-03-01', '2026-03-25', z);
  assert.equal(r.filter(x => x.week === '2026-03-23').length, 1);
  assert.equal(r.length, 4);
});

test('current empty week right after the last data week adds nothing', () => {
  const rows = [{ week: '2026-03-16', count: 2 }];
  assert.deepEqual(weeks(fillWeeks(rows, '2026-03-01', '2026-03-25', z)), ['2026-03-16']);
});

test('DST weeks keep Monday keys (UTC math)', () => {
  const rows = [{ week: '2026-03-23', count: 1 }, { week: '2026-04-06', count: 1 }];
  assert.deepEqual(weeks(fillWeeks(rows, '2026-03-23', '2026-04-08', z)), ['2026-03-23', '2026-03-30', '2026-04-06']);
  const rows2 = [{ week: '2026-10-19', count: 1 }, { week: '2026-11-02', count: 1 }];
  assert.deepEqual(weeks(fillWeeks(rows2, '2026-10-19', '2026-11-03', z)), ['2026-10-19', '2026-10-26', '2026-11-02']);
});

test('volume rows use their own field and are not mutated', () => {
  const rows = [{ week: '2026-03-02', volume: 100 }, { week: '2026-03-16', volume: 50 }];
  const r = fillWeeks(rows, '2026-03-01', '2026-03-18', { volume: 0 });
  assert.deepEqual(r[1], { volume: 0, week: '2026-03-09' });
  assert.equal(rows.length, 2);
});

test('cap limits the number of weeks, keeping the newest', () => {
  const rows = [{ week: '2000-01-03', count: 1 }, { week: '2026-03-02', count: 1 }];
  const r = fillWeeks(rows, '2000-01-01', '2026-03-04', z, 520);
  assert.equal(r.length, 520);
  assert.equal(r.at(-1).week, '2026-03-02');
});

test('Statistics fills raw rows and keeps emptiness checks on the raw arrays', () => {
  const src = readFileSync(new URL('../src/routes/Statistics.svelte', import.meta.url), 'utf8');
  assert.match(src, /\$: volume = fillWeeks\(volumeRaw/);
  assert.match(src, /\$: frequency = fillWeeks\(frequencyRaw/);
  assert.match(src, /\{#if volumeRaw\.length === 0\}/);
  assert.match(src, /!volumeRaw\.length/);
});
