import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from '../server/node_modules/express/index.js';
import multer from '../server/node_modules/multer/index.js';
import { singleUpload } from '../server/lib/upload-error.js';

async function run(call) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 } });
  app.post('/u', singleUpload(upload, 'file', 25), (req, res) => res.json({ ok: true }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' }));
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try {
    return await call(`http://127.0.0.1:${server.address().port}/u`);
  } finally { server.close(); }
}
function form(bytes, field = 'file') {
  const f = new FormData();
  f.append(field, new Blob([new Uint8Array(bytes)]), 'x.bin');
  return f;
}

test('oversize file answers 413 with the cap', async () => {
  const res = await run(url => fetch(url, { method: 'POST', body: form(2) }));
  assert.equal(res.status, 413);
  assert.match((await res.json()).error, /\(25 MB\)/);
});

test('file within the limit passes through', async () => {
  const res = await run(url => fetch(url, { method: 'POST', body: form(1) }));
  assert.equal(res.status, 200);
});

test('other multer errors answer 400', async () => {
  const res = await run(url => fetch(url, { method: 'POST', body: form(1, 'wrong') }));
  assert.equal(res.status, 400);
});

test('routes use the wrapper, and upload.js shares the helper', () => {
  const r = f => readFileSync(new URL(`../server/routes/${f}`, import.meta.url), 'utf8');
  assert.equal((r('workout-import.js').match(/singleUpload\(upload, 'file', 25\)/g) || []).length, 2);
  assert.match(r('full-backup.js'), /requireAdmin, singleUpload\(upload, 'backup', _backupMaxMB\)/);
  assert.doesNotMatch(r('workout-import.js') + r('full-backup.js'), /upload\.single\(/);
  assert.match(r('upload.js'), /from '\.\.\/lib\/upload-error\.js'/);
});
