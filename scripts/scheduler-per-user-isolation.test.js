/** One user's scheduler error must not skip later users (and weekly summary tolerates odd rows). */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'lt-iso-')), 't.db');
const { _runUsers } = await import('../server/lib/scheduler.js');
const { buildWeeklySummary } = await import('../server/lib/weekly-summary.js');

test('a throwing user does not skip later users', async () => {
  const seen = [];
  await _runUsers([1, 2, 3], async (id) => { seen.push(id); if (id === 2) throw new Error('boom'); });
  assert.deepEqual(seen, [1, 2, 3]);
});

test('single-user (null) path is wrapped too', async () => {
  await _runUsers([null], () => { throw new Error('boom'); });
});

test('weekly summary survives null exercises, null entries and non-array sets', () => {
  const lib = new Map();
  const rows = [
    { date: '2026-09-18', exercises: 'null' },
    { date: '2026-09-18', exercises: JSON.stringify([null, { exercise_id: 1, exercise_name: 'x', sets: { a: 1 } }]) },
  ];
  assert.doesNotThrow(() => buildWeeklySummary({ workouts: rows, library: lib, today: '2026-09-20' }));
});
