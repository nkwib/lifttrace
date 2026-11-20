// exerciseHistory filters by exercise in SQL (json_each); results must equal
// the old load-everything-and-find implementation, and the native client
// layer must carry the same guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-hist-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const { default: db } = await import('../server/db.js');
const { exerciseHistory } = await import('../server/lib/exercise-history.js');

const u = db.prepare("INSERT INTO users (username, password_hash) VALUES ('h','x')").run().lastInsertRowid;
const u2 = db.prepare("INSERT INTO users (username, password_hash) VALUES ('h2','x')").run().lastInsertRowid;
const ins = (uid, date, ex, del = null) => db.prepare(
  'INSERT INTO workout_log (user_id, date, exercises, deleted_at) VALUES (?, ?, ?, ?)'
).run(uid, date, ex, del);
const j = JSON.stringify;
const sets = [{ weight: 100, reps: 5 }];

ins(u, '2026-01-01', j([{ exercise_id: 5, sets }, { exercise_id: 12, sets, set_type: 'drop', distance_unit: 'km', notes: 'n' }]));
ins(u, '2026-01-03', j([{ exercise_id: 123, sets }]));
ins(u, '2026-01-02', j([{ exercise_id: '5', sets }]));
ins(u, '2026-01-04', null);
ins(u, '2026-01-05', '');
ins(u, '2026-01-06', '{}');
ins(u, '2026-01-07', '[]');
ins(u, '2026-01-08', '[{bad json');
ins(u, '2026-01-09', j([{ exercise_id: 5, sets }]), '2026-02-01');
ins(u, '2026-01-10', j([{ exercise_id: 5, sets }]));
ins(u, '2026-01-10', j([{ exercise_id: 5, sets: [{ weight: 1 }] }]));
ins(u2, '2026-01-11', j([{ exercise_id: 5, sets }]));
ins(null, '2026-01-12', j([{ exercise_id: 5, sets }]));

// The previous implementation, tolerant of junk rows.
function reference(userId, exerciseId) {
  const rows = userId != null
    ? db.prepare('SELECT * FROM workout_log WHERE user_id = ? AND deleted_at IS NULL ORDER BY date DESC').all(userId)
    : db.prepare('SELECT * FROM workout_log WHERE user_id IS NULL AND deleted_at IS NULL ORDER BY date DESC').all();
  const out = [];
  for (const row of rows) {
    let exs;
    try { exs = JSON.parse(row.exercises || '[]'); } catch { continue; }
    if (!Array.isArray(exs)) continue;
    const m = exs.find(e => e.exercise_id === exerciseId);
    if (m) out.push({
      date: row.date, sets: m.sets || [], notes: m.notes,
      ...(m.set_type ? { set_type: m.set_type } : {}),
      ...(m.distance_unit ? { distance_unit: m.distance_unit } : {}),
    });
  }
  return out;
}

for (const id of [5, 12, 123, 999]) {
  test(`matches reference for exercise ${id}`, () => {
    assert.deepEqual(exerciseHistory(u, id), reference(u, id));
  });
}

test('string stored id is not matched by JS strict filter', () => {
  assert.ok(!exerciseHistory(u, 5).some(h => h.date === '2026-01-02'));
});

test('passthrough, soft-delete, owner scoping', () => {
  const h = exerciseHistory(u, 12);
  assert.equal(h.length, 1);
  assert.equal(h[0].set_type, 'drop');
  assert.equal(h[0].distance_unit, 'km');
  assert.ok(!exerciseHistory(u, 5).some(x => x.date === '2026-01-09' || x.date === '2026-01-11'));
  assert.deepEqual(exerciseHistory(null, 5).map(x => x.date), ['2026-01-12']);
});

test('malformed rows and NaN id yield empty, no throw', () => {
  assert.deepEqual(exerciseHistory(u, NaN), []);
  assert.deepEqual(exerciseHistory(u, 7), []);
});

test('newest first, equal dates kept', () => {
  const dates = exerciseHistory(u, 5).map(x => x.date);
  assert.deepEqual(dates, ['2026-01-10', '2026-01-10', '2026-01-01']);
});

test('native layer and MCP progress tool carry the SQL guard', () => {
  const native = fs.readFileSync('src/lib/api-native.js', 'utf8');
  const hist = native.slice(native.indexOf('async historyFor'));
  assert.match(hist.slice(0, 900), /json_each/);
  assert.doesNotMatch(hist.slice(0, 900), /LIMIT/);
  const mcp = fs.readFileSync('server/lib/mcp/tools/get-exercise-progress.js', 'utf8');
  assert.match(mcp, /json_each/);
  assert.match(mcp, /SELECT date, exercises FROM workout_log/);
});
