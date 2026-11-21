// Statistics left open past midnight must roll "today" forward.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(__dirname, '..', 'src/routes/Statistics.svelte'), 'utf8');

test('endDate, startDate, heatmap, sparkline and week ring derive from today', () => {
  assert.match(page, /let today = localDateStr\(\);/);
  assert.match(page, /\$: endDate = today;/);
  assert.match(page, /\$: startDate = \(\(\) => \{[\s\S]*?new Date\(today \+ 'T12:00:00'\)/);
  assert.match(page, /\$: heatmapDays = [\s\S]*?new Date\(today \+ 'T12:00:00'\)/);
  assert.match(page, /\$: streakSparkline = [\s\S]*?new Date\(today \+ 'T12:00:00'\)/);
  assert.match(page, /weekStartOf\(today, \$weekStartsOn\)/);
  assert.match(page, /class:hm-today=\{day === today\}/);
});

test('refreshToday is a no-op when the date is unchanged', () => {
  assert.match(page, /function refreshToday\(\) \{\s*const t = localDateStr\(\);\s*if \(t === today\) return false;\s*today = t;\s*return true;/);
});

test('loadData rolls the date and awaits the reactive flush before fetching', () => {
  assert.match(page, /async function loadData\(\) \{[\s\S]*?refreshToday\(\);\s*await tick\(\);[\s\S]*?loadRangeData\(\);/);
});

test('sync handler rolls the date before the quiet-window return', () => {
  const h = page.slice(page.indexOf('_onSyncComplete = (e)'));
  assert.ok(h.indexOf('refreshToday()') < h.indexOf('return;'));
  assert.match(h, /changed === false && !rolled/);
});

test('visibilitychange listener is paired and reloads only on rollover', () => {
  assert.match(page, /document\.addEventListener\('visibilitychange', _onVisible\)/);
  assert.match(page, /document\.removeEventListener\('visibilitychange', _onVisible\)/);
  assert.match(page, /visibilityState === 'visible' && refreshToday\(\)\) loadData\(\)/);
});

test('loadData awaits tick unconditionally (callers roll today before it)', () => {
  const body = page.slice(page.indexOf('async function loadData()'));
  const head = body.slice(0, body.indexOf('loadRangeData();'));
  assert.doesNotMatch(head, /if \(refreshToday\(\)\)/);
  assert.match(head, /await tick\(\);/);
});
