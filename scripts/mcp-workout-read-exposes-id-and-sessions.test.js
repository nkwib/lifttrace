/**
 * get_workout exposes workout_id, session_seq and session_count, and can read
 * a later same-day session. Temporary SQLite database, handlers called directly.
 */
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import os from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(os.tmpdir(), `mcp-wid-lt-${process.pid}-${Date.now()}.db`);
process.env.NODE_ENV = 'test';

let db, getWorkoutCore, getWorkoutsCore, listRecentWorkoutsCore, logSetCore;
try {
  ({ default: db } = await import('../server/db.js'));
  ({ getWorkoutCore } = await import('../server/lib/mcp/tools/get-workout.js'));
  ({ getWorkoutsCore } = await import('../server/lib/mcp/tools/get-workouts.js'));
  ({ listRecentWorkoutsCore } = await import('../server/lib/mcp/tools/list-recent-workouts.js'));
  ({ logSetCore } = await import('../server/lib/mcp/tools/log-set.js'));
} catch (e) {
  test('skipped (native module unavailable)', { skip: true }, () => {});
  console.warn(`[mcp-wid] skipping: ${(e?.message || e).split('\n')[0]}`);
  process.exit(0);
}

const D = '2022-03-03';
let userId, exId;
const ids = [];

before(() => {
  userId = db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('mcp-wid', 'x', 'member')").run().lastInsertRowid;
  exId = db.prepare("INSERT INTO exercises (name, is_global, load_type) VALUES ('Wid Press', 1, 'bilateral')").run().lastInsertRowid;
  const ins = db.prepare(
    `INSERT INTO workout_log (user_id, date, name, exercises, completed, session_seq) VALUES (?, ?, ?, '[]', 0, ?)`);
  ids.push(ins.run(userId, D, 'A', 0).lastInsertRowid);
  ids.push(ins.run(userId, D, 'B', 1).lastInsertRowid);
  const gone = ins.run(userId, D, 'Gone', 2).lastInsertRowid;
  db.prepare("UPDATE workout_log SET deleted_at = '2022-03-04 00:00:00' WHERE id = ?").run(gone);
});

test('default is the first session, with id and count of live sessions', () => {
  const w = getWorkoutCore(userId, { date: D });
  assert.equal(w.workout_id, ids[0]);
  assert.equal(w.session_seq, 0);
  assert.equal(w.session_count, 2);
  assert.equal(w.name, 'A');
});

test('session_seq picks another session; string form (REST) works', () => {
  assert.equal(getWorkoutCore(userId, { date: D, session_seq: 1 }).workout_id, ids[1]);
  assert.equal(getWorkoutCore(userId, { date: D, session_seq: '1' }).name, 'B');
});

test('missing session_seq (or a deleted one) answers logged:false', () => {
  for (const s of [5, 2]) {
    const w = getWorkoutCore(userId, { date: D, session_seq: s });
    assert.equal(w.logged, false);
    assert.equal(w.session_count, 0);
  }
  assert.equal(getWorkoutCore(userId, { date: '2001-01-01' }).session_count, 0);
});

test('bad session_seq errors', () => {
  for (const s of [-1, 1.5, 'abc', '1.5', '-1', NaN]) {
    assert.throws(() => getWorkoutCore(userId, { date: D, session_seq: s }), /session_seq/, String(s));
  }
});

test('get_workouts and list_recent_workouts carry workout_id', () => {
  const r = getWorkoutsCore(userId, { start: D, end: D });
  assert.deepEqual(r.workouts.map(w => [w.workout_id, w.session_seq]), [[ids[0], 0], [ids[1], 1]]);
  const l = listRecentWorkoutsCore(userId, { start: D, end: D });
  assert.deepEqual(l.workouts.map(w => w.workout_id), [ids[1], ids[0]]);
});

test('log_set with the returned workout_id lands in that session', () => {
  const id = getWorkoutCore(userId, { date: D, session_seq: 1 }).workout_id;
  logSetCore(userId, { exercise_id: exId, reps: 5, weight: 50, date: D, workout_id: id });
  assert.equal(getWorkoutCore(userId, { date: D, session_seq: 1 }).exercises.length, 1);
  assert.equal(getWorkoutCore(userId, { date: D }).exercises.length, 0);
});
