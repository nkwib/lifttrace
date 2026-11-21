// Toasts, tooltips and aria-labels in App, ProgramDetail, Exercises, WorkoutModeBar,
// ExerciseInfoSheet and SetRow come from en.json, not hardcoded English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
const paths = {
  App: 'src/App.svelte',
  ProgramDetail: 'src/routes/ProgramDetail.svelte',
  Exercises: 'src/routes/Exercises.svelte',
  WorkoutModeBar: 'src/components/WorkoutModeBar.svelte',
  ExerciseInfoSheet: 'src/components/exercises/ExerciseInfoSheet.svelte',
  SetRow: 'src/components/diary/SetRow.svelte',
  WorkoutSummary: 'src/components/diary/WorkoutSummary.svelte',
  ExercisePicker: 'src/components/exercises/ExercisePicker.svelte',
};
const src = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
const lookup = (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), en);

test('removed hardcoded literals stay gone', () => {
  const gone = {
    App: [/showSuccess\('(Linked|Signed in)'\)/, /aria-label="Open menu"/],
    ProgramDetail: [/showSuccess\('Program renamed'\)/, /aria-label="Program name"/, /title="Program actions"/,
      /title="Tap to Deactivate"/, /title="Drag to reorder"/, /title="Delete"/, />Select a workout</],
    Exercises: [/>Preview any exercise</, /Tap any row to see its thumbnail/, /title="(Filtered \/ total|Add exercise|Sort|Close preview)"/, /placeholder="Search exercises\.\.\."/,
      /aria-label="(Sort exercises|Display density|Close preview)"/, /label: '(Create new|Import from file|Import from URL)'/,
      /'(Remove from|Add to) Favorites'/, />All<\/button>/],
    WorkoutModeBar: [/'(Resume|Pause) timer'/, /title="Open diary"/, /Toggle screen keep-awake"/],
    ExerciseInfoSheet: [/>Loading…</, /Couldn't load exercise details/, /Add this exercise\n/, /Replace with library exercise\n/],
    SetRow: [/<\/span> ea\{/],
    WorkoutSummary: [/'(Share|Export) failed'/, /title="(Tap to edit duration|Export CSV)"/, /aria-label="Export workout as CSV"/, /'MET-based estimate/, /'Rough estimate based/],
    ExercisePicker: [/placeholder="Search exercises/, /title="(Already added this session|View details|Close preview)"/, /aria-label="(View details|Close preview)"/],
  };
  for (const [f, res] of Object.entries(gone)) for (const re of res) assert.doesNotMatch(src[f], re, `${f}: ${re}`);
});

test('every $_ key in edited files resolves in en.json', () => {
  for (const f of Object.keys(paths)) {
    assert.match(src[f], /import \{ _[,} ]/);
    for (const m of src[f].matchAll(/\$_\('([a-z0-9_.]+)'/g)) {
      assert.equal(typeof lookup(m[1]), 'string', `${f}: missing ${m[1]}`);
    }
  }
});

test('new strings have no em dash; SetRow keeps the unit-word span', () => {
  for (const g of ['app', 'workout_mode_bar']) assert.doesNotMatch(JSON.stringify(en[g]), /—/);
  assert.equal(en.exercise_card.per_hand_suffix, 'ea');
  assert.match(src.SetRow, /<span class="unit-word">\{unit\}<\/span> \{\$_\('exercise_card\.per_hand_suffix'\)\}/);
});
