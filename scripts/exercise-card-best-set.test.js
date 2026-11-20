import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bestSet } from '../src/lib/workout.js';

const ex = {};
const c = (o) => ({ completed: true, ...o });

test('reps: heaviest wins, then reps', () => {
  const a = c({ weight: 100, reps: 5 }), b = c({ weight: 100, reps: 8 }), d = c({ weight: 90, reps: 20 });
  assert.equal(bestSet(ex, [a, d, b]), b);
});
test('reps split per side use weaker side', () => {
  const a = c({ weight: 50, reps: 12, reps_l: 12, reps_r: 6 }), b = c({ weight: 50, reps: 8, reps_l: 8, reps_r: 8 });
  assert.equal(bestSet(ex, [a, b]), b);
});
test('bodyweight: most reps', () => {
  const a = c({ weight: 0, reps: 10 }), b = c({ weight: 0, reps: 12 });
  assert.equal(bestSet(ex, [a, b]), b);
});
test('timed: longest, weight tiebreak, per-side uses duration_sec', () => {
  const e = { set_type: 'time' };
  const a = c({ duration_sec: 30, weight: 10 }), b = c({ duration_sec: 30, weight: 20 }), d = c({ duration_sec: 40, duration_l_sec: 40, duration_r_sec: 40 });
  assert.equal(bestSet(e, [a, b]), b);
  assert.equal(bestSet(e, [a, b, d]), d);
  const side = c({ duration_sec: 35, duration_l_sec: 60, duration_r_sec: 35 });
  assert.equal(bestSet(e, [side, d]), d);
});
test('distance and calories', () => {
  const a = c({ distance_m: 500 }), b = c({ distance_m: 800 });
  assert.equal(bestSet({ set_type: 'distance' }, [a, b]), b);
  const x = c({ calories: 20 }), y = c({ calories: 15 });
  assert.equal(bestSet({ set_type: 'calories' }, [y, x]), x);
});
test('none, warm-ups and uncompleted ignored', () => {
  assert.equal(bestSet(ex, []), null);
  assert.equal(bestSet(ex, null), null);
  const w = { completed: true, warmup: true, weight: 200, reps: 5 }, u = { weight: 300, reps: 5 };
  assert.equal(bestSet(ex, [w, u]), null);
  const ok = c({ weight: 100, reps: 5 });
  assert.equal(bestSet(ex, [w, u, ok]), ok);
});
test('wiring', () => {
  const src = readFileSync(new URL('../src/components/diary/ExerciseCard.svelte', import.meta.url), 'utf8');
  assert.match(src, /!expanded \? bestSet\(exercise, workingSets\)/);
  assert.match(src, /\{completedCount\}\/\{workingSets\.length\} sets\{#if bestLabel\} · \{bestLabel\}/);
  assert.match(src, /BW×/);
  assert.match(src, /\.ex-meta \{[^}]*text-overflow: ellipsis/);
});
