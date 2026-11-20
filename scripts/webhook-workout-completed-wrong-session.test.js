/**
 * workout.completed sends the session that was just completed, not the
 * day's first one. Real server on a scratch database, local receiver.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
let ready = false;
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); ready = true; } catch { /* skip */ }

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keep = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'NODE_OPTIONS'];
const cleanEnv = () => Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));

const PW = 'Str0ng-Pass-77!x';
const DAY = '2026-10-20';
let proc = null, base = null, dir = null, receiver = null, session = null;
const deliveries = [];

async function app(method, path, body) {
  const r = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

test.before(async () => {
  if (!ready) return;
  dir = mkdtempSync(join(tmpdir(), 'lt-wh-session-'));
  const hookPort = await freePort();
  receiver = createHttpServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { deliveries.push(JSON.parse(raw)); res.writeHead(200).end('ok'); });
  });
  await new Promise((r) => receiver.listen(hookPort, '127.0.0.1', r));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ['index.js'], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)),
    env: {
      ...cleanEnv(), PORT: String(port), DB_PATH: join(dir, 'lt.db'), UPLOADS_PATH: join(dir, 'uploads'),
      BACKUPS_PATH: join(dir, 'backups'), JWT_SECRET: 'wh-session-test-0123456789abcdef0123456',
      INSECURE_COOKIES: '1', NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off',
      WEBHOOKS_ENABLED: '1', ALLOW_PRIVATE_WEBHOOK_URLS: '1',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 150; i++) {
    if (proc.exitCode != null) throw new Error('server exited at startup');
    try { if ((await fetch(base + '/api/auth/status')).ok) break; } catch { /* not up yet */ }
    await sleep(100);
  }
  const reg = await app('POST', '/api/auth/register', { username: 'lifter', password: PW });
  session = reg.token;
  assert.ok(session, JSON.stringify(reg));
  await app('POST', '/api/webhooks', { url: `http://127.0.0.1:${hookPort}/hook`, events: ['workout.completed'] });
});

test.after(async () => {
  if (proc) { const p = proc; proc = null; await new Promise((r) => { if (p.exitCode != null || p.signalCode != null) return r(); p.once('exit', r); p.kill(); }); }
  if (receiver) await new Promise((r) => receiver.close(r));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const opts = { skip: !ready && 'server packages not installed' };
const entry = (uuid, name, weight) => ({ uuid, exercise_name: name, sets: [{ uuid: `${uuid}-s`, reps: 5, weight, completed: true }] });

test('completing the second session of a day sends that session, with session_seq', opts, async () => {
  await app('PUT', `/api/workout/${DAY}`, { exercises: [entry('a', 'Squat', 100)], completed: false, client_key: 'k1' });
  await app('PUT', `/api/workout/${DAY}`, { exercises: [entry('b', 'Bench Press', 60)], completed: true, new_session: true, client_key: 'k2' });
  for (let i = 0; i < 40 && !deliveries.length; i++) await sleep(150);
  await sleep(300);
  const done = deliveries.filter(d => d.event === 'workout.completed');
  assert.equal(done.length, 1);
  const d = done[0].data;
  assert.equal(d.session_seq, 1);
  assert.equal(d.completed, true);
  assert.deepEqual(d.exercises.map(e => e.exercise_name), ['Bench Press']);
  assert.equal(d.exercises[0].sets[0].weight, 60);
});

test('the first session still reports session_seq 0', opts, async () => {
  const from = deliveries.length;
  await app('PUT', '/api/workout/2026-10-21', { exercises: [entry('c', 'Deadlift', 140)], completed: true, client_key: 'k3' });
  for (let i = 0; i < 40 && deliveries.length === from; i++) await sleep(150);
  const d = deliveries[from].data;
  assert.equal(d.session_seq, 0);
  assert.deepEqual(d.exercises.map(e => e.exercise_name), ['Deadlift']);
});
