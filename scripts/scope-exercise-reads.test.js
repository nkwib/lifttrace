/**
 * GET /api/exercises/:id and /media-urls answer for the library and the
 * caller's own custom exercises only; another member's private ones are 404
 * (or absent from the list), as in the exercise list and sync pull.
 */
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as netServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canReadExercise } from '../server/lib/exercise-owner.js';

const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
let ready = false;
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); ready = true; } catch { /* server packages missing: skip */ }
const skip = !ready && 'server packages missing';

const freePort = () => new Promise((res) => { const s = netServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanEnv = () => {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'NODE_OPTIONS'];
  return Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
};
const PW = 'Str0ng-Pass-77!x';
const JWT_SECRET = 'scope-reads-test-0123456789abcdef01234';
const serverDir = fileURLToPath(new URL('../server/', import.meta.url));

function server() {
  const s = { tok: {}, ids: {} };
  s.dir = mkdtempSync(join(tmpdir(), 'lt-scope-ex-'));
  s.env = () => ({ ...cleanEnv(), DB_PATH: join(s.dir, 'lt.db'), UPLOADS_PATH: join(s.dir, 'uploads'), BACKUPS_PATH: join(s.dir, 'backups'), JWT_SECRET, INSECURE_COOKIES: '1', NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off', PUBLIC_API_ENABLED: '1' });
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
  s.stop = async () => { const p = s.proc; s.proc = null; if (p && p.exitCode == null && p.signalCode == null) await new Promise((r) => { p.once('exit', r); p.kill(); }); };
  s.call = async (who, method, path, body, headers = {}) => {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (who) h.Authorization = `Bearer ${s.tok[who]}`;
    const r = await fetch(s.base + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
    const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = t; }
    return { status: r.status, data };
  };
  s.ok = async (...a) => { const r = await s.call(...a); assert.ok(r.status < 300, `${a[1]} ${a[2]} -> ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); return r.data; };
  s.db = () => new (serverRequire('better-sqlite3'))(join(s.dir, 'lt.db'));
  // Async, so the stand-in ntfy in this process can answer the pushes the
  // child sends while it runs.
  s.node = (code) => new Promise((res, rej) => execFile(process.execPath, ['--input-type=module', '-e', code], { cwd: serverDir, env: s.env(), encoding: 'utf8', timeout: 60000 }, (e, out) => (e ? rej(e) : res(out))));
  s.user = async (name, role, full_name) => {
    const { user } = await s.ok('admin', 'POST', '/api/auth/register', { username: name, password: PW, full_name, role });
    s.ids[name] = user.id;
    s.tok[name] = serverRequire('jsonwebtoken').sign({ id: user.id, username: name, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    if (role === 'member') await s.ok('admin', 'PUT', `/api/auth/users/${user.id}/trainer`, { trainer_id: null });
  };
  s.close = async () => { await s.stop(); rmSync(s.dir, { recursive: true, force: true }); };
  return s;
}


let S;
test.before(async () => {
  if (!ready) return;
  S = server();
  await S.boot();
  await S.ok(null, 'POST', '/api/auth/register', { username: 'admin', password: PW, full_name: 'Ada Admin' });
  S.tok.admin = (await S.ok(null, 'POST', '/api/auth/login', { username: 'admin', password: PW })).token;
  await S.user('alice', 'member', 'Alice A');
  await S.user('bob', 'member', 'Bob B');
});
test.after(async () => { await S?.close(); });

test('canReadExercise: global, own, and no-accounts mode', () => {
  assert.equal(canReadExercise(null, 1), false);
  assert.equal(canReadExercise({ is_global: 1, created_by: null }, 2), true);
  assert.equal(canReadExercise({ is_global: 0, created_by: 1 }, 1), true);
  assert.equal(canReadExercise({ is_global: 0, created_by: 1 }, '1'), true);
  assert.equal(canReadExercise({ is_global: 0, created_by: 1 }, 2), false);
  assert.equal(canReadExercise({ is_global: 0, created_by: null }, 2), false, 'legacy unowned row');
  assert.equal(canReadExercise({ is_global: 0, created_by: 1 }, null), true, 'user management off');
  assert.equal(canReadExercise({ is_global: 0, created_by: null }, null), true);
});

test('another member cannot read a private exercise by id or see its media', { skip }, async () => {
  const mine = await S.ok('alice', 'POST', '/api/exercises', { name: 'Alice Private Lift', category: 'strength', gif_url: 'https://x.test/alice.gif' });
  const aid = mine.id;
  const gdb = S.db();
  const glob = gdb.prepare("SELECT id FROM exercises WHERE is_global = 1 LIMIT 1").get()
    || { id: Number(gdb.prepare("INSERT INTO exercises (name, category, is_global, gif_url, source) VALUES ('Shared Lift', 'strength', 1, 'https://x.test/shared.gif', 'seed')").run().lastInsertRowid) };
  gdb.prepare("UPDATE exercises SET gif_url = COALESCE(gif_url, 'https://x.test/shared.gif') WHERE id = ?").run(glob.id);
  const gurl = gdb.prepare('SELECT gif_url FROM exercises WHERE id = ?').get(glob.id).gif_url;
  gdb.close();

  assert.equal((await S.call('bob', 'GET', `/api/exercises/${aid}`)).status, 404);
  assert.equal((await S.call('alice', 'GET', `/api/exercises/${aid}`)).status, 200);
  assert.equal((await S.call('bob', 'GET', `/api/exercises/${glob.id}`)).status, 200);
  assert.equal((await S.call('alice', 'GET', `/api/exercises/${glob.id}`)).status, 200);

  const bobUrls = (await S.ok('bob', 'GET', '/api/exercises/media-urls')).urls;
  assert.ok(!bobUrls.includes('https://x.test/alice.gif'));
  assert.ok(bobUrls.includes(gurl));
  assert.ok((await S.ok('alice', 'GET', '/api/exercises/media-urls')).urls.includes('https://x.test/alice.gif'));

  // The owner still reads a soft-deleted one; the other member still cannot.
  const d = S.db();
  d.prepare("UPDATE exercises SET deleted_at = datetime('now') WHERE id = ?").run(aid);
  d.close();
  assert.equal((await S.call('alice', 'GET', `/api/exercises/${aid}`)).status, 200);
  assert.equal((await S.call('bob', 'GET', `/api/exercises/${aid}`)).status, 404);
});
