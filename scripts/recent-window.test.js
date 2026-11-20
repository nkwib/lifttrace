/**
 * Statistics reads the workouts of its range, not a year's: the range and
 * the one before it (the change from last period) or the heatmap's 91 days,
 * whichever is longer (GET /api/workout/recent?days=N). A year of whole
 * workouts was over a megabyte on every visit with two years of training.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { shiftDate } from '../src/lib/trained-day.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

let db = null, dir = null, server = null, base = null;
try {
  const req = createRequire(new URL('../server/package.json', import.meta.url));
  req('better-sqlite3');
  dir = mkdtempSync(join(tmpdir(), 'recent-window-'));
  process.env.DB_PATH = join(dir, 'test.db');
  db = (await import('../server/db.js')).default;
  const express = req('express');
  const { default: workoutRoutes } = await import('../server/routes/workout.js');
  const app = express();
  app.use('/api/workout', workoutRoutes);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
} catch { /* better-sqlite3 not built for this Node: the server case skips */ }
test.after(() => { server?.close(); try { db?.close(); } catch {} if (dir) rmSync(dir, { recursive: true, force: true }); });

test('days=N leaves out workouts older than the last N days, with a day to spare', { skip: !db }, async () => {
  const today = new Date().toISOString().slice(0, 10);
  const put = db.prepare("INSERT INTO workout_log (user_id, date, exercises) VALUES (NULL, ?, '[]')");
  for (const back of [0, 10, 30, 31, 32, 200]) put.run(shiftDate(today, -back));
  const dates = async (q) => (await (await fetch(`${base}/api/workout/recent?${q}`)).json()).map(r => r.date);
  assert.deepEqual(await dates('limit=365&days=30'), [0, 10, 30, 31].map(b => shiftDate(today, -b)));
  // No days, or none that reads as a count: all of them, as before.
  assert.equal((await dates('limit=365')).length, 6);
  assert.equal((await dates('limit=365&days=x')).length, 6);
  assert.equal((await dates('limit=365&days=0')).length, 6);
  // The limit still applies.
  assert.equal((await dates('limit=2&days=30')).length, 2);
});

test('Statistics asks for its range and the one before, or the heatmap\'s 91 days', () => {
  const stats = read('../src/routes/Statistics.svelte');
  assert.match(stats, /const back = RANGES\[range\] \? Math\.max\(2 \* RANGES\[range\], 90\) : null;/);
  assert.match(stats, /fetch\(`\/api\/workout\/recent\?limit=365\$\{back \? `&days=\$\{back\}` : ''\}`/);
  // The heatmap is the 91 days the window covers at the least.
  assert.match(stats, /heatmapDays = Array\.from\(\{ length: 91 \}/);
});
