// A failed Trace send is a note for the person, not an assistant turn the
// model reads back, and it can be retried without a duplicate saved turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const trace = readFileSync(new URL('../src/components/ai/Trace.svelte', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../src/lib/aiChat.js', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));

test('failure is a role note, no hardcoded English', () => {
  assert.ok(!trace.includes("Sorry, I couldn't respond"));
  assert.match(trace, /role: 'note', kind: 'error', content: \$_\('trace\.error_prefix', \{ values: \{ reason: e\.message \} \}\)/);
  assert.match(en.trace.error_prefix, /\{reason\}/);
  assert.ok(en.trace.retry);
});

test('model messages only include user and assistant turns', () => {
  assert.match(trace, /\.filter\(m => m\.role === 'user' \|\| m\.role === 'assistant'\)/);
});

test('retry reuses the original message, skips the second save, guards sending', () => {
  assert.match(trace, /respondTo\(note\.retryMsg, false\)/);
  assert.match(trace, /if \(persist\) fetch\('\/api\/ai\/history'/);
  assert.match(trace, /if \(sending \|\| !note\.retryMsg\) return;/);
  assert.match(trace, /disabled=\{sending\}/);
  assert.match(trace, /msg === lastErrorNote/);
});

test('error notes are never saved', () => {
  const posts = trace.match(/fetch\('\/api\/ai\/history', \{\s*method: 'POST'/g) || [];
  assert.equal(posts.length, 2); // user turn (gated by persist) and assistant reply
  assert.equal((trace.match(/if \(persist\) fetch\('\/api\/ai\/history'/g) || []).length, 1);
});

test('aiChat errors come from trace_ai keys', () => {
  assert.ok(!/new Error\('(No API key|Not signed in)/.test(chat));
  assert.match(chat, /_say\('trace_ai\.no_api_key'/);
  assert.match(chat, /_say\('trace_ai\.not_signed_in'/);
  assert.ok(en.trace_ai.no_api_key && en.trace_ai.not_signed_in);
});
