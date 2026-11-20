import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStrong } from '../server/lib/workout-import/strong.js';
import { parseHevy } from '../server/lib/workout-import/hevy.js';

// Regression test for issue #76 (multiple workout sessions per day). Before
// the fix, server/routes/workout-import.js's commit route deduped by
// (user_id, date) alone, so a file with two distinctly-named same-day
// sessions silently dropped the second (skip mode) or deleted the first to
// make room for it (replace mode) — real, already-occurring data loss
// independent of anything the app itself does. The route fix scopes dedup
// to (user_id, date, name) instead; these tests confirm the PARSERS
// themselves already produce two separate same-date objects (the route-level
// fix has nothing to work with otherwise), which is the part of the root
// cause these parsers are responsible for. The route's own dedup/session_seq
// logic was verified by dry-running its SQL against a real SQLite engine
// (this sandbox has no compiled better-sqlite3 binding to import db.js
// directly) — see the commit message for that verification.

test('Strong: two differently-named workouts same day stay two separate entries', () => {
  const csv = [
    'Date;Workout Name;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE;Weight Unit',
    '2026-09-01 07:00:00;Morning Stretch;Standing Hamstring Stretch;1;0;1;0;60;;;;lbs',
    '2026-09-01 18:00:00;Push Day;Bench Press;1;135;5;0;0;;;;lbs',
  ].join('\n');

  const workouts = parseStrong(csv, 'lbs');
  assert.equal(workouts.length, 2, 'expected two separate sessions, not one merged/dropped');
  assert.deepEqual(workouts.map(w => w.date), ['2026-09-01', '2026-09-01']);
  const names = workouts.map(w => w.name).sort();
  assert.deepEqual(names, ['Morning Stretch', 'Push Day']);
});

test('Hevy: two differently-named workouts same day stay two separate entries', () => {
  const csv = [
    'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
    'Morning Stretch,01 Sep 2026 07:00,01 Sep 2026 07:20,,Standing Hamstring Stretch,-1,,0,normal,0,1,0,0,',
    'Push Day,01 Sep 2026 18:00,01 Sep 2026 19:00,,Bench Press,-1,,0,normal,60,5,0,0,',
  ].join('\n');

  const workouts = parseHevy(csv, 'lbs');
  assert.equal(workouts.length, 2, 'expected two separate sessions, not one merged/dropped');
  assert.deepEqual(workouts.map(w => w.date), ['2026-09-01', '2026-09-01']);
  const names = workouts.map(w => w.name).sort();
  assert.deepEqual(names, ['Morning Stretch', 'Push Day']);
});

test('Strong: re-importing the same named workout on the same day is still one entry (not artificially split)', () => {
  // Two rows, same date + same workout name, different exercises — must
  // stay ONE workout object (this is a single real session with two
  // exercises), confirming the fix doesn't over-correct into splitting
  // everything by row.
  const csv = [
    'Date;Workout Name;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE;Weight Unit',
    '2026-09-01 18:00:00;Push Day;Bench Press;1;135;5;0;0;;;;lbs',
    '2026-09-01 18:00:00;Push Day;Overhead Press;1;65;8;0;0;;;;lbs',
  ].join('\n');

  const workouts = parseStrong(csv, 'lbs');
  assert.equal(workouts.length, 1);
  assert.equal(workouts[0].exercises.length, 2);
});

// ── same-day same-name sessions: pairing helper + the real route ─────────────
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { planImport, importKeys, importKey } from '../server/lib/import-match.js';

const wk = (date, name) => ({ date, name, exercises: [] });

test('planImport: n-th file session pairs with the n-th existing one', () => {
  const ex = new Map([[importKey('2026-09-01', 'Push'), [{ id: 10 }, { id: 11 }]]]);
  const plan = planImport([wk('2026-09-01', 'Push'), wk('2026-09-01', 'Push'), wk('2026-09-01', 'Push'), wk('2026-09-02', 'Push')], ex);
  assert.deepEqual(plan.map(p => p.existing && p.existing.id), [10, 11, null, null]);
});

test('planImport: unnamed workouts key as Imported; importKeys is distinct', () => {
  const ex = new Map([[importKey('2026-09-01', 'Imported'), [{ id: 1 }]]]);
  assert.equal(planImport([{ date: '2026-09-01', exercises: [] }], ex)[0].existing.id, 1);
  assert.equal(importKeys([wk('d', 'A'), wk('d', 'A'), wk('d', 'B')]).length, 2);
});

test('Strong merges same-name same-day rows into one session', () => {
  const csv = [
    'Date;Workout Name;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE;Weight Unit',
    '2026-09-01 07:00:00;Push;Bench Press;1;135;5;0;0;;;;lbs',
    '2026-09-01 18:00:00;Push;Bench Press;1;135;5;0;0;;;;lbs',
  ].join('\n');
  assert.equal(parseStrong(csv, 'lbs').length, 1);
});

const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
let Database = null;
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); Database = D; } catch { /* skip */ }
const skip = Database ? false : 'needs the server dependencies';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PW = 'Str0ng-Pass-77!x';
let proc = null, base = null, dir = null, token = null, userId = null;

const HEAD = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe';
const hevy = (rows) => [HEAD, ...rows.map(([t, time, ex, reps]) => `${t},${time},,,${ex},-1,,0,normal,60,${reps},0,0,`)].join('\n');
async function api(path, form) {
  const r = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: r.status, data: await r.json() };
}
const send = (path, csv, extra = {}) => {
  const f = new FormData();
  f.set('source', 'hevy');
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  f.set('file', new Blob([csv]), 'h.csv');
  return api(path, f);
};
const rawDb = () => new Database(join(dir, 'lt.db'));
const rows = (date) => { const d = rawDb(); try { return d.prepare('SELECT * FROM workout_log WHERE user_id = ? AND date = ? AND deleted_at IS NULL ORDER BY session_seq, id').all(userId, date); } finally { d.close(); } };

test.before(async () => {
  if (!Database) return;
  dir = mkdtempSync(join(tmpdir(), 'lt-import-'));
  const port = await new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
  base = `http://127.0.0.1:${port}`;
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'NODE_OPTIONS'];
  proc = spawn(process.execPath, ['index.js'], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)),
    env: {
      ...Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]])),
      TZ: 'UTC', PORT: String(port), DB_PATH: join(dir, 'lt.db'), UPLOADS_PATH: join(dir, 'uploads'),
      BACKUPS_PATH: join(dir, 'backups'), JWT_SECRET: 'import-test-0123456789abcdef0123456789abcdef', INSECURE_COOKIES: '1',
      NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off', API_RATE_LIMIT_PER_MIN: '5000',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 300; i++) {
    if (proc.exitCode != null) throw new Error('server exited at startup');
    try { if ((await fetch(base + '/api/auth/status')).ok) break; } catch { /* not up yet */ }
    await sleep(100);
  }
  const json = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  await json('/api/auth/register', { username: 'sam', password: PW, full_name: 'Sam Lee' });
  const login = await json('/api/auth/login', { username: 'sam', password: PW });
  token = login.token;
  userId = (login.user || await fetch(base + '/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())).id;
});
test.after(async () => {
  try {
    if (proc && proc.exitCode == null && proc.signalCode == null) await new Promise((r) => { proc.once('exit', r); proc.kill(); });
  } finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
});

test('route: two same-name same-day sessions import as two; re-import skips both', { skip }, async () => {
  const csv = hevy([['Push', '01 Sep 2026 07:00', 'Bench Press', 5], ['Push', '01 Sep 2026 18:00', 'Bench Press', 8]]);
  const pre = await send('/api/workout-import/preview', csv);
  assert.equal(pre.data.workouts, 2);
  assert.equal(pre.data.duplicateDates, 0);
  const c1 = await send('/api/workout-import/commit', csv);
  assert.deepEqual(c1.data, { imported: 2, skipped: 0, replaced: 0 });
  assert.deepEqual(rows('2026-09-01').map(r => r.session_seq), [0, 1]);
  const pre2 = await send('/api/workout-import/preview', csv);
  assert.equal(pre2.data.duplicateDates, 2);
  const c2 = await send('/api/workout-import/commit', csv);
  assert.deepEqual(c2.data, { imported: 0, skipped: 2, replaced: 0 });
  assert.equal(rows('2026-09-01').length, 2);
});

test('route: 1 existing + 2 in file -> 1 skipped, 1 inserted', { skip }, async () => {
  await send('/api/workout-import/commit', hevy([['Pull', '02 Sep 2026 07:00', 'Row', 5]]));
  const csv = hevy([['Pull', '02 Sep 2026 07:00', 'Row', 5], ['Pull', '02 Sep 2026 18:00', 'Row', 6]]);
  const pre = await send('/api/workout-import/preview', csv);
  assert.equal(pre.data.duplicateDates, 1);
  const c = await send('/api/workout-import/commit', csv);
  assert.deepEqual(c.data, { imported: 1, skipped: 1, replaced: 0 });
  assert.equal(rows('2026-09-02').length, 2);
});

test('route: replace updates in place, keeping ids, seq and coach feedback', { skip }, async () => {
  const d = '2026-09-03';
  await send('/api/workout-import/commit', hevy([['Legs', '03 Sep 2026 07:00', 'Squat', 5], ['Legs', '03 Sep 2026 18:00', 'Squat', 6]]));
  const before = rows(d);
  const db = rawDb();
  try {
    db.prepare("INSERT INTO coach_feedback (trainer_id, member_id, workout_id, exercise_idx, note) VALUES (?, ?, ?, 0, 'nice')").run(userId, userId, before[0].id);
  } finally { db.close(); }
  const csv = hevy([['Legs', '03 Sep 2026 07:00', 'Squat', 10], ['Legs', '03 Sep 2026 18:00', 'Squat', 12], ['Legs', '03 Sep 2026 19:00', 'Squat', 3]]);
  const pre = await send('/api/workout-import/preview', csv);
  assert.equal(pre.data.duplicateDates, 2);
  const c = await send('/api/workout-import/commit', csv, { onDuplicate: 'replace' });
  assert.deepEqual(c.data, { imported: 1, skipped: 0, replaced: 2 });
  const after = rows(d);
  assert.equal(after.length, 3);
  assert.deepEqual(after.slice(0, 2).map(r => r.id), before.map(r => r.id));
  assert.deepEqual(after.map(r => r.session_seq), [0, 1, 2]);
  assert.equal(JSON.parse(after[0].exercises)[0].sets[0].reps, 10);
  assert.equal(JSON.parse(after[1].exercises)[0].sets[0].reps, 12);
  assert.ok(JSON.parse(after[0].field_times).exercises);
  const db2 = rawDb();
  try { assert.equal(db2.prepare('SELECT COUNT(*) n FROM coach_feedback WHERE workout_id = ?').get(before[0].id).n, 1); } finally { db2.close(); }
});
