/**
 * Large JSON answers under /api go gzipped when the client takes it
 * (server/lib/gzip-json.js): the Diary and Statistics read over a megabyte
 * of JSON on every visit, sent raw before.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import zlib from 'node:zlib';
import test from 'node:test';
import { gzipJson } from '../server/lib/gzip-json.js';
import { privateFieldsOut } from '../server/lib/private-fields.js';

const req = createRequire(new URL('../server/package.json', import.meta.url));
let express = null;
try { express = req('express'); } catch { /* server deps not installed: the cases skip */ }

const big = Array.from({ length: 200 }, (_, i) => ({ id: i, name: `Exercise ${i}`, field_times: { name: 1 } }));
let server = null, port = 0;
if (express) {
  const app = express();
  app.use('/api', gzipJson);
  app.use('/api', privateFieldsOut);
  app.get('/api/big', (_req, res) => res.json(big));
  app.get('/api/small', (_req, res) => res.json({ ok: true }));
  app.get('/api/error', (_req, res) => res.status(404).json({ error: 'x'.repeat(4000) }));
  app.get('/api/typed', (_req, res) => res.type('application/problem+json').json({ detail: 'y'.repeat(4000) }));
  app.get('/api/nothing', (_req, res) => res.json(undefined));
  server = app.listen(0);
  port = server.address().port;
}
test.after(() => server?.close());

// Raw bytes and headers, nothing unpacked on the way.
const get = (path, encoding) => new Promise((resolve, reject) => {
  http.get({ port, path, headers: encoding ? { 'accept-encoding': encoding } : {} }, res => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  }).on('error', reject);
});

test('a large answer goes gzipped to a client that takes it', { skip: !express }, async () => {
  const r = await get('/api/big', 'gzip, deflate, br');
  assert.equal(r.headers['content-encoding'], 'gzip');
  assert.match(r.headers['content-type'], /^application\/json/);
  assert.match(r.headers.vary, /Accept-Encoding/);
  assert.equal(Number(r.headers['content-length']), r.body.length);
  const out = JSON.parse(zlib.gunzipSync(r.body));
  assert.equal(out.length, 200);
  // still without the private fields (privateFieldsOut runs first)
  assert.equal(out[0].field_times, undefined);
});

test('a client that does not take gzip gets it as it is', { skip: !express }, async () => {
  for (const enc of [null, 'identity', 'br']) {
    const r = await get('/api/big', enc);
    assert.equal(r.headers['content-encoding'], undefined, String(enc));
    assert.match(r.headers.vary, /Accept-Encoding/);
    assert.equal(JSON.parse(r.body).length, 200);
  }
});

test('a small answer goes as it is', { skip: !express }, async () => {
  const r = await get('/api/small', 'gzip');
  assert.equal(r.headers['content-encoding'], undefined);
  assert.deepEqual(JSON.parse(r.body), { ok: true });
});

test('the status and a type the route set are kept', { skip: !express }, async () => {
  const e = await get('/api/error', 'gzip');
  assert.equal(e.status, 404);
  assert.equal(e.headers['content-encoding'], 'gzip');
  assert.equal(JSON.parse(zlib.gunzipSync(e.body)).error.length, 4000);
  const t = await get('/api/typed', 'gzip');
  assert.match(t.headers['content-type'], /^application\/problem\+json/);
});

test('res.json() with nothing still answers', { skip: !express }, async () => {
  const r = await get('/api/nothing', 'gzip');
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 0);
});
