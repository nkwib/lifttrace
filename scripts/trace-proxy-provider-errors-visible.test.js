/**
 * Env-locked Trace: a provider's failure (bad key, quota, unknown model, a
 * gateway's HTML page, no network) reaches the person as the provider's own
 * words, not "Internal server error". 502 (429 passes through), never 401,
 * and neither the key nor a URL is ever in a response.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const KEY = 'sk-secret-key-123456';
let db = null, dir = null, app = null, base = null;
try {
  const req = createRequire(new URL('../server/package.json', import.meta.url));
  req('better-sqlite3');
  dir = mkdtempSync(join(tmpdir(), 'lt-proxy-errors-'));
  process.env.DB_PATH = join(dir, 'test.db');
  db = (await import('../server/db.js')).default;
  const { default: routes } = await import('../server/routes/ai.js');
  const { errorHandler } = await import('../server/lib/error-handler.js');
  const express = req('express');
  const web = express();
  web.use(express.json());
  web.use('/api/ai', routes);
  web.use(errorHandler);
  app = web.listen(0);
  base = `http://127.0.0.1:${app.address().port}`;
} catch { /* better-sqlite3 not built for this Node: skips */ }

const realFetch = globalThis.fetch;
let handler = null;
globalThis.fetch = (url, opts) => {
  const u = String(url);
  if (/^https:\/\/(api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com)/.test(u)) return handler(u, opts);
  return realFetch(url, opts);
};
test.after(() => {
  globalThis.fetch = realFetch;
  app?.close();
  try { db?.close(); } catch {}
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const lock = (provider) => {
  const set = db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of [['ai_enabled', 'true'], ['ai_provider', provider], ['ai_model', ''], ['ai_api_key', KEY], ['ai_env_locked', 'true']]) set.run(k, v);
};
const chat = async () => {
  const r = await realFetch(`${base}/api/ai/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 's' }),
  });
  const text = await r.text();
  assert.ok(!text.includes(KEY), 'the key is never in a response');
  return { status: r.status, body: JSON.parse(text) };
};
const json = (status, obj) => ({ ok: status < 400, status, json: async () => obj });
const html = (status) => ({ ok: status < 400, status, json: async () => { throw new SyntaxError('Unexpected token <'); } });

test('Claude 401 says the provider words, as 502 (never 401)', async (t) => {
  if (!db) return t.skip('better-sqlite3 is not built for this Node');
  lock('claude');
  handler = async () => json(401, { type: 'error', error: { message: 'invalid x-api-key' } });
  const r = await chat();
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'Claude: invalid x-api-key');
});

test('a provider 429 passes through; the key is stripped from the message', async (t) => {
  if (!db) return t.skip('better-sqlite3 is not built for this Node');
  lock('openai');
  handler = async () => json(429, { error: { message: `Incorrect API key provided: ${KEY}.\nQuota exceeded` } });
  const r = await chat();
  assert.equal(r.status, 429);
  assert.match(r.body.error, /^OpenAI: Incorrect API key provided: \[key\]\. Quota exceeded$/);
});

test('error as a plain string, and a long message is cut', async (t) => {
  if (!db) return t.skip('better-sqlite3 is not built for this Node');
  lock('openai');
  handler = async () => json(400, { error: 'model not found' });
  assert.equal((await chat()).body.error, 'OpenAI: model not found');
  handler = async () => json(400, { error: { message: 'x'.repeat(1000) } });
  assert.equal((await chat()).body.error.length, 'OpenAI: '.length + 300);
});

test('a gateway HTML 502 is "HTTP 502", not a SyntaxError', async (t) => {
  if (!db) return t.skip('better-sqlite3 is not built for this Node');
  for (const [p, label] of [['openai', 'OpenAI'], ['gemini', 'Gemini'], ['claude', 'Claude']]) {
    lock(p);
    handler = async () => html(502);
    const r = await chat();
    assert.equal(r.status, 502);
    assert.equal(r.body.error, `${label}: HTTP 502`);
  }
});

test('a 200 that is not JSON is an error, not an empty answer', async (t) => {
  if (!db) return t.skip('better-sqlite3 is not built for this Node');
  lock('gemini');
  handler = async () => html(200);
  const r = await chat();
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'Gemini: unreadable reply');
});

test('no network: "Could not reach", with no URL or key (Gemini carries it)', async (t) => {
  if (!db) return t.skip('better-sqlite3 is not built for this Node');
  for (const [p, label] of [['gemini', 'Gemini'], ['openai', 'OpenAI'], ['claude', 'Claude']]) {
    lock(p);
    handler = async (url) => { throw new TypeError(`fetch failed ${url}`, { cause: new Error(url) }); };
    const r = await chat();
    assert.equal(r.status, 502);
    assert.equal(r.body.error, `Could not reach ${label}`);
  }
});
