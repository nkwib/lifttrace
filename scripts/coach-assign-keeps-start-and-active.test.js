/**
 * A coach's re-assign (POST /api/programs/:id/assign) keeps what the row
 * already has: no start_date keeps the date, make_active:false leaves an
 * active row active. An explicit start_date still changes it, and
 * make_active:true still makes this the only active program. Against the
 * real server on a scratch database.
 */
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
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
const JWT_SECRET = 'deleted-programs-test-0123456789abcdef';
const serverDir = fileURLToPath(new URL('../server/', import.meta.url));
const ALL = `/api/sync/pull?since=${encodeURIComponent('1970-01-01T00:00:00.000Z')}`;

function server() {
  const s = { tok: {}, ids: {} };
  s.dir = mkdtempSync(join(tmpdir(), 'lt-deleted-programs-'));
  s.env = () => ({ ...cleanEnv(), TZ: 'UTC', DB_PATH: join(s.dir, 'lt.db'), UPLOADS_PATH: join(s.dir, 'uploads'), BACKUPS_PATH: join(s.dir, 'backups'), JWT_SECRET, INSECURE_COOKIES: '1', NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off' });
  s.boot = async () => {
    const port = await freePort();
    s.base = `http://127.0.0.1:${port}`;
    s.proc = spawn(process.execPath, ['index.js'], { cwd: serverDir, env: { ...s.env(), PORT: String(port) }, stdio: ['ignore', 'ignore', process.env.SRV_LOG ? 'inherit' : 'ignore'] });
    for (let i = 0; i < 300; i++) {
      try { if ((await fetch(s.base + '/api/auth/status')).ok) return; } catch { /* not up yet */ }
      await sleep(100);
    }
    throw new Error('server did not start');
  };
  s.call = async (who, method, path, body, headers = {}) => {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (who && s.tok[who]) h.Authorization = `Bearer ${s.tok[who]}`;
    const r = await fetch(s.base + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
    const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = t; }
    return { status: r.status, data };
  };
  s.ok = async (...a) => { const r = await s.call(...a); assert.ok(r.status < 300, `${a[1]} ${a[2]} -> ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); return r.data; };
  s.node = (code) => new Promise((res, rej) => execFile(process.execPath, ['--input-type=module', '-e', code], { cwd: serverDir, env: s.env(), encoding: 'utf8', timeout: 60000 }, (e, out) => (e ? rej(e) : res(out))));
  s.user = async (name, role) => {
    const { user } = await s.ok('admin', 'POST', '/api/auth/register', { username: name, password: PW, role });
    s.ids[name] = user.id;
    s.tok[name] = serverRequire('jsonwebtoken').sign({ id: user.id, username: name, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    if (role === 'member') await s.ok('admin', 'PUT', `/api/auth/users/${user.id}/trainer`, { trainer_id: null });
  };
  s.close = async () => {
    const p = s.proc; s.proc = null;
    if (p && p.exitCode == null && p.signalCode == null) await new Promise((r) => { p.once('exit', r); p.kill(); });
    rmSync(s.dir, { recursive: true, force: true });
  };
  return s;
}


test('re-assign keeps the start date and the active flag', { skip }, async () => {
  const S = server();
  await S.boot();
  try {
    await S.ok(null, 'POST', '/api/auth/register', { username: 'admin', password: PW });
    S.tok.admin = (await S.ok(null, 'POST', '/api/auth/login', { username: 'admin', password: PW })).token;
    await S.user('coach', 'trainer');
    await S.user('client', 'member');
    const pairing = await S.ok('coach', 'POST', `/api/trainer/members/${S.ids.client}`, {});
    await S.ok('client', 'POST', `/api/coaching/pairings/${pairing.id}/accept`);
    const A = await S.ok('coach', 'POST', '/api/programs', { name: 'Plan A' });
    const B = await S.ok('coach', 'POST', '/api/programs', { name: 'Plan B' });
    const assign = (id, body) => S.ok('coach', 'POST', `/api/programs/${id}/assign`, { user_id: S.ids.client, ...body });
    const row = async (id) => JSON.parse((await S.node(`import D from 'better-sqlite3'; const d = new D(${JSON.stringify(join(S.dir, 'lt.db'))}, { readonly: true }); console.log(JSON.stringify(d.prepare('SELECT active, start_date FROM program_assignments WHERE program_id = ? AND assigned_to = ?').get(${id}, ${S.ids.client})));`)).trim());

    await assign(A.id, { start_date: '2026-01-05' });
    assert.deepEqual(await row(A.id), { active: 1, start_date: '2026-01-05' });
    await assign(A.id, { make_active: true });
    assert.deepEqual(await row(A.id), { active: 1, start_date: '2026-01-05' }, 're-assign without a start date keeps it');
    await assign(A.id, { start_date: '2026-02-02' });
    assert.deepEqual(await row(A.id), { active: 1, start_date: '2026-02-02' }, 'an explicit start date changes it');
    await assign(A.id, { make_active: false });
    assert.deepEqual(await row(A.id), { active: 1, start_date: '2026-02-02' }, 'make_active:false leaves an active row active');

    await assign(B.id, { make_active: false });
    assert.deepEqual(await row(B.id), { active: 0, start_date: null }, 'a new row with make_active:false is inactive');
    assert.equal((await row(A.id)).active, 1, 'and does not disturb the active one');
    await assign(B.id, { make_active: true });
    assert.equal((await row(B.id)).active, 1, 'make_active:true activates an inactive row');
    assert.equal((await row(A.id)).active, 0, 'and deactivates the others');
    assert.equal((await row(A.id)).start_date, '2026-02-02');
  } finally { await S.close(); }
});
