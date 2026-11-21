/** Program detail and workout editor show an inline error with Retry when the first load fails. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const en = JSON.parse(read('../src/i18n/en.json'));

test('ProgramDetail has an error branch with Retry calling load()', () => {
  const s = read('../src/routes/ProgramDetail.svelte');
  assert.match(s, /\{:else if loadError && !program\}/);
  assert.match(s, /on:click=\{\(\) => load\(\)\}>\{\$_\('sync\.retry'\)\}/);
  assert.match(s, /loadError = !program/);
  assert.ok(en.program_detail.load_failed);
});

test('WorkoutEditor has an error branch with Retry calling loadTemplate', () => {
  const s = read('../src/routes/WorkoutEditor.svelte');
  assert.match(s, /\{:else if loadError && !template\}/);
  assert.match(s, /on:click=\{loadTemplate\}>\{\$_\('sync\.retry'\)\}/);
  assert.match(s, /onMount\(loadTemplate\)/);
  assert.ok(en.workout_editor.load_failed);
  assert.ok(en.sync.retry);
});
