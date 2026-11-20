import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// No-accounts mode: uid(req) is null, so `user_id = ?` matched nothing. Preview
// showed no duplicates, skip/replace re-inserted everything, and every
// same-day import got session_seq 0.
const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
let Database = null;
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); Database = D; } catch { /* skip */ }
const skip = Database ? false : 'needs the server dependencies';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let proc = null, base = null, dir = null;

const HEAD = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe';
const hevy = (rows) => [HEAD, ...rows.map(([t, time, ex, reps]) => `${t},${time},,,${ex},-1,,0,normal,60,${reps},0,0,`)].join('\n');
const send = async (path, csv, extra = {}) => {
  const f = new FormData();
  f.set('source', 'hevy');
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  f.set('file', new Blob([csv]), 'h.csv');
  const r = await fetch(base + path, { method: 'POST', body: f });
  return { status: r.status, data: await r.json() };
};
const rows = (date) => {
  const d = new Database(join(dir, 'lt.db'));
  try { return d.prepare('SELECT * FROM workout_log WHERE user_id IS NULL AND date = ? AND deleted_at IS NULL ORDER BY session_seq, id').all(date); } finally { d.close(); }
};

test.before(async () => {
  if (!Database) return;
  dir = mkdtempSync(join(tmpdir(), 'lt-import-na-'));
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
});
test.after(async () => {
  try {
    if (proc && proc.exitCode == null && proc.signalCode == null) await new Promise((r) => { proc.once('exit', r); proc.kill(); });
  } finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
});

test('no accounts: same-day imports get seq 0,1; preview flags dupes; skip is idempotent', { skip }, async () => {
  const csv = hevy([['Push', '01 Sep 2026 07:00', 'Bench Press', 5], ['Push', '01 Sep 2026 18:00', 'Bench Press', 8]]);
  const pre = await send('/api/workout-import/preview', csv);
  assert.equal(pre.data.duplicateDates, 0);
  assert.deepEqual((await send('/api/workout-import/commit', csv)).data, { imported: 2, skipped: 0, replaced: 0 });
  assert.deepEqual(rows('2026-09-01').map(r => r.session_seq), [0, 1]);
  assert.equal((await send('/api/workout-import/preview', csv)).data.duplicateDates, 2);
  assert.deepEqual((await send('/api/workout-import/commit', csv)).data, { imported: 0, skipped: 2, replaced: 0 });
  assert.equal(rows('2026-09-01').length, 2);
});

test('no accounts: replace updates in place', { skip }, async () => {
  await send('/api/workout-import/commit', hevy([['Legs', '03 Sep 2026 07:00', 'Squat', 5]]));
  const before = rows('2026-09-03');
  const csv = hevy([['Legs', '03 Sep 2026 07:00', 'Squat', 10]]);
  assert.deepEqual((await send('/api/workout-import/commit', csv, { onDuplicate: 'replace' })).data, { imported: 0, skipped: 0, replaced: 1 });
  const after = rows('2026-09-03');
  assert.deepEqual(after.map(r => r.id), before.map(r => r.id));
  assert.equal(JSON.parse(after[0].exercises)[0].sets[0].reps, 10);
});
