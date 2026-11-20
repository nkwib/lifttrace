/** Duplicate usernames answer 409 (register, accept-invite); 5xx bodies stay generic. */
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
const JWT_SECRET = 'dupname-test-0123456789abcdef0123456789';
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
  dir = mkdtempSync(join(tmpdir(), 'lt-dupname-'));
  await boot();
  await ok(null, 'POST', '/api/auth/register', { username: 'admin', password: PW });
  tok.admin = (await ok(null, 'POST', '/api/auth/login', { username: 'admin', password: PW })).token;
});
test.after(async () => { try { await stop(); } finally { if (dir) rmSync(dir, { recursive: true, force: true }); } });

const inviteToken = async () => {
  const inv = await ok('admin', 'POST', '/api/auth/invite', { role: 'member' });
  return new URL(inv.inviteUrl.replace('#/', '')).searchParams.get('token');
};

test('register: a taken username (any case or spacing) is 409, not a database error', { skip: !ready }, async () => {
  await ok('admin', 'POST', '/api/auth/register', { username: 'bob', password: PW, role: 'member' });
  for (const u of ['bob', 'Bob ', ' BOB']) {
    const r = await call('admin', 'POST', '/api/auth/register', { username: u, password: PW, role: 'member' });
    assert.equal(r.status, 409, u);
    assert.equal(r.data.error, 'Username already taken');
    assert.ok(!/UNIQUE|SQLITE/i.test(JSON.stringify(r.data)));
  }
});

test('non-string or blank username is 400', { skip: !ready }, async () => {
  for (const u of [{ a: 1 }, 42, ['x'], '   ', '', null]) {
    assert.equal((await call('admin', 'POST', '/api/auth/register', { username: u, password: PW })).status, 400, JSON.stringify(u));
    assert.equal((await call(null, 'POST', '/api/auth/accept-invite', { token: 'x', username: u, password: PW })).status, 400, JSON.stringify(u));
  }
});

test('accept-invite: a taken username is 409 and the invite stays usable', { skip: !ready }, async () => {
  const token = await inviteToken();
  const r = await call(null, 'POST', '/api/auth/accept-invite', { token, username: 'BOB', password: PW });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, 'Username already taken');
  const again = await call(null, 'POST', '/api/auth/accept-invite', { token, username: 'carol', password: PW });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.equal(again.data.user.username, 'carol');
});

test('the global error handler hides unexpected and SQLite messages but keeps status-carrying ones', async () => {
  const { errorHandler } = await import('../server/lib/error-handler.js');
  const run = (err, headersSent = false) => {
    const out = {};
    const res = { headersSent, status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
    errorHandler(err, { method: 'GET', path: '/x' }, res, () => {});
    return out;
  };
  const sqlite = Object.assign(new Error('UNIQUE constraint failed: users.username'), { code: 'SQLITE_CONSTRAINT_UNIQUE', status: 409 });
  assert.deepEqual(run(sqlite).body, { error: 'Internal server error' });
  assert.deepEqual(run(new Error('secret path /srv/x')).body, { error: 'Internal server error' });
  assert.equal(run(new Error('boom')).status, 500);
  const http = run(Object.assign(new Error('Username already taken'), { status: 409 }));
  assert.equal(http.status, 409);
  assert.deepEqual(http.body, { error: 'Username already taken' });
  assert.equal(run(new Error('x'), true).status, undefined);
});
