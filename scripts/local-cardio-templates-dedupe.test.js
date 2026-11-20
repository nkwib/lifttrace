import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { uniqueByActivity } from '../src/lib/cardio-templates.js';

test('keeps first row per activity, exact match', () => {
  const rows = [{ activity: 'Run', id: 2 }, { activity: 'Run', id: 1 }, { activity: 'Bike', id: 3 }, { activity: 'run', id: 4 }];
  assert.deepEqual(uniqueByActivity(rows).map(r => r.id), [2, 3, 4]);
});

test('Cardio.templates dedupes after ordered query', () => {
  const src = fs.readFileSync(new URL('../src/lib/api-native.js', import.meta.url), 'utf8');
  assert.match(src, /is_template = 1 ORDER BY updated_at DESC, id DESC`, \[ME\]\);\s+return uniqueByActivity\(rows\)/);
});
