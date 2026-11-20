import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workoutToCsv, workoutsToCsv, workoutRows } from '../src/lib/workoutCsv.js';

const mk = (date, name) => ({
  date, name, notes: 'n,1', duration_min: 30,
  exercises: [{
    exercise_id: 1, exercise_name: 'Bench "Press"', sets: [
      { reps: 5, weight: 100, completed: true },
      { reps_l: 6, reps_r: 7, weight: 20, completed: false },
    ],
  }],
});

test('workoutToCsv equals header + workoutRows', () => {
  const w = mk('2026-01-02', 'A');
  const { csv } = workoutToCsv(w, 'kg');
  const header = csv.split('\r\n')[0];
  assert.equal(csv, [header, ...workoutRows(w, 'kg')].join('\r\n') + '\r\n');
});

test('one header, ordered, escaping, split L/R rows', () => {
  const csv = workoutsToCsv([mk('2026-01-01', 'A'), mk('2026-01-02', 'B')], 'kg');
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.filter(l => l.startsWith('date,')).length, 1);
  assert.equal(lines.length, 1 + 3 * 2);
  assert.ok(lines[1].startsWith('2026-01-01,A,'));
  assert.ok(lines[4].startsWith('2026-01-02,B,'));
  assert.ok(lines[1].includes('"Bench ""Press"""'));
  assert.ok(lines[1].includes('"n,1"'));
  assert.ok(lines[2].includes(',6,20,kg,L,'));
  assert.ok(lines[3].includes(',7,20,kg,R,'));
});

test('empty list is header only', () => {
  assert.equal(workoutsToCsv([], 'kg').split('\r\n').length, 2);
});

test('Settings row wiring', () => {
  const s = readFileSync('src/components/settings/SettingsBackup.svelte', 'utf8');
  assert.match(s, /exportAllWorkoutsCsv/);
  assert.match(s, /getRecentWorkouts\(20000\)/);
  assert.match(s, /<Spinner/);
  const row = s.indexOf('settings_backup.export.all_csv');
  const gate = s.indexOf("{#if serverEnabled}\n      <p class=\"sub-label\">{$_('settings_backup.sections.full_backup");
  assert.ok(row > 0 && gate > row, 'export row sits outside the serverEnabled gate');
  assert.match(readFileSync('src/lib/workoutCsv.js', 'utf8'), /lifttrace-workouts-/);
});
