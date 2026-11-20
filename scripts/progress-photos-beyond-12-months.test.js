import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/progress-photos/ProgressPhotosTimeline.svelte', 'utf8');
const en = JSON.parse(readFileSync('src/i18n/en.json', 'utf8'));

test('startStr follows the chosen range, All uses a fixed early date', () => {
  assert.match(src, /export let months = 12;/);
  assert.match(src, /let range = months;/);
  assert.match(src, /if \(range === 'all'\) return ALL_FROM;/);
  assert.match(src, /ALL_FROM = '2000-01-01'/);
  assert.match(src, /getMonth\(\) - range/);
});

test('range change resets compare state and reloads through load()', () => {
  const fn = src.match(/function setRange\(next\) \{[\s\S]*?\n  \}/)[0];
  assert.match(fn, /compareMode = false/);
  assert.match(fn, /picked = \[\]/);
  assert.match(fn, /load\(\)/);
});

test('chips render outside the empty branch with aria-pressed', () => {
  assert.ok(src.indexOf('pp-range"') < src.indexOf('{#if loading}'));
  assert.match(src, /aria-pressed=\{range === 'all'\}/);
  assert.match(src, /min-height: 44px/);
});

test('en.json has progress.range keys', () => {
  for (const k of ['label', 'recent', 'all']) assert.ok(en.progress.range[k]);
});
