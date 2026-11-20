import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { labelStride, showBarLabel, fmtWeekLabel } from '../src/lib/statsFormat.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('labelStride', () => {
  for (const [n, s] of [[0, 1], [1, 1], [4, 1], [12, 1], [13, 2], [26, 4], [52, 7], [200, 25]]) {
    assert.equal(labelStride(n), s, `count ${n}`);
  }
});

test('showBarLabel: stride, last always shown, no adjacent collision', () => {
  for (const count of [4, 12, 13, 26, 52, 200]) {
    const shown = [...Array(count).keys()].filter(i => showBarLabel(i, count));
    assert.ok(shown.includes(count - 1));
    if (count <= 12) assert.equal(shown.length, count);
    else {
      const n = labelStride(count);
      for (let k = 1; k < shown.length; k++) assert.ok(shown[k] - shown[k - 1] >= n / 2);
      assert.ok(shown.length <= 10);
    }
  }
});

test('fmtWeekLabel takes the Monday date', () => {
  assert.equal(fmtWeekLabel('2026-04-20'), '04-20');
  assert.equal(fmtWeekLabel(''), '');
});

test('new i18n keys exist in en.json and literals are gone from components', () => {
  const en = JSON.parse(read('../src/i18n/en.json'));
  const keys = {
    weekly_volume_chart: ['desc', 'log_another', 'total_peak', 'readout'],
    workout_frequency_chart: ['desc', 'log_another', 'average', 'goal', 'goal_title', 'readout', 'readout_hit'],
  };
  for (const [block, ks] of Object.entries(keys)) for (const k of ks) assert.ok(en[block][k], `${block}.${k}`);
  const vol = read('../src/components/statistics/WeeklyVolumeChart.svelte');
  const freq = read('../src/components/statistics/WorkoutFrequencyChart.svelte');
  for (const lit of ['Total weight moved', 'Log another week', 'Total: {']) assert.ok(!vol.includes(lit), lit);
  for (const lit of ['Training days logged', 'Log another week', 'Average: {', 'Goal {goal}']) assert.ok(!freq.includes(lit), lit);
  for (const src of [vol, freq]) assert.match(src, /<button type="button" class="bar-col"/);
});
