import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const src = readFileSync('src/components/progress-photos/ProgressPhotosTimeline.svelte', 'utf8');

test('lt:body-stats-saved handler refreshes stats quietly, no full load()', () => {
  const m = src.match(/function onStatsChanged\(\)\s*\{([^}]*)\}/);
  assert.ok(m, 'onStatsChanged exists');
  assert.match(m[1], /\brefreshStats\(\)/);
  assert.doesNotMatch(m[1], /\bload\(\)/);
  assert.match(src, /addEventListener\('lt:body-stats-saved', onStatsChanged\)/);
});
