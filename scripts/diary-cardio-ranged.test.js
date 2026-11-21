// Diary's cardio read must be ranged: a bare GET /api/cardio is capped at 500.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/routes/Diary.svelte', import.meta.url), 'utf8');

test('Diary asks for cardio with an explicit all-time range', () => {
  assert.doesNotMatch(page, /listCardio\(\)/);
  assert.match(page, /listCardio\('2000-01-01', '9999-12-31'\)/);
});
