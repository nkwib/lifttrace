import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStall } from '../src/lib/progression.js';

const sess = (date, weight, reps = 5, extra = {}) => ({ date, sets: [{ completed: true, weight, reps, ...extra }] });
const O = { today: '2030-01-01' };
// 1 earlier session, then 4 flat sessions spanning `last`
const flat = (w = 100, last = '2025-01-22') => [
  sess('2025-01-01', w), sess('2025-01-08', w), sess('2025-01-15', w), sess('2025-01-18', w), sess(last, w),
];

test('flat 4 sessions over 2+ weeks is stalled', () => {
  const r = detectStall(flat(), { ...O, unit: 'kg', equipment: 'Barbell' });
  assert.equal(r.sessions, 4);
  assert.equal(r.days, 14);
  assert.equal(r.suggestedWeight, 90);
});
test('order independent', () => {
  assert.ok(detectStall(flat().reverse(), O));
});
test('new best is null', () => {
  const h = flat(); h[4] = sess('2025-01-22', 110);
  assert.equal(detectStall(h, O), null);
});
test('fewer than N+1 sessions is null', () => {
  assert.equal(detectStall(flat().slice(1), O), null);
});
test('span boundary 13/14', () => {
  assert.ok(detectStall(flat(100, '2025-01-22'), O));
  assert.equal(detectStall(flat(100, '2025-01-21'), O), null);
});
test('warm-ups, 13+ reps and timed sets ignored', () => {
  const h = flat();
  h[4] = { date: '2025-01-22', sets: [{ completed: true, warmup: true, weight: 200, reps: 5 }, { completed: true, weight: 50, reps: 15 }] };
  assert.equal(detectStall(h, O), null);
  const t = flat().map(x => ({ ...x, set_type: 'time' }));
  assert.equal(detectStall(t, O), null);
});
test('assisted and bodyweight-only are null', () => {
  assert.equal(detectStall(flat(), { ...O, equipment: 'Assisted Machine' }), null);
  assert.equal(detectStall(flat(0), O), null);
});
test('post-deload window well below old best is null', () => {
  const h = flat(); h[0] = sess('2025-01-01', 150);
  assert.equal(detectStall(h, O), null);
});
test('future-dated sessions skipped', () => {
  assert.equal(detectStall(flat(), { today: '2025-01-10' }), null);
});
test('same-date sessions merge', () => {
  const h = [...flat(), sess('2025-01-22', 95)];
  assert.equal(detectStall(h, O).days, 14);
});
test('suggested weight rounds down to step, kg and lb', () => {
  assert.equal(detectStall(flat(102.5), { ...O, unit: 'kg', equipment: 'Barbell' }).suggestedWeight, 90);
  assert.equal(detectStall(flat(225), { ...O, unit: 'lbs', equipment: 'Barbell' }).suggestedWeight, 200);
  assert.equal(detectStall(flat(10), { ...O, unit: 'kg', equipment: 'Barbell' }).suggestedWeight, 7.5);
});
