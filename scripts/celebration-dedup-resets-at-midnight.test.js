/**
 * The workout-complete dedup set must reset when the local day changes while
 * the app process stays alive. notifications.js can't load under node
 * (Capacitor), so the celebration block is lifted out and run with stubs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../src/lib/notifications.js', import.meta.url), 'utf8');
const a = src.indexOf('const _celebratedToday');
const b = src.indexOf('export function celebratePR');
const block = src.slice(a, b).replace('export function', 'function');

function setup(day, store = {}) {
  const state = { day, sent: 0 };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const Date = function () { return { toDateString: () => state.day }; };
  const DB = { getSetting: (_k, d) => d };
  const notify = () => { state.sent++; };
  const { celebrateWorkoutComplete } = new Function('localStorage', 'Date', 'DB', 'notify',
    `${block}\nreturn { celebrateWorkoutComplete };`)(localStorage, Date, DB, notify);
  return { state, store, celebrate: celebrateWorkoutComplete };
}

test('celebrates once per day, again after midnight', () => {
  const { state, celebrate } = setup('Mon Jan 01 2029');
  celebrate('A'); celebrate('A');
  assert.equal(state.sent, 1);
  state.day = 'Tue Jan 02 2029';
  celebrate('A');
  assert.equal(state.sent, 2);
  celebrate('A');
  assert.equal(state.sent, 2);
});

test('a same-day reload keeps the stored dedup', () => {
  const { state, celebrate, store } = setup('Mon Jan 01 2029');
  celebrate('A');
  const again = setup('Mon Jan 01 2029', store);
  again.celebrate('A');
  assert.equal(again.state.sent, 0);
  assert.equal(state.sent, 1);
});

test('another tab rolling the stored date resets this tab', () => {
  const { state, celebrate, store } = setup('Mon Jan 01 2029');
  celebrate('A');
  store['lt:celebDate'] = 'Sun Dec 31 2028';
  celebrate('A');
  assert.equal(state.sent, 2);
});
