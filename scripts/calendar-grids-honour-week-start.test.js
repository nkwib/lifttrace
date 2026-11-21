import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthLeadingBlanks } from '../src/lib/week-start.js';

test('monthLeadingBlanks', () => {
  assert.equal(monthLeadingBlanks(2026, 10, 'sunday'), 0); // 2026-11-01 Sunday
  assert.equal(monthLeadingBlanks(2026, 10, 'monday'), 6);
  assert.equal(monthLeadingBlanks(2026, 7, 'sunday'), 6); // 2026-08-01 Saturday
  assert.equal(monthLeadingBlanks(2026, 7, 'monday'), 5);
  assert.equal(monthLeadingBlanks(2026, 5, 'monday'), 0); // 2026-06-01 Monday
  assert.equal(monthLeadingBlanks(2026, 5, 'sunday'), 1);
  assert.equal(monthLeadingBlanks(2026, 5, 'bogus'), 0); // falls back to Monday
});

for (const f of ['src/routes/Diary.svelte', 'src/components/ui/DatePicker.svelte']) {
  test(`${f} uses week start`, () => {
    const s = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!s.includes("'Su','Mo'"));
    assert.ok(!s.includes('getDay()'));
    assert.match(s, /monthLeadingBlanks\(calYear, calMonth, \$weekStartsOn\)/);
  });
}
