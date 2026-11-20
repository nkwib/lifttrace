import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateOneRm, percentTable, stepFor } from '../src/lib/one-rm.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('100 x 5 estimates 117 (Epley, via calc1RM)', () => {
  assert.equal(estimateOneRm(100, 5), 117);
});

test('reps=1 equals the weight', () => {
  assert.equal(estimateOneRm(142.5, 1), 142.5);
});

test('invalid input gives null', () => {
  for (const [w, r] of [[0, 5], [-10, 5], ['', 5], [100, 0], [100, 13], [100, 2.5], [100, ''], [NaN, 5]]) {
    assert.equal(estimateOneRm(w, r), null, `${w} x ${r}`);
  }
  assert.deepEqual(percentTable(null, 'kg'), []);
  assert.deepEqual(percentTable(0, 'lbs'), []);
});

test('percent table rounds to plate step in both units', () => {
  const kg = percentTable(117, 'kg');
  assert.equal(kg.find(r => r.pct === 90).weight, 105); // 105.3
  assert.equal(kg.find(r => r.pct === 100).weight, 117.5);
  assert.equal(kg.find(r => r.pct === 50).weight, 57.5); // 58.5
  const lb = percentTable(117, 'lbs');
  assert.equal(lb.find(r => r.pct === 90).weight, 105);
  assert.equal(lb.find(r => r.pct === 85).weight, 100); // 99.45
  assert.equal(stepFor('kg'), 2.5);
  assert.equal(stepFor('lbs'), 5);
  assert.equal(kg.length, 11);
  for (const { weight } of kg) assert.equal(weight % 2.5, 0);
});

test('tab wired in both embed and sheet variants', () => {
  const src = read('src/components/diary/GymTools.svelte');
  assert.equal((src.match(/tab = 'onerm'/g) || []).length, 2);
  assert.equal((src.match(/<OneRmCalc/g) || []).length, 2);
});

test('i18n keys exist in en.json', () => {
  const en = JSON.parse(read('src/i18n/en.json'));
  for (const k of ['one_rm', 'lifted_weight', 'reps', 'est_1rm', 'reps_hint']) {
    assert.ok(en.gym_tools[k], k);
  }
});
