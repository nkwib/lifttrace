// Wide set (1Y/All) reloads on a Track Cardio flip and keeps its old data
// during a same-limit refresh instead of blinking back to the base set.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wideReloadNeeded } from '../src/lib/statsFormat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(__dirname, '..', 'src/routes/Statistics.svelte'), 'utf8');
const i = page.indexOf('async function loadWideData(');
const fn = page.slice(i, page.indexOf('\n  }\n', i));

test('wideReloadNeeded', () => {
  const base = { limit: 1000, lastLimit: 1000, cardio: true, lastCardio: true };
  assert.equal(wideReloadNeeded(base), false);
  assert.equal(wideReloadNeeded({ ...base, force: true }), true);
  assert.equal(wideReloadNeeded({ ...base, cardio: false }), true);
  assert.equal(wideReloadNeeded({ ...base, lastLimit: 365 }), true);
  assert.equal(wideReloadNeeded({ ...base, lastLimit: 0, lastCardio: null }), true);
});

test('loadWideData tracks cardio, clears only on a limit change', () => {
  assert.match(fn, /wideReloadNeeded\(/);
  assert.match(fn, /if \(limit !== _wideLimit\) wideLogs = wideDates = wideMeta = null/);
  assert.doesNotMatch(fn, /_wideLimit = limit;\s*wideLogs = wideDates = wideMeta = null/);
  assert.equal((fn.match(/_wideCardio = null/g) || []).length, 3);
  assert.doesNotMatch(fn, /\$cardioEnabled \?/);
});
