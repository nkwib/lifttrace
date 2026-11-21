import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import os from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(os.tmpdir(), `mcp-exact-lt-${process.pid}-${Date.now()}.db`);
process.env.NODE_ENV = 'test';

let db, progress, search;
try {
  ({ default: db } = await import('../server/db.js'));
  ({ getExerciseProgressCore: progress } = await import('../server/lib/mcp/tools/get-exercise-progress.js'));
  ({ searchExercisesCore: search } = await import('../server/lib/mcp/tools/search-exercises.js'));
} catch (e) {
  test('skipped (native module unavailable)', { skip: true }, () => {});
  process.exit(0);
}

let u1, u2, globalSquat, ownSquat, front, otherPrivate;
before(() => {
  const mk = n => db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, 'x', 'member')").run(n).lastInsertRowid;
  u1 = mk('exact-a'); u2 = mk('exact-b');
  const ex = (name, g, by) => db.prepare('INSERT INTO exercises (name, is_global, created_by, load_type) VALUES (?, ?, ?, ?)').run(name, g, by, 'bilateral').lastInsertRowid;
  globalSquat = ex('Squat', 1, null);
  front = ex('Front Squat', 1, null);
  ownSquat = ex('Squat', 0, u1);
  otherPrivate = ex('Secret Squat', 0, u2);
});

test('exact name wins over partial matches, case insensitive', () => {
  const r = progress(u2, { exercise_name: 'sQuAt' });
  assert.equal(r.ambiguous, undefined);
  assert.equal(r.exercise_id, globalSquat);
});

test('duplicate exact names prefer the callers own row, then lowest id', () => {
  assert.equal(progress(u1, { exercise_name: 'Squat' }).exercise_id, ownSquat);
  assert.equal(progress(u2, { exercise_name: 'Squat' }).exercise_id, globalSquat);
});

test('true partials stay ambiguous with ids', () => {
  const r = progress(u1, { exercise_name: 'quat' });
  assert.equal(r.ambiguous, true);
  assert.ok(r.candidates.includes('Front Squat'));
  assert.ok(r.candidate_exercises.some(c => c.exercise_id === front && c.name === 'Front Squat'));
  assert.ok(!r.candidate_exercises.some(c => c.exercise_id === otherPrivate));
});

test('exercise_id bypasses name and is visibility checked', () => {
  assert.equal(progress(u1, { exercise_id: front }).exercise_name, 'Front Squat');
  assert.throws(() => progress(u1, { exercise_id: otherPrivate }), /No exercise/);
  db.prepare('UPDATE exercises SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(front);
  assert.throws(() => progress(u1, { exercise_id: front }), /No exercise/);
  db.prepare('UPDATE exercises SET deleted_at = NULL WHERE id = ?').run(front);
});

test('search lists exact, then prefix, then the rest', () => {
  db.prepare("INSERT INTO exercises (name, is_global, load_type) VALUES ('Squatty Thing', 1, 'bilateral')").run();
  const names = search(u2, { query: 'squat' }).exercises.map(e => e.name);
  assert.equal(names[0], 'Squat');
  assert.ok(names.indexOf('Squatty Thing') < names.indexOf('Front Squat'));
});
