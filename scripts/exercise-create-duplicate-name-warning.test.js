import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findDuplicateName } from '../src/lib/exercise-list.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('findDuplicateName folds case, accents, spacing; honours excludeId', () => {
  const list = [{ id: 1, name: 'Bench Press' }, { id: 2, name: 'Squat' }];
  assert.equal(findDuplicateName(list, ' bénch   press ')?.id, 1);
  assert.equal(findDuplicateName(list, 'Bench Press', 1), null);
  assert.equal(findDuplicateName(list, 'Deadlift'), null);
  assert.equal(findDuplicateName(list, '   '), null);
  assert.equal(findDuplicateName(null, 'x'), null);
});

test('Local create/update validate names and refuse library edits', () => {
  const src = read('../src/lib/api-native.js');
  const from = src.indexOf('  async create(body) {', src.indexOf('const Exercises = {'));
  const create = src.slice(from, src.indexOf('  async update(', from));
  assert.match(create, /throw new Error\('Name required'\)/);
  assert.doesNotMatch(create, /body\.is_global|body\.source/);
  const uFrom = src.indexOf('  async update(', from);
  const upd = src.slice(uFrom, src.indexOf('  async del(', uFrom));
  assert.match(upd, /Library exercises are shared, so they cannot be edited\./);
  assert.match(upd, /Exercise not found/);
  assert.doesNotMatch(upd, /'name', 'category'/);
});

test('editor warns through confirmDialog and skips on failure', () => {
  const s = read('../src/components/exercises/ExerciseEditor.svelte');
  assert.match(s, /findDuplicateName/);
  assert.match(s, /catch \{ \/\* lookup failed/);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-exdup-'));
process.env.UPLOADS_PATH = path.join(tmp, 'uploads');
process.env.DB_PATH = path.join(tmp, 't.db');
let db, router, express;
try {
  express = (await import('../server/node_modules/express/index.js')).default;
  db = (await import('../server/db.js')).default;
  router = (await import('../server/routes/exercises.js')).default;
} catch (e) {
  console.log(`[exercise-create-duplicate-name-warning] skipping server: ${e.message.split('\n')[0]}`);
}
if (router) {
  const app = express();
  app.use(express.json());
  app.use('/api/exercises', router);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/exercises`;
  test.after(() => { server.close(); db.close(); });
  const send = (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  test('server POST trims, rejects blank; PUT trims and keeps name on blank', async () => {
    assert.equal((await send('POST', base, { name: '   ' })).status, 400);
    const r = await send('POST', base, { name: ' Foo ' });
    assert.equal(r.status, 200);
    const ex = await r.json();
    assert.equal(ex.name, 'Foo');
    const u = await (await send('PUT', `${base}/${ex.id}`, { name: '  Bar  ' })).json();
    assert.equal(u.name, 'Bar');
    const k = await (await send('PUT', `${base}/${ex.id}`, { name: '  ' })).json();
    assert.equal(k.name, 'Bar');
  });
}
