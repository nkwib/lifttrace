/**
 * The uploads mount, against the real server (server/index.js on a scratch
 * database). /uploads is served before authenticate, so a picture costs no
 * token check or session lookup, and the private body-stats tree still
 * answers 404 to anyone, signed in or not.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
let ready = false;
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); ready = true; } catch { /* server packages missing: skip */ }
const skip = ready ? false : 'needs the server dependencies';

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanEnv = () => {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'NODE_OPTIONS'];
  return Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
};
const PW = 'Str0ng-Pass-77!x';
const SECRET = 'uploads-test-0123456789abcdef0123456789';
let proc = null, base = null, dir = null, token = null;

// Raw bytes on the wire: fetch() would decompress.
const wire = (path, headers = {}, { method = 'GET', body } = {}) => new Promise((res, rej) => {
  const r = http.request(base + path, { method, headers }, (resp) => {
    const chunks = [];
    resp.on('data', (c) => chunks.push(c));
    resp.on('end', () => res({ status: resp.statusCode, headers: resp.headers, body: Buffer.concat(chunks) }));
  });
  r.on('error', rej);
  r.end(body);
});
async function ok(method, path, body, auth = token) {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  assert.ok(r.status < 300, `${method} ${path} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

test.before(async () => {
  if (!ready) return;
  dir = mkdtempSync(join(tmpdir(), 'lt-uploads-'));
  mkdirSync(join(dir, 'uploads', 'exercises'), { recursive: true });
  mkdirSync(join(dir, 'uploads', 'body-stats'), { recursive: true });
  writeFileSync(join(dir, 'uploads', 'exercises', 'a.png'), Buffer.alloc(4096, 7));
  writeFileSync(join(dir, 'uploads', 'body-stats', 'p.jpg'), Buffer.alloc(64, 1));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ['index.js'], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)),
    env: {
      ...cleanEnv(), TZ: 'UTC', PORT: String(port), DB_PATH: join(dir, 'lt.db'), UPLOADS_PATH: join(dir, 'uploads'),
      BACKUPS_PATH: join(dir, 'backups'), JWT_SECRET: SECRET, INSECURE_COOKIES: '1',
      NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off', API_RATE_LIMIT_PER_MIN: '5000',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 300; i++) {
    if (proc.exitCode != null) throw new Error('server exited at startup');
    try { if ((await fetch(base + '/api/auth/status')).ok) break; } catch { /* not up yet */ }
    await sleep(100);
  }
  await ok('POST', '/api/auth/register', { username: 'sam', password: PW, full_name: 'Sam Lee' }, null);
  token = (await ok('POST', '/api/auth/login', { username: 'sam', password: PW }, null)).token;
});
test.after(async () => {
  try {
    if (proc && proc.exitCode == null && proc.signalCode == null) await new Promise((r) => { proc.once('exit', r); proc.kill(); });
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

test('uploads: public files served, private tree 404', { skip }, async () => {
  const img = await wire('/uploads/exercises/a.png');
  assert.equal(img.status, 200);
  assert.equal(img.body.length, 4096);
  for (const p of ['/uploads/body-stats/p.jpg', '/uploads/%62ody-stats/p.jpg', '/uploads//body-stats/p.jpg']) {
    assert.equal((await wire(p)).status, 404, p);
    assert.equal((await wire(p, { Cookie: `lt_token=${token}` })).status, 404, `${p} with a session`);
  }
});

test('/uploads is mounted before authenticate', () => {
  const src = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const guard = src.indexOf('isPrivateUploadPath(req.path)');
  const statik = src.indexOf("router.use('/uploads', express.static");
  const auth = src.indexOf('router.use(authenticate);');
  assert.ok(guard > -1 && statik > -1 && auth > -1);
  assert.ok(guard < statik && statik < auth, 'private guard, then static, then authenticate');
  assert.ok(src.indexOf('router.use(crossSiteGuard(') < guard, 'the cross-site guard still runs first');
});
