/**
 * Retry is offered on an error note only while no user or assistant message
 * follows it. The reactive block in Trace.svelte is evaluated here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../src/components/ai/Trace.svelte', import.meta.url), 'utf8');
const m = src.match(/\$: lastErrorNote = (\(\(\) => \{[\s\S]*?\}\)\(\));/);

test('the lastErrorNote block is found', () => assert.ok(m));

const lastErrorNote = (messages) => new Function('messages', `return ${m[1]};`)(messages);
const err = { role: 'note', kind: 'error', retryMsg: {} };
const err2 = { role: 'note', kind: 'error', retryMsg: {} };
const u = { role: 'user' }, a = { role: 'assistant' }, info = { role: 'note', kind: 'info' };

test('the trailing error note offers Retry', () => {
  assert.equal(lastErrorNote([u, a, u, err]), err);
  assert.equal(lastErrorNote([u, err, info]), err);
});

test('an old error note does not once a later turn happened', () => {
  assert.equal(lastErrorNote([u, err, u, a]), null);
  assert.equal(lastErrorNote([u, err, u]), null);
});

test('only the newest of two error notes offers it', () => {
  assert.equal(lastErrorNote([u, err, u, err2]), err2);
});

test('no messages, no note', () => assert.equal(lastErrorNote([]), null));
