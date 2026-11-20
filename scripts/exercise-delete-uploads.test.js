/**
 * Deleting a custom exercise removes its uploaded media files, unless another
 * exercise row (soft-deleted included) still references them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-exdel-'));
process.env.UPLOADS_PATH = path.join(tmp, 'uploads');
process.env.DB_PATH = path.join(tmp, 't.db');
fs.mkdirSync(path.join(process.env.UPLOADS_PATH, 'exercises'), { recursive: true });

let db, router, express;
try {
  express = (await import('../server/node_modules/express/index.js')).default;
  db = (await import('../server/db.js')).default;
  router = (await import('../server/routes/exercises.js')).default;
} catch (e) {
  console.log(`[exercise-delete-uploads] skipping: ${e.message.split('\n')[0]}`);
}
const maybe = (n, f) => test(n, { skip: !router }, f);

let server, base;
if (router) {
  const app = express();
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
const add = (name, { img = null, gif = null, vid = null, deleted = null } = {}) =>
  db.prepare(
    "INSERT INTO exercises (name, is_global, source, img_url, gif_url, video_url, deleted_at) VALUES (?, 0, 'custom', ?, ?, ?, ?)"
  ).run(name, img, gif, vid, deleted).lastInsertRowid;
const del = (id) => fetch(`${base}/${id}`, { method: 'DELETE' });

maybe('delete removes all three media files', async () => {
  const a = file('a1.jpg'), b = file('a2.gif'), c = file('a3.mp4');
  const id = add('A', { img: a.url, gif: b.url, vid: c.url });
  assert.equal((await del(id)).status, 200);
  for (const f of [a, b, c]) assert.equal(fs.existsSync(f.abs), false);
});

maybe('a file another exercise uses is kept', async () => {
  const a = file('s1.jpg');
  const id1 = add('S1', { img: a.url });
  add('S2', { gif: a.url });
  await del(id1);
  assert.equal(fs.existsSync(a.abs), true);
});

maybe('a soft-deleted referrer keeps the file', async () => {
  const a = file('d1.jpg');
  const id = add('D1', { img: a.url });
  add('D2', { img: a.url, deleted: '2026-01-01' });
  await del(id);
  assert.equal(fs.existsSync(a.abs), true);
});

maybe('http, non-exercises and traversal URLs are untouched', async () => {
  const other = path.join(process.env.UPLOADS_PATH, 'keep.jpg');
  fs.writeFileSync(other, 'x');
  const outside = path.join(tmp, 'outside.jpg');
  fs.writeFileSync(outside, 'x');
  const id = add('U', { img: 'http://example.com/x.jpg', gif: '/uploads/keep.jpg', vid: '/uploads/exercises/../../outside.jpg' });
  assert.equal((await del(id)).status, 200);
  assert.equal(fs.existsSync(other), true);
  assert.equal(fs.existsSync(outside), true);
});

maybe('bulk delete removes files', async () => {
  const a = file('b1.jpg'), b = file('b2.jpg');
  add('B1', { img: a.url });
  add('B2', { img: b.url });
  const r = await fetch(`${base}/custom/all`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.equal(fs.existsSync(a.abs), false);
  assert.equal(fs.existsSync(b.abs), false);
});
