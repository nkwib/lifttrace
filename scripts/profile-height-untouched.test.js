import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cmToFtIn, ftInToCm } from '../src/lib/workout.js';

test('ft/in round trip is lossy, so untouched height must keep stored cm', () => {
  const { ft, in: inch } = cmToFtIn(172);
  assert.notEqual(ftInToCm(String(ft), String(inch)), 172);
});

test('Profile skips height rewrite when the inputs are untouched', () => {
  const s = readFileSync(new URL('../src/routes/Profile.svelte', import.meta.url), 'utf8');
  assert.match(s, /initialHeightFt = heightFt/);
  assert.match(s, /heightFt === initialHeightFt && heightIn === initialHeightIn/);
  assert.match(s, /heightUntouched && \$heightCmStore\)\s*\?\s*\$heightCmStore/);
});
