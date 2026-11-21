import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanNote, withNote, EXERCISE_NOTE_MAX, EXERCISE_NOTES_MAX_ENTRIES } from '../src/lib/exercise-notes.js';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('cleanNote trims and caps', () => {
  assert.equal(cleanNote('  seat 4  '), 'seat 4');
  assert.equal(cleanNote(null), '');
  assert.equal(cleanNote('x'.repeat(900)).length, EXERCISE_NOTE_MAX);
});

test('withNote sets, deletes on empty, caps entries', () => {
  assert.deepEqual(withNote({}, 5, ' hi '), { 5: 'hi' });
  assert.deepEqual(withNote({ 5: 'hi', 6: 'a' }, 5, '  '), { 6: 'a' });
  const full = Object.fromEntries(Array.from({ length: EXERCISE_NOTES_MAX_ENTRIES }, (_, i) => [i + 1, 'n']));
  assert.equal(Object.keys(withNote(full, 99999, 'new')).length, EXERCISE_NOTES_MAX_ENTRIES);
  assert.equal(withNote(full, 1, 'edit')[1], 'edit');
});

test('exerciseNotes is a synced per-exercise setting in every list', () => {
  assert.match(read('../src/stores/settings.js'), /'exerciseDistanceUnits', 'exerciseNotes',/);
  for (const f of ['../src/lib/sync.js', '../src/lib/migrate.js']) {
    assert.match(read(f), /\[[^\]]*'exerciseNotes'[^\]]*\]/, f);
  }
});

test('note editor and chip are wired, never as raw html', () => {
  const info = read('../src/components/exercises/ExerciseInfo.svelte');
  assert.match(info, /bind:value=\{noteDraft\} on:blur=\{saveNote\}/);
  assert.match(info, /onDestroy\(saveNote\)/);
  const card = read('../src/components/diary/ExerciseCard.svelte');
  assert.match(card, /class="sticky-note/);
  assert.doesNotMatch(info + card, /\{@html[^}]*[nN]ote/);
});
