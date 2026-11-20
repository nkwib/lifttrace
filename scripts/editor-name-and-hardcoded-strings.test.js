import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('WorkoutEditor save trims and blocks an empty name', () => {
  const s = read('src/routes/WorkoutEditor.svelte');
  assert.match(s, /const name = \(template\.name \|\| ''\)\.trim\(\);\s*\n\s*if \(!name\) \{ showError\(\$_\('workout_editor\.name_required'\)\); return; \}/);
  assert.match(s, /updateTemplate\(params\.templateId, \{ name,/);
});

test('server templates route trims names and refuses a blank one', () => {
  const s = read('server/routes/templates.js');
  assert.match(s, /typeof req\.body\.name === 'string' \? req\.body\.name\.trim\(\) : ''/);
  assert.match(s, /!req\.body\.name\.trim\(\)\) return res\.status\(400\)/);
  assert.match(s, /typeof body\.name === 'string' \? body\.name\.trim\(\) : undefined/);
});

test('native Templates trims on create and update like the server', () => {
  const s = read('src/lib/api-native.js');
  const i = s.indexOf('const Templates = {');
  const t = s.slice(i, s.indexOf('const Workout = {'));
  assert.match(t, /body\.name\.trim\(\)/);
  assert.match(t, /if \(!name\) throw new Error\('Name required'\)/);
});

test('moved literals are gone from the editors and menus', () => {
  const gone = {
    'src/routes/WorkoutEditor.svelte': [/'Saving\.\.\.'/, /label: 'Move up'/, /label: 'Delete exercise'/, /"Loading template/],
    'src/routes/ProgramDetail.svelte': [/label: 'Delete Program'/, /label: 'Rename'/, /^\s+Set Active$/m, /'Saving\.\.\.'/],
    'src/routes/ExerciseDetail.svelte': [/aria-label="Delete exercise"/, /title="Share exercise as JSON"/],
    'src/routes/Programs.svelte': [/ workouts<\/span>/, /aria-label="Close preview"/],
    'src/components/layout/BottomNav.svelte': [/aria-label="Update available"/],
    'src/components/layout/Sidebar.svelte': [/aria-label="Update available"/],
  };
  for (const [f, res] of Object.entries(gone)) for (const re of res) assert.doesNotMatch(read(f), re, `${f} ${re}`);
});

test('new keys exist in en.json', () => {
  const en = JSON.parse(read('src/i18n/en.json'));
  const get = (k) => k.split('.').reduce((o, p) => o?.[p], en);
  for (const k of ['workout_editor.name_required', 'workout_editor.loading', 'workout_editor.actions.move_up',
    'program_detail.delete_program', 'exercise_detail.delete_exercise', 'programs.workouts_count', 'nav.update_available'])
    assert.equal(typeof get(k), 'string', k);
});
