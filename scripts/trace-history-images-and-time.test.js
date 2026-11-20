import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { persistable, historyTime, mapHistoryRows } from '../src/lib/aiChat.js';

test('persistable keeps strings, drops image bytes', () => {
  assert.equal(persistable('hi'), 'hi');
  const out = persistable([
    { type: 'image', dataUrl: 'data:image/png;base64,AAAA' },
    { type: 'image', dataUrl: 'data:image/png;base64,BBBB' },
    { type: 'text', text: 'what is this' },
  ]);
  assert.equal(out, 'what is this\n[2 photos]');
  assert.ok(!out.includes('base64'));
  assert.equal(persistable([{ type: 'image', dataUrl: 'x' }, { type: 'text', text: 'Please look at this.' }]), 'Please look at this.\n[photo]');
});

test('historyTime maps UTC rows, tolerates ISO and junk', () => {
  assert.equal(historyTime('2026-07-27 10:15:00'), '2026-07-27T10:15:00.000Z');
  assert.equal(historyTime('2026-07-27T10:15:00.000Z'), '2026-07-27T10:15:00.000Z');
  assert.equal(historyTime(null), null);
  assert.equal(historyTime('garbage'), null);
});

test('mapHistoryRows returns role/content/time only', () => {
  const [m] = mapHistoryRows([{ id: 3, user_id: 1, role: 'user', content: 'a', created_at: '2026-07-27 10:15:00' }]);
  assert.deepEqual(m, { role: 'user', content: 'a', time: '2026-07-27T10:15:00.000Z' });
});

test('Trace and server wiring', () => {
  const t = readFileSync(new URL('../src/components/ai/Trace.svelte', import.meta.url), 'utf8');
  assert.match(t, /persistable\(userMsg\.content\)/);
  assert.match(t, /mapHistoryRows\(await res\.json\(\)\)/);
  const s = readFileSync(new URL('../server/routes/ai.js', import.meta.url), 'utf8');
  assert.match(s, /typeof content !== 'string'/);
});
