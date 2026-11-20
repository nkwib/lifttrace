import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
let nextId = 1;
const live = new Set();
globalThis.requestAnimationFrame = () => { const id = nextId++; live.add(id); return id; };
globalThis.cancelAnimationFrame = (id) => { live.delete(id); };

const t = await import('../src/stores/workoutTimer.js');

test('no rAF while running with no timerMs subscriber', () => {
  t.startTimer('2026-01-01');
  assert.equal(live.size, 0);
  assert.ok(t.getElapsedMs() >= 0);
});

test('rAF starts on subscribe and stops on unsubscribe', () => {
  const unsub = t.timerMs.subscribe(() => {});
  assert.equal(live.size, 1);
  unsub();
  assert.equal(live.size, 0);
});

test('timerSec does not start the rAF loop', () => {
  const unsub = t.timerSec.subscribe(() => {});
  assert.equal(live.size, 0);
  unsub();
});

test('resume with no subscribers leaves no loop; subscribing after a gap is fresh', async () => {
  t.pauseTimer();
  t.resumeTimer();
  assert.equal(live.size, 0);
  await new Promise((r) => setTimeout(r, 30));
  let v;
  const unsub = t.timerMs.subscribe((x) => { v = x; });
  assert.ok(v >= 30);
  unsub();
  t.resetTimer();
});

test('timerSec emits about once per second, not per frame', async () => {
  t.startTimer('2026-01-01', 0);
  const seen = [];
  const unsub = t.timerSec.subscribe((x) => seen.push(x));
  await new Promise((r) => setTimeout(r, 1300));
  unsub();
  t.resetTimer();
  assert.ok(seen.length <= 3, String(seen));
});

test('Diary no longer reads $timerMs or compares timerState to strings', () => {
  const d = readFileSync(new URL('../src/routes/Diary.svelte', import.meta.url), 'utf8');
  assert.ok(!d.includes('$timerMs'));
  assert.ok(!d.includes("$timerState === 'running'"));
  assert.ok(d.includes('$timerState.date === $currentDate)'));
});
