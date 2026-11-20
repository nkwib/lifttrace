/**
 * A differential /sync/pull finds the rows that changed through an index.
 *
 * Every table it reads is filtered by `updated_at >= ?` (per account where
 * the table has one), but only coach_messages had an index on updated_at, so
 * each pull walked all of an account's workouts, body stats and chat (or the
 * whole exercise library) to return the handful that changed.
 *
 * Runs a real pull, records the SQL it prepares, and asks SQLite for each
 * plan: every `updated_at` read goes through an index on updated_at.
 * user_settings is the exception: its primary key narrows to one account's
 * few dozen keys.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

// server/db.js opens DB_PATH when imported: a scratch database.
let db = null, dir = null, server = null, base = null;
try {
  const req = createRequire(new URL('../server/package.json', import.meta.url));
  req('better-sqlite3');
  dir = mkdtempSync(join(tmpdir(), 'sync-pull-indexes-'));
  process.env.DB_PATH = join(dir, 'test.db');
  db = (await import('../server/db.js')).default;
  const express = req('express');
  const { default: syncRoutes } = await import('../server/routes/sync.js');
  const app = express();
  app.use(express.json());
  app.use((r, _res, next) => { r.user = { id: Number(r.headers['x-user']), role: 'member' }; next(); });
  app.use('/api/sync', syncRoutes);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
} catch { /* better-sqlite3 not built for this Node: the cases skip */ }
test.after(() => { server?.close(); try { db?.close(); } catch {} if (dir) rmSync(dir, { recursive: true, force: true }); });

test('every updated_at read in a pull uses an index, not a table scan', { skip: !db }, async () => {
  const u = Number(db.prepare("INSERT INTO users (username, password_hash) VALUES ('a', 'x')").run().lastInsertRowid);
  const seen = [];
  const prepare = db.prepare;
  db.prepare = function (sql) { if (/updated_at >= \?/.test(sql)) seen.push(sql); return prepare.call(this, sql); };
  try {
    const r = await fetch(`${base}/api/sync/pull?since=2026-01-01T00:00:00.000Z`, { headers: { 'x-user': String(u) } });
    assert.equal(r.status, 200);
  } finally {
    db.prepare = prepare;
  }
  const tables = new Set();
  const scans = [];
  for (const sql of seen) {
    const table = sql.match(/FROM (\w+)/)[1];
    tables.add(table);
    const params = (sql.match(/\?/g) || []).map(() => null);
    const plan = prepare.call(db, `EXPLAIN QUERY PLAN ${sql}`).all(...params).map((p) => p.detail);
    if (table === 'user_settings') continue;
    // workout_templates is read through `updated_at >= ? OR <prescribed>`, which
    // no range can serve; it walks the updated_at index in order instead.
    if (!/USING INDEX idx_\w+_updated\b/.test(plan[0])) scans.push(`${table}: ${plan.join(' | ')}`);
  }
  for (const t of ['workout_log', 'body_stats_log', 'exercises', 'programs', 'ai_chat_history', 'excused_days']) assert.ok(tables.has(t), `pull reads ${t}`);
  assert.deepEqual(scans, []);
});
