/** nextProgramDay without accounts (userId null): follows the solo program's order. */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'lt-nd-')), 't.db');
const { default: db } = await import('../server/db.js');
const { nextProgramDay } = await import('../server/lib/program-next-day.js');

const prog = db.prepare("INSERT INTO programs (name, duration_weeks) VALUES ('P', 4)").run().lastInsertRowid;
const days = ['A', 'B', 'C'].map((n, i) =>
  db.prepare('INSERT INTO workout_templates (program_id, name, order_index) VALUES (?, ?, ?)').run(prog, n, i).lastInsertRowid);
const setCfg = (k, v) => db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
const done = (date, tpl, userId = null) => db.prepare(
  "INSERT INTO workout_log (user_id, date, template_id, completed, exercises) VALUES (?, ?, ?, 1, '[]')").run(userId, date, tpl);
const DAY = '2026-11-20';

test('no program: null', () => { assert.equal(nextProgramDay(null, DAY), null); });

test('solo: first day, then advance, then wrap', () => {
  setCfg('active_program', String(prog));
  setCfg('active_program_start', '2026-11-01');
  assert.equal(nextProgramDay(null, DAY).name, 'A');
  done('2026-11-10', days[0]);
  assert.equal(nextProgramDay(null, DAY).name, 'B');
  done('2026-11-12', days[2]);
  assert.equal(nextProgramDay(null, DAY).name, 'A');
});

test('solo: workout before the start is ignored; stamp start works', () => {
  setCfg('active_program_start', '2026-11-15 08:00:00');
  assert.equal(nextProgramDay(null, DAY).name, 'A');
  done('2026-11-16', days[1]);
  assert.equal(nextProgramDay(null, DAY).name, 'C');
});

test('solo: a workout of another owner does not count', () => {
  db.prepare("INSERT INTO users (id, username, password_hash) VALUES (77, 'u', 'x')").run();
  done('2026-11-18', days[2], 77);
  assert.equal(nextProgramDay(null, DAY).name, 'C');
});

test('solo: deleted program or empty days give null', () => {
  db.prepare("UPDATE workout_templates SET deleted_at = datetime('now') WHERE program_id = ?").run(prog);
  assert.equal(nextProgramDay(null, DAY), null);
  db.prepare('UPDATE workout_templates SET deleted_at = NULL WHERE program_id = ?').run(prog);
  db.prepare("UPDATE programs SET deleted_at = datetime('now') WHERE id = ?").run(prog);
  assert.equal(nextProgramDay(null, DAY), null);
  db.prepare('UPDATE programs SET deleted_at = NULL WHERE id = ?').run(prog);
});

test('accounts unchanged: own assignment and own workouts only', () => {
  db.prepare('INSERT INTO program_assignments (program_id, assigned_to, assigned_by, active) VALUES (?, 77, 77, 1)').run(prog);
  assert.equal(nextProgramDay(77, DAY).name, 'A'); // C done by 77 wraps to A
  assert.equal(nextProgramDay(78, DAY), null);
});
