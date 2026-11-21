// The trained-day loaders must ask for cardio with an explicit range: an
// unranged GET /api/cardio (and Local mode's list) is capped at the newest 500.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/routes/Statistics.svelte', import.meta.url), 'utf8');
const native = fs.readFileSync(new URL('../src/lib/api-native.js', import.meta.url), 'utf8');

test('no unranged listCardio() call in Statistics', () => {
  assert.doesNotMatch(page, /listCardio\(\)/);
  assert.equal((page.match(/listCardio\(ALL_CARDIO_FROM, ALL_CARDIO_TO\)/g) || []).length, 2);
});

test('the all-time range is wide enough and Local mode honours a range', () => {
  assert.match(page, /ALL_CARDIO_FROM = '2000-01-01'/);
  assert.match(page, /ALL_CARDIO_TO = '9999-12-31'/);
  assert.match(native, /async list\(start, end\) \{\s*const rows = \(start && end\)\s*\? await dbQuery\(`SELECT \* FROM cardio_log WHERE user_id = \? AND date BETWEEN \? AND \?/);
});
