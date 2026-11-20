/**
 * The Diary's dots, week strip and streak read a year of workouts as days
 * only (GET /api/workout/recent?view=days): one trained yes or no per row
 * instead of every workout in full, over a megabyte on each visit with two
 * years of training.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { trainedDates, workoutCounts } from '../src/lib/trained-day.js';
import { answerWithOps, writeOp } from '../src/lib/offline-edits.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const done = [{ exercise_id: 1, sets: [{ weight: 50, reps: 5, completed: true }] }];
const warmupOnly = [{ exercise_id: 1, sets: [{ weight: 20, reps: 5, completed: true, warmup: true }] }];
const notDone = [{ exercise_id: 1, sets: [{ weight: 50, reps: 5, completed: false }] }];

// server/db.js opens DB_PATH when imported: a scratch database.
let db = null, dir = null, server = null, base = null;
try {
  const req = createRequire(new URL('../server/package.json', import.meta.url));
  req('better-sqlite3');
  dir = mkdtempSync(join(tmpdir(), 'recent-days-'));
  process.env.DB_PATH = join(dir, 'test.db');
  db = (await import('../server/db.js')).default;
  const express = req('express');
  const { default: workoutRoutes } = await import('../server/routes/workout.js');
  const app = express();
  app.use(express.json());
  app.use('/api/workout', workoutRoutes);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
} catch { /* better-sqlite3 not built for this Node: the server case skips */ }
test.after(() => { server?.close(); try { db?.close(); } catch {} if (dir) rmSync(dir, { recursive: true, force: true }); });

test('view=days answers the same rows as days, by the shared rule', { skip: !db }, async () => {
  const put = db.prepare('INSERT INTO workout_log (user_id, date, session_seq, exercises) VALUES (NULL, ?, ?, ?)');
  put.run('2026-09-20', 0, JSON.stringify(done));
  put.run('2026-09-21', 0, JSON.stringify(warmupOnly));
  put.run('2026-09-22', 0, JSON.stringify(notDone));
  put.run('2026-09-22', 1, JSON.stringify(done));
  put.run('2026-09-23', 0, '[]');
  const full = await (await fetch(`${base}/api/workout/recent?limit=365`)).json();
  const days = await (await fetch(`${base}/api/workout/recent?limit=365&view=days`)).json();
  assert.deepEqual(days.map(r => r.id), full.map(r => r.id), 'same rows, same order');
  for (const r of days) assert.deepEqual(Object.keys(r).sort(), ['date', 'id', 'session_seq', 'trained']);
  const byDay = (a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]);
  assert.deepEqual(days.map(r => [r.date, r.session_seq, r.trained]).sort(byDay), [
    ['2026-09-20', 0, true], ['2026-09-21', 0, false], ['2026-09-22', 0, false], ['2026-09-22', 1, true], ['2026-09-23', 0, false],
  ]);
  assert.deepEqual(trainedDates({ workouts: days }), trainedDates({ workouts: full }));
  // The limit still counts rows.
  assert.equal((await (await fetch(`${base}/api/workout/recent?limit=2&view=days`)).json()).length, 2);
});

test('a row read as a day counts by its flag until it has exercises', () => {
  assert.equal(workoutCounts({ date: '2026-09-20', trained: true }), true);
  assert.equal(workoutCounts({ date: '2026-09-20', trained: false }), false);
  assert.equal(workoutCounts({ date: '2026-09-20', trained: true, deleted_at: '2026-09-21' }), false);
  // A change made offline gave it exercises: those decide.
  assert.equal(workoutCounts({ date: '2026-09-20', trained: true, exercises: [] }), false);
  assert.equal(workoutCounts({ date: '2026-09-20', trained: false, exercises: done }), true);
  // Not a flag: the rule as before.
  assert.equal(workoutCounts({ date: '2026-09-20', trained: 1 }), false);
});

test('a change waiting offline shows on the days as on full rows', () => {
  const op = (seq, method, url, body) => ({ ...writeOp(method, url, body), seq, path: url.split('?')[0], body });
  const mirrored = [
    { id: 9, date: '2026-09-27', session_seq: 0, trained: true },
    { id: 7, date: '2026-09-22', session_seq: 0, trained: true },
    { id: 8, date: '2026-09-22', session_seq: 1, trained: true },
  ];
  const url = '/api/workout/recent?limit=365&view=days';
  // Clear Workout: the day no longer counts.
  let shown = answerWithOps(url, mirrored, [op(1, 'PUT', '/api/workout/2026-09-27', { id: 9, exercises: [] })]);
  assert.deepEqual([...trainedDates({ workouts: shown })], ['2026-09-22']);
  // One of two sessions deleted: the other still counts.
  shown = answerWithOps(url, mirrored, [op(1, 'DELETE', '/api/workout/2026-09-22?id=8')]);
  assert.deepEqual([...trainedDates({ workouts: shown })].sort(), ['2026-09-22', '2026-09-27']);
  // A day first logged offline counts.
  shown = answerWithOps(url, mirrored, [op(2, 'PUT', '/api/workout/2026-09-28', { exercises: done })]);
  assert.ok(trainedDates({ workouts: shown }).has('2026-09-28'));
});

test('the Diary reads days, not whole workouts', () => {
  const diary = read('../src/routes/Diary.svelte');
  assert.match(diary, /recentWorkoutRows = await LtApi\.getRecentTrainedDays\(365\);/);
  assert.doesNotMatch(diary, /getRecentWorkouts\(365\)/);
  assert.match(read('../src/lib/api.js'), /getRecentTrainedDays: \(limit = 365\) => fetch\(`\/api\/workout\/recent\?limit=\$\{limit\}&view=days`/);
});
