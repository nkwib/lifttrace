import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const D = 'src/components/diary/';
const r = (f) => readFileSync(D + f, 'utf8');
const en = JSON.parse(readFileSync('src/i18n/en.json', 'utf8'));

test('every icon span in diary cards is aria-hidden', () => {
  for (const f of ['SupersetCard.svelte', 'ExerciseCard.svelte', 'SetRow.svelte']) {
    const bad = (r(f).match(/<span class="material-symbols-rounded[^>]*>/g) || []).filter((t) => !t.includes('aria-hidden'));
    assert.deepEqual(bad, [], f);
  }
});

test('headers do not wrap interactive children in role=button', () => {
  for (const f of ['SupersetCard.svelte', 'ExerciseCard.svelte']) {
    assert.doesNotMatch(r(f), /role="button"/, f);
    assert.match(r(f), /class="(ss|ex)-toggle tap" aria-expanded=\{expanded\}/, f);
  }
  assert.match(r('SupersetCard.svelte'), /ss-remove-btn[^\n]*aria-label=/);
});

test('set inputs and buttons name their set', () => {
  const s = r('SetRow.svelte');
  for (const k of ['weight_set', 'reps_set', 'reps_left_set', 'reps_right_set', 'remove_set_n', 'mark_complete_set', 'mark_incomplete_set']) {
    assert.match(s, new RegExp(`exercise_card\\.${k}'`), k);
    assert.match(en.exercise_card[k], /\{n\}/, k);
  }
  assert.match(en.diary_extra.toggle_section, /\{name\}/);
  assert.doesNotMatch(r('ExerciseCard.svelte'), /aria-label="Load type"/);
});
