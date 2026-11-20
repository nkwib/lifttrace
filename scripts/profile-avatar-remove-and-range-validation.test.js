import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBody } from '../src/lib/validation.js';
import { displayToKg, ftInToCm } from '../src/lib/workout.js';

test('validateBody height range', () => {
  assert.equal(validateBody({ cm: 17 }), 'height');
  assert.equal(validateBody({ cm: 300 }), 'height');
  assert.equal(validateBody({ cm: 50 }), null);
  assert.equal(validateBody({ cm: 250 }), null);
  assert.equal(validateBody({ cm: null }), null);
});

test('validateBody weight range in kg-equivalent', () => {
  assert.equal(validateBody({ weightKg: displayToKg(5, 'lbs') }), 'weight');
  assert.equal(validateBody({ weightKg: displayToKg(500, 'lbs') }), null);
  assert.equal(validateBody({ weightKg: displayToKg(600, 'lbs') }), 'weight');
  assert.equal(validateBody({ weightKg: 19.9 }), 'weight');
  assert.equal(validateBody({ weightKg: null }), null);
  assert.equal(validateBody({ cm: ftInToCm(5, 10), weightKg: 80 }), null);
});

test('lb bounds in Profile and message agree with validateBody', () => {
  assert.equal(validateBody({ weightKg: displayToKg(44, 'lbs') }), 'weight');
  assert.equal(validateBody({ weightKg: displayToKg(45, 'lbs') }), null);
  assert.equal(validateBody({ weightKg: displayToKg(551, 'lbs') }), null);
  const s = readFileSync(new URL('../src/routes/Profile.svelte', import.meta.url), 'utf8');
  const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
  assert.match(s, /min=\{\$weightUnit === 'kg' \? 20 : 45\}\s+max=\{\$weightUnit === 'kg' \? 250 : 551\}|min=\{\$weightUnit === 'kg' \? 20 : 45\} max=\{\$weightUnit === 'kg' \? 250 : 551\}/);
  assert.match(en.profile.weight_range, /20 and 250 kg \(45 to 551 lb\)/);
});

test('Profile: local save clears avatar, remove button, validate before writes', () => {
  const s = readFileSync(new URL('../src/routes/Profile.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(s, /if \(avatarUrl\) DB\.setSetting\('localUserAvatar'/);
  assert.match(s, /DB\.setSetting\('localUserAvatar',\s*avatarUrl\s*\|\|\s*''\)/);
  assert.match(s, /\{#if avatarUrl\}\s*<button type="button"[^>]*avatar-remove/);
  assert.ok(s.indexOf('validateBody({') < s.indexOf('$heightCmStore = finalCm'));
});

test('en.json has the new keys', () => {
  const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
  for (const k of ['remove_avatar', 'height_range', 'weight_range']) assert.ok(en.profile[k]);
});
