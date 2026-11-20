import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { platesPerSide, formatPerSide } from '../src/lib/plates.js';
import { barWeightForEquipment } from '../src/lib/equipment.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('100 kg on a 20 kg bar is 25 + 15 per side', () => {
  assert.deepEqual(platesPerSide(100, 20, 'kg'), { perSide: [25, 15], remainder: 0 });
  assert.equal(formatPerSide([25, 15]), '25 + 15');
});

test('lb split and 1.25 kg plates without float error', () => {
  assert.deepEqual(platesPerSide(225, 45, 'lbs').perSide, [45, 45]);
  assert.deepEqual(platesPerSide(102.5, 20, 'kg'), { perSide: [25, 15, 1.25], remainder: 0 });
});

test('at or under the bar gives no plates', () => {
  assert.deepEqual(platesPerSide(20, 20, 'kg').perSide, []);
  assert.deepEqual(platesPerSide(10, 20, 'kg').perSide, []);
});

test('unbuildable weight reports the remainder', () => {
  assert.deepEqual(platesPerSide(21, 20, 'kg'), { perSide: [], remainder: 1 });
});

test('bar follows the raw equipment string', () => {
  assert.equal(barWeightForEquipment('Barbell', 'kg'), 20);
  assert.equal(barWeightForEquipment(['olympic barbell'], 'lbs'), 45);
  assert.equal(barWeightForEquipment('EZ Bar', 'kg'), 10);
  assert.equal(barWeightForEquipment('ez-curl bar', 'lbs'), 25);
  assert.equal(barWeightForEquipment('Trap Bar', 'kg'), 25);
  assert.equal(barWeightForEquipment('hex bar', 'lbs'), 55);
  assert.equal(barWeightForEquipment('Smith Machine', 'kg'), null);
  assert.equal(barWeightForEquipment('Dumbbell', 'kg'), null);
  assert.equal(barWeightForEquipment('', 'kg'), null);
});

test('wiring: GymTools uses plates.js, ExerciseCard shows the line behind the setting', () => {
  assert.match(read('src/components/diary/GymTools.svelte'), /from '\.\.\/\.\.\/lib\/plates\.js'/);
  const card = read('src/components/diary/ExerciseCard.svelte');
  assert.match(card, /platesPerSide/);
  assert.match(card, /\$showPlateSplit/);
  assert.match(read('src/stores/settings.js'), /createSettingStore\('showPlateSplit', false\)/);
  assert.match(read('src/components/settings/SettingsWorkout.svelte'), /\$showPlateSplit/);
});
