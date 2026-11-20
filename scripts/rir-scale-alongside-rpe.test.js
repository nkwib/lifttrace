// RIR as an alternative to RPE (training-depth plan item 10).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  rirToRpe, rpeToRir, setScale, effortChip, effortLevel, withEffort, rirLabel,
} from '../src/lib/effort-scale.js';
import { mergeExercises } from '../src/lib/workout-merge.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('RIR 0..4 map to rpe 10..6 and round trip', () => {
  for (let n = 0; n <= 4; n++) {
    assert.equal(rirToRpe(n), 10 - n);
    assert.equal(rpeToRir(rirToRpe(n)), n);
  }
});

test('5+ clamps to rpe 5 and back to 5', () => {
  assert.equal(rirToRpe(5), 5);
  assert.equal(rirToRpe(9), 5);
  assert.equal(rpeToRir(5), 5);
  assert.equal(rpeToRir(3), 5);
  assert.equal(rirLabel(5), '5+');
});

test('half RPEs round to the nearest whole RIR, harder on a tie', () => {
  assert.equal(rpeToRir(9.5), 0);
  assert.equal(rpeToRir(8.5), 1);
  assert.equal(rpeToRir(7.5), 2);
});

test('null and junk stay null', () => {
  assert.equal(rirToRpe(null), null);
  assert.equal(rirToRpe(''), null);
  assert.equal(rpeToRir(null), null);
  assert.equal(rpeToRir(undefined), null);
  assert.equal(rpeToRir('x'), null);
  assert.equal(effortChip({ rpe: null }), null);
});

test('a set shows by its own scale, not the setting', () => {
  assert.equal(setScale({ rpe: 8 }), 'rpe');
  assert.equal(effortChip({ rpe: 7.5 }), '@7.5');
  assert.equal(effortChip({ rpe: 8, rpe_scale: 'rir' }), 'R2');
  assert.equal(effortChip({ rpe: 5, rpe_scale: 'rir' }), 'R5+');
});

test('levels by reps left', () => {
  assert.equal(effortLevel(10), 'max');
  assert.equal(effortLevel(9), 'hard');
  assert.equal(effortLevel(8), 'moderate');
  assert.equal(effortLevel(6), 'easy');
  assert.equal(effortLevel(null), null);
});

test('withEffort writes the scale and clearing drops it', () => {
  const s = { uuid: 'a', reps: 5 };
  const r = withEffort(s, 'rir', 2);
  assert.deepEqual(r, { uuid: 'a', reps: 5, rpe: 8, rpe_scale: 'rir' });
  assert.deepEqual(withEffort(r, 'rpe', 7), { uuid: 'a', reps: 5, rpe: 7 });
  assert.deepEqual(withEffort(r, 'rir', null), { uuid: 'a', reps: 5, rpe: null });
});

test('the set merge keeps rpe_scale', () => {
  const ex = (sets) => [{ uuid: 'e1', exercise_name: 'Squat', sets }];
  const server = ex([{ uuid: 's1', reps: 5, weight: 100, rpe: 8, rpe_scale: 'rir' }]);
  const client = ex([{ uuid: 's1', reps: 5, weight: 100, rpe: 7, rpe_scale: 'rir' }, { uuid: 's2', reps: 5, weight: 100, rpe: 9, rpe_scale: 'rir' }]);
  const { merged } = mergeExercises(server, client, [], [], {}, {}, null);
  const sets = merged[0].sets;
  assert.ok(sets.every(s => s.rpe_scale === 'rir'));
  assert.equal(sets.find(s => s.uuid === 's1').rpe, 7);
});

test('wiring: setting, USER_PREFS, picker, REST/MCP rpe drops the scale', () => {
  const settings = read('../src/stores/settings.js');
  assert.match(settings, /'trackRpe', 'effortScale'/);
  assert.match(settings, /createSettingStore\('effortScale', 'rpe'\)/);
  const row = read('../src/components/diary/SetRow.svelte');
  assert.match(row, /effort-scale\.js/);
  assert.match(row, /RIR_VALUES/);
  assert.match(read('../src/components/settings/SettingsWorkout.svelte'), /\$effortScale/);
  for (const f of ['../server/lib/planned-workout.js', '../src/lib/planned-workout.js']) assert.match(read(f), /delete set\.rpe_scale/);
  // MCP keeps RPE only.
  assert.doesNotMatch(read('../server/lib/mcp/tools/log-set.js'), /rpe_scale/);
});
