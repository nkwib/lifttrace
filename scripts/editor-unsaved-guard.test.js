import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isEditorDirty } from '../src/lib/editor-merge.js';

const ex = (uuid, extra = {}) => ({ uuid, exercise_id: 1, target_sets: 3, weeks: [null, { reps: 8 }], ...extra });
const tpl = (exercises, extra = {}) => ({ id: 7, name: 'Push', exercises, ...extra });
const copy = v => JSON.parse(JSON.stringify(v));

test('untouched load round trip is clean', () => {
  const t = tpl([ex('a'), ex('b')]);
  assert.equal(isEditorDirty(copy(t), t), false);
  assert.equal(isEditorDirty(null, t), false);
  assert.equal(isEditorDirty(t, null), false);
});

test('rename and changed set count are dirty', () => {
  const b = tpl([ex('a')]);
  assert.equal(isEditorDirty(b, tpl([ex('a')], { name: 'Pull' })), true);
  assert.equal(isEditorDirty(b, tpl([ex('a', { target_sets: 4 })])), true);
});

test('added then removed is clean; key order, undefined and server fields ignored', () => {
  const b = tpl([ex('a')]);
  const c = tpl([{ target_sets: 3, weeks: [null, { reps: 8 }], uuid: 'a', exercise_id: 1, x: undefined }], { updated_at: 'later' });
  assert.equal(isEditorDirty(b, c), false);
  assert.equal(isEditorDirty(b, tpl([ex('a'), ex('b')])), true);
  assert.equal(isEditorDirty(b, tpl([ex('a')])), false);
});

test('editor wiring', () => {
  const src = readFileSync(new URL('../src/routes/WorkoutEditor.svelte', import.meta.url), 'utf8');
  assert.match(src, /onBack\(leave\)/);
  assert.match(src, /confirmDialog\(/);
  assert.match(src, /on:click=\{leave\}/);
  assert.match(src, /onDestroy\(stopTracking\)/);
  assert.ok(src.indexOf('_base = _copy(template); // saved') < src.indexOf('push(`/programs/${params.programId}`);'));
});
