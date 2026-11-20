/**
 * A :date that isn't a calendar day (undefined, 2026-13-99, 2026-02-30) is
 * refused with 400 on workout and body-stats writes, and on cardio writes,
 * before anything is stored; a cardio date with a time on it keeps its day.
 * Real server on a scratch database.
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
let Database = null;
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); Database = D; } catch { /* server packages missing: skip */ }
const skip = Database ? false : 'needs the server dependencies';

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanEnv = () => {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'NODE_OPTIONS'];
  return Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
};
const PW = 'Str0ng-Pass-77!x';
let proc = null, base = null, dir = null, token = null, apiToken = null, userId = null;

async function call(method, path, body, headers = {}, auth = token) {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...headers },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
async function ok(method, path, body, headers, auth) {
  const r = await call(method, path, body, headers, auth);
  assert.ok(r.status < 300, `${method} ${path} -> ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
}
const rawDb = () => new Database(join(dir, 'lt.db'));
const count = (table) => { const d = rawDb(); try { return d.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c; } finally { d.close(); } };

test.before(async () => {
  if (!Database) return;
  dir = mkdtempSync(join(tmpdir(), 'lt-write-dates-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ['index.js'], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)),
    env: {
      ...cleanEnv(), TZ: 'UTC', PORT: String(port), DB_PATH: join(dir, 'lt.db'), UPLOADS_PATH: join(dir, 'uploads'),
      BACKUPS_PATH: join(dir, 'backups'), JWT_SECRET: 'write-dates-test-0123456789abcdef0123456789', INSECURE_COOKIES: '1',
      NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off',
      MCP_ENABLED: '1', MCP_WRITE_ENABLED: '1', MCP_DESTROY_ENABLED: '1', PUBLIC_API_ENABLED: '1', PUBLIC_API_WRITE_ENABLED: '1', API_RATE_LIMIT_PER_MIN: '5000',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 300; i++) {
    if (proc.exitCode != null) throw new Error('server exited at startup');
    try { if ((await fetch(base + '/api/auth/status')).ok) break; } catch { /* not up yet */ }
    await sleep(100);
  }
  await ok('POST', '/api/auth/register', { username: 'sam', password: PW, full_name: 'Sam Lee' }, {}, null);
  const login = await ok('POST', '/api/auth/login', { username: 'sam', password: PW }, {}, null);
  token = login.token;
  userId = (login.user || (await ok('GET', '/api/auth/me'))).id;
  apiToken = (await ok('POST', '/api/admin/api-tokens', { name: 'Home Assistant', scopes: ['mcp:read', 'mcp:write', 'mcp:destroy'], password: PW })).raw;
});
test.after(async () => {
  try {
    if (proc && proc.exitCode == null && proc.signalCode == null) await new Promise((r) => { proc.once('exit', r); proc.kill(); });
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const BAD = ['undefined', '2026-13-99', '2026-02-30'];

test('workout PUT and DELETE refuse a bad date and write nothing', { skip }, async () => {
  for (const d of BAD) {
    const r = await call('PUT', `/api/workout/${d}`, { exercises: [{ name: 'Squat', sets: [] }] });
    assert.equal(r.status, 400, d);
    assert.match(r.data.error, /calendar date/);
    assert.equal((await call('DELETE', `/api/workout/${d}`)).status, 400, d);
  }
  assert.equal(count('workout_log'), 0);
  const good = await call('PUT', '/api/workout/2026-02-28', { exercises: [{ name: 'Squat', sets: [] }] });
  assert.equal(good.status, 200);
  assert.equal(count('workout_log'), 1);
});

test('body-stats PUT refuses a bad date and writes nothing', { skip }, async () => {
  for (const d of BAD) {
    const r = await call('PUT', `/api/body-stats/${d}`, { stats: { weight: 80 } });
    assert.equal(r.status, 400, d);
  }
  assert.equal(count('body_stats_log'), 0);
  assert.equal((await call('PUT', '/api/body-stats/2026-02-28', { stats: { weight: 80 } })).status, 200);
  assert.equal(count('body_stats_log'), 1);
});

test('cardio refuses a bad date, normalises a time suffix', { skip }, async () => {
  const d = rawDb();
  d.prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'cardioEnabled', 'true')").run(userId);
  d.close();
  const s = { activity: 'Run', duration_min: 30 };
  for (const date of BAD) {
    assert.equal((await call('POST', '/api/cardio', { ...s, date })).status, 400, date);
  }
  assert.equal(count('cardio_log'), 0);
  const made = await call('POST', '/api/cardio', { ...s, date: '2026-03-01T08:00:00' });
  assert.equal(made.status, 200);
  assert.equal(made.data.date, '2026-03-01');
  assert.equal((await call('POST', '/api/cardio', { ...s, date: '2026-03-01' })).status, 200);
  const id = made.data.id;
  for (const date of BAD) {
    assert.equal((await call('PUT', `/api/cardio/${id}`, { date })).status, 400, date);
  }
  assert.equal((await call('PUT', `/api/cardio/${id}`, { notes: 'x' })).data.date, '2026-03-01');
  assert.equal((await call('PUT', `/api/cardio/${id}`, { date: '2026-03-02T10:00' })).data.date, '2026-03-02');
  const pub = await call('POST', '/api/v1/cardio', { ...s, date: '2026-02-30' }, {}, apiToken);
  assert.equal(pub.status, 400);
  assert.equal(count('cardio_log'), 2);
});
