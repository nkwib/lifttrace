/**
 * Coach prescription dates: a calendar date or none, on create and edit,
 * against the real server on a scratch database.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as netServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
let ready = false;
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); ready = true; } catch { /* server packages missing: skip */ }

const freePort = () => new Promise((res) => { const s = netServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PW = 'Str0ng-Pass-77!x';
const JWT_SECRET = 'rx-date-test-0123456789abcdef0123456789';
const BAD = 'date must be a calendar date, YYYY-MM-DD';
let proc, base, dir;
const tok = {}, ids = {};
const serverDir = fileURLToPath(new URL('../server/', import.meta.url));

async function call(who, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (who) headers.Authorization = `Bearer ${tok[who]}`;
  const r = await fetch(base + path, { method, headers, body: body == null || method === 'GET' ? undefined : JSON.stringify(body) });
  const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}
const ok = async (...a) => { const r = await call(...a); assert.ok(r.status < 300, `${a[1]} ${a[2]} -> ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); return r.data; };
const db = () => new (serverRequire('better-sqlite3'))(join(dir, 'lt.db'));

test.before(async () => {
  if (!ready) return;
  dir = mkdtempSync(join(tmpdir(), 'lt-rx-date-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'NODE_OPTIONS'];
  const env = Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
  proc = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...env, PORT: String(port), DB_PATH: join(dir, 'lt.db'), UPLOADS_PATH: join(dir, 'uploads'), BACKUPS_PATH: join(dir, 'backups'), JWT_SECRET, INSECURE_COOKIES: '1', NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(base + '/api/auth/status')).ok) break; } catch { /* not up yet */ }
    await sleep(100);
  }
  await ok(null, 'POST', '/api/auth/register', { username: 'admin', password: PW, full_name: 'Ada Admin' });
  tok.admin = (await ok(null, 'POST', '/api/auth/login', { username: 'admin', password: PW })).token;
  const jwt = serverRequire('jsonwebtoken');
  for (const [name, role] of [['coach', 'trainer'], ['client', 'member']]) {
    const { user } = await ok('admin', 'POST', '/api/auth/register', { username: name, password: PW, full_name: name, role });
    ids[name] = user.id;
    tok[name] = jwt.sign({ id: user.id, username: name, role }, JWT_SECRET, { expiresIn: '1h' });
    if (role === 'member') await ok('admin', 'PUT', `/api/auth/users/${user.id}/trainer`, { trainer_id: null });
  }
  const r = await ok('coach', 'POST', `/api/trainer/members/${ids.client}`, {});
  await ok('client', 'POST', `/api/coaching/pairings/${r.id}/accept`);
});
test.after(async () => {
  try {
    const p = proc; proc = null;
    if (p && p.exitCode == null && p.signalCode == null) await new Promise((r) => { p.once('exit', r); p.kill(); });
  } finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
});

const create = (body) => call('coach', 'POST', `/api/trainer/members/${ids.client}/prescriptions`, { name: 'Leg Day', exercises: [], ...body });
const count = () => { const d = db(); try { return d.prepare('SELECT COUNT(*) c FROM coach_prescriptions').get().c; } finally { d.close(); } };
const rowOf = (id) => { const d = db(); try { return d.prepare('SELECT * FROM coach_prescriptions WHERE id = ?').get(id); } finally { d.close(); } };

test('create refuses a date that is not a calendar day, and makes no row', { skip: !ready }, async () => {
  const n = count();
  for (const date of ['2026-13-40', 'tomorrow', '2026-05-01T10:00:00Z', 20260501, {}]) {
    const r = await create({ date });
    assert.equal(r.status, 400, JSON.stringify(date));
    assert.equal(r.data.error, BAD);
  }
  assert.equal(count(), n);
});

test('a bad create does not use up its client_key', { skip: !ready }, async () => {
  const client_key = 'rx-date-key-1';
  assert.equal((await create({ date: 'tomorrow', client_key })).status, 400);
  const good = await create({ date: '2026-05-01', client_key });
  assert.equal(good.status, 200);
  assert.equal(good.data.date, '2026-05-01');
});

test('create keeps a valid date; none or empty is no date', { skip: !ready }, async () => {
  assert.equal((await create({ date: '2026-02-28' })).data.date, '2026-02-28');
  for (const date of ['', null, undefined]) {
    const r = await create({ date });
    assert.equal(r.status, 200);
    assert.equal(rowOf(r.data.id).date, null);
  }
});

test('a bad edit leaves the row and its activity alone', { skip: !ready }, async () => {
  const px = (await create({ date: '2026-05-01' })).data;
  const d = db();
  d.prepare(`INSERT INTO coach_activity (trainer_id, member_id, kind, prescription_id) VALUES (?, ?, 'prescription_completed', ?)`).run(ids.coach, ids.client, px.id);
  d.close();
  const before = rowOf(px.id);
  for (const date of ['2026-13-40', 'tomorrow', 5]) {
    const r = await call('coach', 'PUT', `/api/trainer/prescriptions/${px.id}`, { date, notes: 'changed' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, BAD);
  }
  assert.deepEqual(rowOf(px.id), before);
  const d2 = db();
  assert.equal(d2.prepare('SELECT COUNT(*) c FROM coach_activity WHERE prescription_id = ?').get(px.id).c, 1);
  d2.close();
});

test('edit: a valid date moves it; empty or null clears it; omitting keeps it', { skip: !ready }, async () => {
  const px = (await create({ date: '2026-05-01' })).data;
  const put = (b) => ok('coach', 'PUT', `/api/trainer/prescriptions/${px.id}`, b);
  await put({ date: '2026-06-02' });
  assert.equal(rowOf(px.id).date, '2026-06-02');
  await put({ notes: 'x' });
  assert.equal(rowOf(px.id).date, '2026-06-02');
  await put({ date: '' });
  assert.equal(rowOf(px.id).date, null);
  await put({ date: '2026-06-03' });
  await put({ date: null });
  assert.equal(rowOf(px.id).date, null);
});

test('a stored bad date is left alone by an edit that omits date', { skip: !ready }, async () => {
  const px = (await create({ date: '2026-05-01' })).data;
  const d = db(); d.prepare('UPDATE coach_prescriptions SET date = ? WHERE id = ?').run('legacy junk', px.id); d.close();
  await ok('coach', 'PUT', `/api/trainer/prescriptions/${px.id}`, { notes: 'still editable' });
  const row = rowOf(px.id);
  assert.equal(row.date, 'legacy junk');
  assert.equal(row.notes, 'still editable');
});
