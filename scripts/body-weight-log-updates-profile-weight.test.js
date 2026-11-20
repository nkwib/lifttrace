import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profileWeightFor, adoptLoggedWeight } from '../src/lib/profile-weight.js';

const T = '2026-05-10';

test('today kg weight adopted', () => {
  assert.equal(profileWeightFor(T, 80.5, 'kg', T), 80.5);
});
test('lbs converted to kg with 0.01 rounding', () => {
  assert.equal(profileWeightFor(T, 176.4, 'lbs', T), 80.01);
});
test('past and future dates skipped', () => {
  assert.equal(profileWeightFor('2026-05-09', 80, 'kg', T), null);
  assert.equal(profileWeightFor('2026-05-11', 80, 'kg', T), null);
});
test('zero, negative, NaN, empty skipped', () => {
  for (const w of [0, -3, NaN, '', undefined, null, 'abc']) assert.equal(profileWeightFor(T, w, 'kg', T), null);
});

function fakeStore(v) {
  return {
    sets: 0,
    subscribe(fn) { fn(v); return () => {}; },
    set(n) { v = n; this.sets++; },
    get v() { return v; },
  };
}
test('adopt writes store once, skips unchanged and past', async () => {
  const s = fakeStore(70);
  assert.equal(await adoptLoggedWeight(T, 80, 'kg', { store: s, today: T }), true);
  assert.equal(s.v, 80);
  assert.equal(await adoptLoggedWeight(T, 80, 'kg', { store: s, today: T }), false);
  assert.equal(s.sets, 1);
  assert.equal(await adoptLoggedWeight('2020-01-01', 90, 'kg', { store: s, today: T }), false);
  assert.equal(s.v, 80);
});

test('all three weigh-in surfaces call the helper after the PUT', () => {
  for (const f of ['diary/BodyStats', 'diary/BodyStatsWidget', 'progress-photos/WeightQuickLog']) {
    const src = readFileSync(new URL(`../src/components/${f}.svelte`, import.meta.url), 'utf8');
    assert.match(src, /adoptLoggedWeight\(/, f);
    assert.ok(src.indexOf('adoptLoggedWeight(') > src.indexOf("method: 'PUT'"), f);
  }
  const bs = readFileSync(new URL('../src/components/diary/BodyStats.svelte', import.meta.url), 'utf8');
  assert.match(bs, /touched\.has\('weight'\)/);
});
