import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
const { formatTimerMs } = await import('../src/stores/workoutTimer.js');

test('formatTimerMs without centis', () => {
  assert.equal(formatTimerMs(65000, { centi: false }), '1:05');
  assert.equal(formatTimerMs(3725000, { centi: false }), '1:02:05');
});

test('pill formats the 1 Hz timerSec without centis', () => {
  const src = readFileSync(new URL('../src/components/WorkoutModeBar.svelte', import.meta.url), 'utf8');
  assert.match(src, /formatTimerMs\(\$timerSec \* 1000,\s*\{\s*centi:\s*false\s*\}\)/);
});
