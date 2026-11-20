/** Unknown roles are rejected (400) on register and invite; valid roles still work. */
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
// Opened, not just required: a binding built for another Node version
// loads only when a database opens.
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); ready = true; } catch { /* server packages missing: skip */ }

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanEnv = () => {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'NODE_OPTIONS'];
  return Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
};

const PW = 'Str0ng-Pass-77!x';
const JWT_SECRET = 'rolevalid-test-0123456789abcdef0123456789';
let proc = null, base = null, dir = null;
const tok = {};
const ids = {};

async function call(who, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (who) headers.Authorization = `Bearer ${tok[who]}`;
  const r = await fetch(base + path, { method, headers, body: body == null || method === 'GET' ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}
const ok = async (...a) => { const r = await call(...a); assert.ok(r.status < 300, `${a[1]} ${a[2]} -> ${r.status} ${JSON.stringify(r.data)}`); return r.data; };

async function boot() {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ['index.js'], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)),
    env: { ...cleanEnv(), PORT: String(port), DB_PATH: join(dir, 'lt.db'), UPLOADS_PATH: join(dir, 'uploads'), BACKUPS_PATH: join(dir, 'backups'), JWT_SECRET, INSECURE_COOKIES: '1', NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(base + '/api/auth/status')).ok) return; } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('server did not start');
}
async function stop() {
  if (!proc) return;
  const p = proc; proc = null;
  // A server that already exited never says so again: waiting for it hung.
  if (p.exitCode != null || p.signalCode != null) return;
  await new Promise((r) => { p.once('exit', r); p.kill(); });
}

test.before(async () => {
  if (!ready) return;
  dir = mkdtempSync(join(tmpdir(), 'lt-rolevalid-'));
  await boot();
  await ok(null, 'POST', '/api/auth/register', { username: 'admin', password: PW });
  tok.admin = (await ok(null, 'POST', '/api/auth/login', { username: 'admin', password: PW })).token;
});
test.after(async () => { try { await stop(); } finally { if (dir) rmSync(dir, { recursive: true, force: true }); } });

test('register and invite reject unknown or non-string roles with 400', { skip: !ready }, async () => {
  for (const role of ['superuser', 'ADMIN', ['admin'], { a: 1 }, 5]) {
    const r = await call('admin', 'POST', '/api/auth/register', { username: 'x' + Math.random().toString(36).slice(2, 8), password: PW, role });
    assert.equal(r.status, 400, JSON.stringify(role));
    assert.equal(r.data.error, 'Invalid role');
    const i = await call('admin', 'POST', '/api/auth/invite', { role });
    assert.equal(i.status, 400, JSON.stringify(role));
    assert.equal(i.data.error, 'Invalid role');
  }
});

test('valid roles still succeed; omitted role defaults to member', { skip: !ready }, async () => {
  for (const role of ['admin', 'trainer', 'member']) {
    await ok('admin', 'POST', '/api/auth/register', { username: 'u-' + role, password: PW, role });
    await ok('admin', 'POST', '/api/auth/invite', { role });
  }
  await ok('admin', 'POST', '/api/auth/register', { username: 'u-default', password: PW });
  await ok('admin', 'POST', '/api/auth/invite', {});
});
