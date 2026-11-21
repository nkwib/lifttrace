import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GOALS, goalLabel } from '../src/lib/workout.js';

const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
const read = (p) => fs.readFileSync(p, 'utf8');
const programs = read('src/routes/Programs.svelte');
const detail = read('src/routes/ProgramDetail.svelte');
const coaching = read('src/routes/Coaching.svelte');
const lookup = (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), en);

test('GOALS ids are unchanged and each has a programs.goals label', () => {
  assert.deepEqual(GOALS.map((g) => g.id), ['cutting', 'bulking', 'maintenance', 'strength', 'endurance', 'general']);
  for (const g of GOALS) assert.equal(en.programs.goals[g.id], g.label);
});

test('goalLabel translates known ids and falls back to the raw id', () => {
  const t = (k, o) => (lookup(k) ?? o?.default ?? k);
  assert.equal(goalLabel('cutting', t), 'Cutting');
  assert.equal(goalLabel('my custom goal', t), 'my custom goal');
  assert.equal(goalLabel('', t), '');
});

test('Programs.svelte has no hardcoded English in create sheet and preview', () => {
  for (const lit of ['Duration (weeks)', 'Weeks in this training block', "'Creating...'", '>Workouts<', 'Loading…</div>',
    'No workouts yet', 'Preview any program', 'Tap any card', '{p.duration_weeks} weeks', 'placeholder="e.g.', "'Failed to load program'"]) {
    assert.ok(!programs.includes(lit), lit);
  }
  assert.doesNotMatch(programs, /\{g\.label\}/);
  assert.doesNotMatch(programs, /<span class="goal-tag">\{p\.goal\}/);
  assert.doesNotMatch(programs, /^\s*New\s*$/m);
});

test('goal and counts are localized in ProgramDetail and Coaching', () => {
  assert.ok(!detail.includes('{program.goal}'));
  assert.ok(!detail.includes('Duration (weeks)'));
  assert.ok(!/\} workouts<\/span>/.test(detail));
  assert.ok(coaching.includes("goalLabel(p.goal || 'general', $_)"));
});

test('every programs.* / diary_extra.* key used by the touched screens exists', () => {
  for (const src of [programs, detail]) {
    for (const m of src.matchAll(/\$_\('((?:programs|diary_extra)\.[a-z_.]+)'/g)) assert.equal(typeof lookup(m[1]), 'string', m[1]);
  }
});
