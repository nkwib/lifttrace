/**
 * Clear All Data without accounts (NULL owner) clears workouts, body stats,
 * cardio and tombstones, and leaves the seed programs; with accounts it
 * clears only the caller's rows. Against the real server on a scratch database.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
let ready = false;
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); ready = true; } catch { /* server packages missing: skip */ }
const skip = !ready && 'server packages missing';
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanEnv = () => {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'NODE_OPTIONS'];
  return Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
};
const PW = 'Str0ng-Pass-77!x';

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'lt-clear-data-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ['index.js'], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)),
    env: { ...cleanEnv(), TZ: 'UTC', PORT: String(port), DB_PATH: join(dir, 'lt.db'), UPLOADS_PATH: join(dir, 'uploads'), BACKUPS_PATH: join(dir, 'backups'), JWT_SECRET: 'clear-data-test-0123456789abcdef0123', INSECURE_COOKIES: '1', NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off' },
    stdio: 'ignore',
  });
  const s = { dir, tok: null };
  s.call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(s.tok ? { Authorization: `Bearer ${s.tok}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
    const t = await r.text();
    assert.ok(r.ok, `${method} ${p} -> ${r.status} ${t.slice(0, 150)}`);
    return t ? JSON.parse(t) : null;
  };
  s.db = () => new (serverRequire('better-sqlite3'))(join(dir, 'lt.db'));
  try {
    for (let i = 0; i < 300; i++) {
      try { if ((await fetch(base + '/api/auth/status')).ok) break; } catch { /* not up yet */ }
      await sleep(100);
    }
    await fn(s);
  } finally {
    if (proc.exitCode == null && proc.signalCode == null) await new Promise((r) => { proc.once('exit', r); proc.kill(); });
    rmSync(dir, { recursive: true, force: true });
  }
}

const log = async (s, date) => {
  await s.call('PUT', `/api/workout/${date}`, { exercises: [{ name: 'Squat', uuid: `ex-${date}`, sets: [{ uuid: `s-${date}`, weight: 100, reps: 5 }] }] });
  await s.call('PUT', `/api/body-stats/${date}`, { stats: { weight: 80 } });
  await s.call('POST', '/api/cardio', { date, activity: 'Run', duration_min: 30 });
};
const count = (s, table) => { const d = s.db(); try { return d.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n; } finally { d.close(); } };

test('single-user: Clear All Data clears workouts, body stats, cardio, tombstones; seed programs stay', { skip }, async () => {
  await withServer(async (s) => {
    await log(s, '2026-03-10');
    const d = s.db();
    d.prepare("INSERT INTO workout_tombstones (user_id, date, workout_id, kind, ex_uuid, uuid) VALUES (NULL, '2026-03-10', 0, 'exercise', '', 'gone-1')").run();
    d.close();
    assert.equal(count(s, 'workout_log'), 1);
    assert.equal(count(s, 'cardio_log'), 1);
    const programs = (await s.call('GET', '/api/programs')).length;
    await s.call('DELETE', '/api/settings/clear-data');
    for (const t of ['workout_log', 'body_stats_log', 'cardio_log', 'workout_tombstones']) assert.equal(count(s, t), 0, t);
    assert.equal((await s.call('GET', '/api/programs')).length, programs, 'seed programs still listed');
  });
});

test('accounts: clearing one keeps the other account\'s cardio and tombstones', { skip }, async () => {
  await withServer(async (s) => {
    await s.call('POST', '/api/auth/register', { username: 'amy', password: PW });
    const amy = (await s.call('POST', '/api/auth/login', { username: 'amy', password: PW })).token;
    s.tok = amy;
    const { user } = await s.call('POST', '/api/auth/register', { username: 'bob', password: PW, role: 'member' });
    const jwt = serverRequire('jsonwebtoken');
    const bob = jwt.sign({ id: user.id, username: 'bob', role: user.role }, 'clear-data-test-0123456789abcdef0123', { expiresIn: '1h' });
    await log(s, '2026-03-10');
    s.tok = bob;
    await log(s, '2026-03-11');
    const d = s.db();
    const ins = d.prepare("INSERT INTO workout_tombstones (user_id, date, workout_id, kind, ex_uuid, uuid) VALUES (?, ?, 0, 'exercise', '', ?)");
    ins.run(user.id, '2026-03-11', 'b-gone');
    ins.run(null, '2026-03-12', 'null-gone');
    const amyId = d.prepare("SELECT id FROM users WHERE username = 'amy'").get().id;
    ins.run(amyId, '2026-03-10', 'a-gone');
    d.close();
    s.tok = amy;
    await s.call('DELETE', '/api/settings/clear-data');
    const q = s.db();
    try {
      const rows = (t) => q.prepare(`SELECT user_id FROM ${t}`).all().map((r) => r.user_id);
      assert.deepEqual(rows('cardio_log'), [user.id]);
      assert.deepEqual(rows('workout_log'), [user.id]);
      assert.deepEqual(rows('workout_tombstones').sort(), [null, user.id].sort());
    } finally { q.close(); }
  });
});
