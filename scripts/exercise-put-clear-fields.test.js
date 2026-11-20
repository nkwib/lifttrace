/**
 * PUT /api/exercises/:id: an explicit null clears category, instructions, tips
 * and media (and deletes the orphaned upload); an omitted key keeps the value.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-exput-'));
process.env.UPLOADS_PATH = path.join(tmp, 'uploads');
process.env.DB_PATH = path.join(tmp, 't.db');
fs.mkdirSync(path.join(process.env.UPLOADS_PATH, 'exercises'), { recursive: true });

let db, router, express;
try {
  express = (await import('../server/node_modules/express/index.js')).default;
  db = (await import('../server/db.js')).default;
  router = (await import('../server/routes/exercises.js')).default;
} catch (e) {
  console.log(`[exercise-put-clear-fields] skipping: ${e.message.split('\n')[0]}`);
}
const maybe = (n, f) => test(n, { skip: !router }, f);

let server, base;
if (router) {
  const app = express();
  app.use(express.json());
  app.use('/api/exercises', router);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/exercises`;
  test.after(() => { server.close(); db.close(); });
}

const file = (name) => {
  const abs = path.join(process.env.UPLOADS_PATH, 'exercises', name);
  fs.writeFileSync(abs, 'x');
  return { abs, url: `/uploads/exercises/${name}` };
};
const add = (name, img) =>
  db.prepare(
    "INSERT INTO exercises (name, is_global, source, category, instructions, tips, img_url, gif_url, video_url) VALUES (?, 0, 'custom', 'Chest', 'i', 't', ?, 'http://x/g.gif', 'http://x/v.mp4')"
  ).run(name, img).lastInsertRowid;
const put = (id, body) => fetch(`${base}/${id}`, {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then(r => r.json());

maybe('null clears fields and removes the upload', async () => {
  const a = file('c1.jpg');
  const id = add('C1', a.url);
  const r = await put(id, { instructions: null, tips: '', category: null, img_url: null, gif_url: null, video_url: null });
  for (const k of ['instructions', 'tips', 'category', 'img_url', 'gif_url', 'video_url']) assert.equal(r[k], null, k);
  assert.equal(fs.existsSync(a.abs), false);
});

maybe('omitted keys and a name-only PUT keep values and files', async () => {
  const a = file('k1.jpg');
  const id = add('K1', a.url);
  const r = await put(id, { name: 'K1b' });
  assert.equal(r.name, 'K1b');
  assert.equal(r.category, 'Chest');
  assert.equal(r.instructions, 'i');
  assert.equal(r.img_url, a.url);
  assert.equal(fs.existsSync(a.abs), true);
});

maybe('unchanged media in a full payload is not unlinked', async () => {
  const a = file('f1.jpg');
  const id = add('F1', a.url);
  await put(id, { name: 'F1', img_url: a.url, tips: null });
  assert.equal(fs.existsSync(a.abs), true);
});

maybe('a data-URL replacement removes the old file', async () => {
  const a = file('r1.jpg');
  const id = add('R1', a.url);
  const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), Buffer.alloc(16)]).toString('base64');
  const r = await put(id, { img_url: png });
  assert.notEqual(r.img_url, a.url);
  assert.match(r.img_url, /^\/uploads\//);
  assert.equal(fs.existsSync(a.abs), false);
});

maybe('a file another exercise uses survives a clear', async () => {
  const a = file('s1.jpg');
  const id = add('S1', a.url);
  add('S2', a.url);
  await put(id, { img_url: null });
  assert.equal(fs.existsSync(a.abs), true);
});
