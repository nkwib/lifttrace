import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kgToDisplay, displayToKg, KG_PER_LB } from '../src/lib/workout.js';

test('lb round trip is lossless at 0.5 lb steps', () => {
  for (let lb = 150; lb <= 300; lb += 0.5) {
    assert.equal(kgToDisplay(displayToKg(lb, 'lbs'), 'lbs'), lb);
  }
});

test('1-decimal kg values stay valid', () => {
  for (let kg = 40; kg <= 200; kg += 0.1) {
    const k = Math.round(kg * 10) / 10;
    assert.equal(displayToKg(k, 'kg'), k);
    assert.equal(kgToDisplay(k, 'kg'), k);
  }
  assert.equal(KG_PER_LB, 0.45359237);
});

test('Profile writes weight only when the field changed', () => {
  const s = readFileSync(new URL('../src/routes/Profile.svelte', import.meta.url), 'utf8');
  assert.match(s, /weightInput && weightInput !== initialWeightInput/);
  assert.match(s, /displayToKg\(v, \$weightUnit\)/);
});

test('Wizard and GymTools use KG_PER_LB', () => {
  for (const f of ['routes/Wizard.svelte', 'components/diary/GymTools.svelte']) {
    const s = readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
    assert.match(s, /KG_PER_LB/);
    assert.doesNotMatch(s, /2\.20462|0\.45359237/);
  }
});
