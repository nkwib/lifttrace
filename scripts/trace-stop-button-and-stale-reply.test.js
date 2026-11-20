/**
 * Trace can be stopped, a request has a deadline, and a reply that comes
 * after Clear conversation is dropped. aiChat.js takes an optional `signal`;
 * Trace.svelte holds one controller per send and an epoch moved by Clear.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { callAI, AI_DEADLINE_MS, _timed } from '../src/lib/aiChat.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const realFetch = globalThis.fetch;

// A provider that honours init.signal and never answers on its own.
const hang = () => {
  globalThis.fetch = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
};
const toolReply = { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'log_set', arguments: '{}' } }, { id: 'c2', type: 'function', function: { name: 'log_set', arguments: '{}' } }] } }] };
const base = { provider: 'oai-compat', apiKey: 'k', model: 'm', baseUrl: 'http://localhost:1', messages: [{ role: 'user', content: 'hi' }], systemPrompt: 's', tools: [{ name: 'log_set', description: 'd', parameters: { type: 'object', properties: {} } }] };

test('a stop during the request is an AbortError', async () => {
  hang();
  try {
    const ctl = new AbortController();
    const p = callAI({ ...base, signal: ctl.signal });
    setTimeout(() => ctl.abort(), 10);
    await assert.rejects(p, (e) => e.name === 'AbortError');
  } finally { globalThis.fetch = realFetch; }
});

test('already stopped: no request is made', async () => {
  let called = false;
  globalThis.fetch = () => { called = true; return new Promise(() => {}); };
  try {
    const ctl = new AbortController(); ctl.abort();
    await assert.rejects(callAI({ ...base, signal: ctl.signal }), (e) => e.name === 'AbortError');
    assert.equal(called, false);
  } finally { globalThis.fetch = realFetch; }
});

test('a stop is a cancel whatever the fetch throws', async () => {
  const ctl = new AbortController();
  globalThis.fetch = () => { ctl.abort(); return Promise.reject(new Error('native cancelled')); };
  try {
    await assert.rejects(callAI({ ...base, signal: ctl.signal }), (e) => e.name === 'AbortError');
  } finally { globalThis.fetch = realFetch; }
});

test('no tool starts after a stop', async () => {
  const ctl = new AbortController();
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => toolReply });
  const ran = [];
  try {
    await assert.rejects(callAI({
      ...base, signal: ctl.signal,
      onToolCall: async (name) => { ran.push(name); ctl.abort(); return { ok: true }; },
    }), (e) => e.name === 'AbortError');
    assert.equal(ran.length, 1, 'the second call of the round is not run');
  } finally { globalThis.fetch = realFetch; }
});

test('a request with no answer in time is trace_timed_out, a stop still wins', async () => {
  const hung = (sig) => new Promise((_, reject) => sig.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))));
  await assert.rejects(_timed(undefined, hung, 20), (e) => e.code === 'trace_timed_out');
  const ctl = new AbortController();
  const p = _timed(ctl.signal, hung, 1000);
  ctl.abort();
  await assert.rejects(p, (e) => e.name === 'AbortError');
  assert.ok(AI_DEADLINE_MS >= 300000, 'not stricter than the proxy wait');
});

test('wiring: aiChat passes the signal to every fetch', () => {
  const src = read('../src/lib/aiChat.js');
  assert.equal((src.match(/signal: sig,/g) || []).length, 4, 'claude, openai, gemini, proxy');
  assert.match(src, /apiFetch can answer a stopped request/);
});

test('wiring: Trace has a per-send controller, a Stop button and an epoch', () => {
  const src = read('../src/components/ai/Trace.svelte');
  assert.match(src, /new AbortController\(\)/);
  assert.match(src, /signal: ctl\.signal/);
  assert.match(src, /\{#if sending\}[\s\S]*?on:click=\{stopSending\}[\s\S]*?trace\.stop[\s\S]*?\{:else\}[\s\S]*?on:click=\{send\}/);
  const clear = src.slice(src.indexOf('async function clearHistory'));
  assert.match(clear.slice(0, 700), /epoch\+\+;[\s\S]*sendCtl\?\.abort\(\)[\s\S]*sending = false/);
  const sendFn = src.slice(src.indexOf('async function send()'), src.indexOf('async function clearHistory'));
  assert.match(sendFn, /if \(stale\(\) \|\| ctl\.signal\.aborted\) return;/);
  assert.match(sendFn, /finally \{[\s\S]*?if \(!stale\(\)\)/);
  const c = sendFn.indexOf('catch(e)');
  assert.match(sendFn.slice(c, sendFn.indexOf('Sorry')), /stale\(\) \|\| ctl\.signal\.aborted/);
});

test('trace.stop exists in English', () => {
  assert.equal(JSON.parse(read('../src/i18n/en.json')).trace.stop, 'Stop');
});
