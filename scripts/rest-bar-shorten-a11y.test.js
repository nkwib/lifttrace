import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { shrunkRest, extendedRest, restLeftMs, restProgress, restFromWire } = await import('../src/lib/rest-state.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const T0 = 1_791_700_000_000;
const running = (over = {}) => ({ startedAt: T0, endTime: T0 + 90_000, total: 90, exerciseName: 'Bench', ...over });

test('shrinking a running rest takes 30s off and the total follows', () => {
  const s = shrunkRest(running(), 30, T0);
  assert.equal(restLeftMs(s, T0), 60_000);
  assert.equal(s.total, 60);
});

test('shrinking floors remaining at 1s and total never drops below it', () => {
  const s = shrunkRest(running({ endTime: T0 + 10_000, total: 90 }), 30, T0);
  assert.equal(restLeftMs(s, T0), 1000);
  assert.equal(s.total, 81);
  const p = shrunkRest(running({ paused: true, leftMs: 20_000, total: 25 }), 30, T0);
  assert.equal(p.leftMs, 1000);
  assert.equal(p.total, 6);
  assert.ok(restProgress(p, T0) <= 1);
  assert.equal(p.paused, true);
});

test('shrinking a rest at 1s or less is a no-op', () => {
  const s = running({ endTime: T0 + 1000 });
  assert.equal(shrunkRest(s, 30, T0), s);
});

test('shrinking a paused rest keeps it paused', () => {
  const p = shrunkRest(running({ paused: true, leftMs: 60_000, total: 90 }), 30, T0);
  assert.equal(p.leftMs, 30_000);
  assert.equal(p.total, 60);
});

test('positive callers stay positive-only', () => {
  const s = extendedRest(running(), -30, T0);
  assert.equal(restLeftMs(s, T0), 90_000);
  assert.equal(s.total, 90);
  assert.ok(restFromWire({ endsAt: T0 + 5000, total: 5, label: 'x' }, T0).state);
});

test('wiring: store, bar, toast, i18n', () => {
  assert.match(read('../src/stores/restTimer.js'), /shrunkRest\(state, -extraSec\)/);
  const bar = read('../src/components/diary/RestTimer.svelte');
  assert.match(bar, /addRestTime\(-REST_ADD_SEC\)/);
  assert.match(bar, /role="timer" aria-live="off"/);
  assert.match(bar, /<span class="rest-time" aria-label=/);
  assert.doesNotMatch(bar, /rest-time[^>]*aria-live/);
  assert.match(read('../src/components/ui/Toast.svelte'), /--bottom-overlays/);
  const en = JSON.parse(read('../src/i18n/en.json'));
  assert.ok(en.rest_bar.sub && en.rest_bar.sub_title);
});
