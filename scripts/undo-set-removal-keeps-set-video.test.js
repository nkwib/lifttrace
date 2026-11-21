/**
 * Undo after removing a filmed set/exercise keeps its clip.
 * Undo re-keys sets and exercises with new uuids; the clip is moved onto them
 * with PATCH /api/set-media/:id (server test on a scratch database).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  reinsertSet, reinsertSetWithMap, reinsertExercise, reinsertExerciseWithMap,
  reinsertExercisesWithMap, clipsForUuids, relinkPlan,
} from '../src/lib/undoRemove.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('reinsertSetWithMap maps old to new and the plain variant matches', () => {
  const r = reinsertSetWithMap([{ uuid: 'a' }], { uuid: 'b', reps: 5 }, 1);
  assert.equal(Object.keys(r.uuidMap).length, 1);
  assert.equal(r.uuidMap.b, r.list[1].uuid);
  assert.notEqual(r.uuidMap.b, 'b');
  assert.deepEqual(reinsertSet([{ uuid: 'a' }], { reps: 5 }, 1).map(s => s.reps), [undefined, 5]);
  assert.deepEqual(reinsertSetWithMap([], null, 0), { list: [], uuidMap: {} });
});

test('reinsertExerciseWithMap maps exercise and set uuids', () => {
  const ex = { uuid: 'e', sets: [{ uuid: 's1' }, { uuid: 's2' }] };
  const { list, uuidMap } = reinsertExerciseWithMap([{ uuid: 'x' }], ex, 0);
  assert.equal(uuidMap.e, list[0].uuid);
  assert.equal(uuidMap.s1, list[0].sets[0].uuid);
  assert.equal(uuidMap.s2, list[0].sets[1].uuid);
  assert.equal(reinsertExercise([{ uuid: 'x' }], ex, 0).length, 2);
});

test('reinsertExercisesWithMap maps every member of a superset', () => {
  const removed = [
    { ex: { uuid: 'e1', superset_id: 'g', sets: [{ uuid: 's1' }] }, idx: 0 },
    { ex: { uuid: 'e2', superset_id: 'g', sets: [{ uuid: 's2' }] }, idx: 1 },
  ];
  const { list, uuidMap } = reinsertExercisesWithMap([], removed);
  assert.equal(uuidMap.e1, list[0].uuid);
  assert.equal(uuidMap.e2, list[1].uuid);
  assert.equal(uuidMap.s2, list[1].sets[0].uuid);
});

test('clipsForUuids and relinkPlan', () => {
  const media = [
    { id: 1, exercise_uuid: 'e', set_uuid: 's1' },
    { id: 2, exercise_uuid: 'e', set_uuid: 's2' },
    { id: 3, exercise_uuid: 'o', set_uuid: 'z' },
  ];
  const clips = clipsForUuids(media, ['s1']);
  assert.deepEqual(clips.map(m => m.id), [1]);
  assert.deepEqual(clipsForUuids(media, ['e']).map(m => m.id), [1, 2]);
  assert.deepEqual(clipsForUuids(media, []), []);
  // Set-only undo keeps the exercise uuid.
  assert.deepEqual(relinkPlan(clips, { s1: 'n1' }), [{ id: 1, exercise_uuid: 'e', set_uuid: 'n1' }]);
  assert.deepEqual(relinkPlan(clips, { e: 'ne', s1: 'n1' }), [{ id: 1, exercise_uuid: 'ne', set_uuid: 'n1' }]);
  assert.deepEqual(relinkPlan(clips, {}), []);
});

test('Diary relinks after saveWorkout in the set, exercise and superset undo handlers', () => {
  const d = read('../src/routes/Diary.svelte');
  assert.equal((d.match(/await relinkClips\(clips, uuidMap\)/g) || []).length, 3);
  for (const fn of ['reinsertSetWithMap', 'reinsertExerciseWithMap', 'reinsertExercisesWithMap']) {
    assert.match(d, new RegExp(`${fn}\\(`));
  }
  const body = d.slice(d.indexOf('async function relinkClips'), d.indexOf('// Undo for a removed set'));
  assert.match(body, /catch/);
  assert.match(body, /loadSetMedia\(\$currentDate\)/);
  assert.match(read('../src/lib/api.js'), /relinkSetMedia/);
});

test('the PATCH route is app-internal', () => {
  assert.match(read('../server/routes/set-media.js'), /router\.patch\('\/:id'/);
  assert.ok(!/set-media/.test(read('../server/openapi.yaml')));
});

// Server
const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
let ready = false;
try { const D = serverRequire('better-sqlite3'); new D(':memory:').close(); ready = true; } catch { /* skip */ }

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PW = 'Str0ng-Pass-77!x';
const JWT_SECRET = 'relink-test-0123456789abcdef0123456789';
let proc = null, base = null, dir = null;
const tok = {};

async function call(who, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (who) headers.Authorization = `Bearer ${tok[who]}`;
  const r = await fetch(base + path, { method, headers, body: body == null || method === 'GET' ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const ok = async (...a) => { const r = await call(...a); assert.ok(r.status < 300, `${a[1]} ${a[2]} -> ${r.status} ${JSON.stringify(r.data)}`); return r.data; };

test.before(async () => {
  if (!ready) return;
  dir = mkdtempSync(join(tmpdir(), 'lt-relink-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'NODE_OPTIONS'];
  const env = Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
  proc = spawn(process.execPath, ['index.js'], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)),
    env: { ...env, PORT: String(port), DB_PATH: join(dir, 'lt.db'), UPLOADS_PATH: join(dir, 'uploads'), BACKUPS_PATH: join(dir, 'backups'), JWT_SECRET, INSECURE_COOKIES: '1', NODE_ENV: 'test', LOG_LEVEL: 'error', UPDATE_CHECK: 'off' },
    stdio: 'ignore',
  });
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    try { up = (await fetch(base + '/api/auth/status')).ok; } catch { /* not yet */ }
    if (!up) await sleep(100);
  }
  assert.ok(up, 'server did not start');
  await ok(null, 'POST', '/api/auth/register', { username: 'admin', password: PW, full_name: 'Ada Admin' });
  const r = await ok(null, 'POST', '/api/auth/login', { username: 'admin', password: PW });
  tok.admin = r.token;
  const jwt = serverRequire('jsonwebtoken');
  const { user } = await ok('admin', 'POST', '/api/auth/register', { username: 'other', password: PW, full_name: 'Olly Other', role: 'member' });
  tok.other = jwt.sign({ id: user.id, username: 'other', role: user.role }, JWT_SECRET, { expiresIn: '1h' });
});
test.after(async () => {
  try {
    if (proc && proc.exitCode == null && proc.signalCode == null) await new Promise((r) => { proc.once('exit', r); proc.kill(); });
  } finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
});

test('PATCH relinks only the caller\'s live clip', { skip: !ready }, async () => {
  const DATE = '2026-01-05';
  const w = await ok('admin', 'PUT', `/api/workout/${DATE}`, {
    name: 'Push', completed: true, duration_min: 40, notes: '',
    exercises: [{ uuid: 'ex1', exercise_name: 'Bench Press', sets: [{ uuid: 's1', reps: 5, weight: 100, completed: true }] }],
  });
  const workoutId = w.workout?.id ?? w.id;
  const clip = await ok('admin', 'POST', '/api/set-media', { workout_id: workoutId, exercise_uuid: 'ex1', set_uuid: 's1', url: '/uploads/set-videos/a.mp4' });

  assert.equal((await call('other', 'PATCH', `/api/set-media/${clip.id}`, { set_uuid: 'x' })).status, 404, 'not theirs');
  assert.equal((await call('admin', 'PATCH', `/api/set-media/${clip.id}`, {})).status, 400);
  assert.equal((await call('admin', 'PATCH', `/api/set-media/${clip.id}`, { set_uuid: '  ' })).status, 400);
  assert.equal((await call('admin', 'PATCH', `/api/set-media/${clip.id}`, { set_uuid: 5 })).status, 400);
  assert.equal((await call('admin', 'PATCH', '/api/set-media/99999', { set_uuid: 'x' })).status, 404);
  let day = (await ok('admin', 'GET', `/api/set-media?date=${DATE}`)).media;
  assert.equal(day[0].set_uuid, 's1', 'refused calls changed nothing');

  await ok('admin', 'PATCH', `/api/set-media/${clip.id}`, { set_uuid: 's1-new', exercise_uuid: 'ex1-new' });
  day = (await ok('admin', 'GET', `/api/set-media?date=${DATE}`)).media;
  assert.equal(day[0].set_uuid, 's1-new');
  assert.equal(day[0].exercise_uuid, 'ex1-new');

  await ok('admin', 'DELETE', `/api/set-media/${clip.id}`);
  assert.equal((await call('admin', 'PATCH', `/api/set-media/${clip.id}`, { set_uuid: 'y' })).status, 404, 'deleted clip');
});
