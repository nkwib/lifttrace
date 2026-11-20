/**
 * A bad embedded picture or a bad OIDC provider form is the caller's mistake:
 * it answers 400 with the reason, not a generic 500. Unknown errors and
 * SQLite errors still never echo their message.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.UPLOADS_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-loc-'));
const { errorHandler } = await import('../server/lib/error-handler.js');
const { localizeDataUrl } = await import('../server/lib/image-localizer.js');
const { _coerceProvider } = await import('../server/routes/oidc-admin.js');

function run(err) {
  const out = {};
  const res = { headersSent: false, status(c) { out.status = c; return this; }, json(b) { out.body = b; } };
  errorHandler(err, { method: 'POST', path: '/x' }, res, () => {});
  return out;
}
const files = () => fs.readdirSync(process.env.UPLOADS_PATH);

test('handler echoes the message for a 400, hides plain and SQLite errors', () => {
  assert.deepEqual(run(Object.assign(new Error('nope'), { status: 400 })), { status: 400, body: { error: 'nope' } });
  assert.deepEqual(run(new Error('secret')), { status: 500, body: { error: 'Internal server error' } });
  const sql = Object.assign(new Error('UNIQUE failed: users.email'), { status: 400, code: 'SQLITE_CONSTRAINT' });
  assert.equal(run(sql).body.error, 'Internal server error');
});

test('an oversized embedded picture is a 400', () => {
  const big = 'data:image/png;base64,' + Buffer.alloc(12 * 1024 * 1024 + 1).toString('base64');
  assert.throws(() => localizeDataUrl(big), (e) => e.status === 400 && /too large/.test(e.message));
  assert.deepEqual(files(), []);
});

test('an empty embedded picture is a 400 with an honest message', () => {
  assert.throws(() => localizeDataUrl('data:image/png;base64,'), (e) => e.status === 400 && /could not be read/.test(e.message));
});

test('bytes that are not an image are a 400 and leave no file behind', () => {
  const junk = 'data:image/png;base64,' + Buffer.from('definitely not a png').toString('base64');
  assert.throws(() => localizeDataUrl(junk), (e) => e.status === 400);
  assert.deepEqual(files(), []);
});

test('an incomplete OIDC provider form is a 400', () => {
  assert.throws(() => _coerceProvider({}, null), (e) => e.status === 400);
  assert.throws(() => _coerceProvider({ issuer_url: 'https://i', client_id: 'c' }, null), (e) => e.status === 400 && /redirect_uri/.test(e.message));
});
