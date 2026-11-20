/**
 * Response compression, against the real server (server/index.js on a
 * scratch database).
 *
 * The Docker image has no nginx in front, so Express compresses: JSON and
 * the app bundle go out as gzip/br, server-sent events (MCP) never are,
 * nor pictures, which are compressed already.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
let ready = false;
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); serverRequire('compression'); ready = true; } catch { /* server packages missing: skip */ }
const skip = ready ? false : 'needs the server dependencies';

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanEnv = () => {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'NODE_OPTIONS'];
  return Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
};
const PW = 'Str0ng-Pass-77!x';
const SECRET = 'compression-test-0123456789abcdef0123456789';
let proc = null, base = null, dir = null, token = null, apiToken = null;

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
  dir = mkdtempSync(join(tmpdir(), 'lt-compression-'));
  mkdirSync(join(dir, 'uploads', 'exercises'), { recursive: true });
  writeFileSync(join(dir, 'uploads', 'exercises', 'a.png'), Buffer.alloc(4096, 7));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ['index.js'], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)),
    env: {
      ...cleanEnv(), TZ: 'UTC', PORT: String(port), DB_PATH: join(dir, 'lt.db'), UPLOADS_PATH: join(dir, 'uploads'),
      BACKUPS_PATH: join(dir, 'backups'), JWT_SECRET: SECRET, INSECURE_COOKIES: '1',
      NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off', MCP_ENABLED: '1', API_RATE_LIMIT_PER_MIN: '5000',
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
  apiToken = (await ok('POST', '/api/admin/api-tokens', { name: 'mcp', scopes: ['mcp:read'], password: PW })).raw;
  for (let i = 0; i < 40; i++) {
    await ok('POST', '/api/exercises', { name: `Exercise ${i}`, category: 'strength', primary_muscles: ['chest'], instructions: 'Lower under control, press back up.' });
  }
});
test.after(async () => {
  try {
    if (proc && proc.exitCode == null && proc.signalCode == null) await new Promise((r) => { proc.once('exit', r); proc.kill(); });
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

test('JSON goes out compressed when the client accepts it, plain when not', { skip }, async () => {
  const auth = { Authorization: `Bearer ${token}` };
  const plain = await wire('/api/exercises', auth);
  assert.equal(plain.status, 200);
  assert.equal(plain.headers['content-encoding'], undefined);
  const br = await wire('/api/exercises', { ...auth, 'Accept-Encoding': 'gzip, br' });
  assert.equal(br.headers['content-encoding'], 'br');
  assert.match(String(br.headers.vary), /Accept-Encoding/i);
  assert.ok(br.body.length < plain.body.length / 3, `${br.body.length} vs ${plain.body.length}`);
  const gz = await wire('/api/exercises', { ...auth, 'Accept-Encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
});

test('server-sent events are never compressed', { skip }, async () => {
  const r = await wire('/api/mcp', {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${apiToken}`, 'Accept-Encoding': 'gzip, br',
  }, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
  assert.equal(r.status, 200);
  // The MCP SDK also sends Cache-Control: no-transform; the filter in
  // index.js covers any event stream that doesn't.
  if (/event-stream/.test(String(r.headers['content-type']))) {
    assert.equal(r.headers['content-encoding'], undefined);
    assert.match(r.body.toString('utf8'), /tools/);
  }
});

test('pictures are not compressed again', { skip }, async () => {
  const img = await wire('/uploads/exercises/a.png', { 'Accept-Encoding': 'gzip, br' });
  assert.equal(img.status, 200);
  assert.equal(img.headers['content-encoding'], undefined);
  assert.equal(img.body.length, 4096);
});
