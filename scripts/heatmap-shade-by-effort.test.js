import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayIntensity } from '../src/lib/heatmap-intensity.js';

const sets = (n, extra = {}) => [{ sets: Array.from({ length: n }, () => ({ completed: true, ...extra })) }];
const w = (date, n, duration_min, extra = {}) => ({ date, duration_min, exercises: sets(n), ...extra });

test('empty and single day', () => {
  assert.equal(dayIntensity([]).size, 0);
  assert.equal(dayIntensity([w('2026-01-01', 3, 40)]).get('2026-01-01').level, 3);
});

test('minutes rank into four levels, multi-session sums', () => {
  const r = dayIntensity([
    w('2026-01-01', 3, 20), w('2026-01-02', 3, 40), w('2026-01-03', 3, 60),
    w('2026-01-04', 3, 40), w('2026-01-04', 3, 30),
  ]);
  assert.equal(r.get('2026-01-04').minutes, 70);
  assert.equal(r.get('2026-01-01').level, 1);
  assert.equal(r.get('2026-01-04').level, 4);
  assert.ok(r.get('2026-01-03').level > r.get('2026-01-02').level - 1);
});

test('falls back to sets when most days lack duration, never mixing units', () => {
  const r = dayIntensity([w('2026-01-01', 5, null), w('2026-01-02', 20, null), w('2026-01-03', 10, 600)]);
  assert.equal(r.get('2026-01-01').metric, 'sets');
  assert.ok(r.get('2026-01-02').level > r.get('2026-01-01').level);
});

test('warmups, incomplete sets, soft-deleted and no-working-set rows are skipped', () => {
  const r = dayIntensity([
    { date: '2026-01-01', exercises: sets(3, { warmup: true }) },
    { date: '2026-01-02', exercises: [{ sets: [{ completed: false }] }] },
    w('2026-01-03', 3, 30, { deleted_at: '2026-01-04' }),
    w('2026-01-05', 2, null),
  ]);
  assert.deepEqual([...r.keys()], ['2026-01-05']);
  assert.equal(r.get('2026-01-05').sets, 2);
});

test('absurd durations are capped and equal days share a level', () => {
  const r = dayIntensity([w('2026-01-01', 3, 5000), w('2026-01-02', 3, 5000)]);
  assert.equal(r.get('2026-01-01').minutes, 300);
  assert.equal(r.get('2026-01-01').level, r.get('2026-01-02').level);
});

test('Statistics wiring', () => {
  const s = readFileSync(new URL('../src/routes/Statistics.svelte', import.meta.url), 'utf8');
  assert.match(s, /dayIntensity\(/);
  assert.match(s, /hm-l\$\{|hm-l/);
  assert.match(s, /class:hm-active=\{workoutDates\.has\(day\)\}/);
  assert.match(s, /statistics\.hm_less/);
});
