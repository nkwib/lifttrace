import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LtApi } from '../src/lib/api.js';
import { duplicateTemplate } from '../src/lib/program-actions.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function stub() {
  const calls = { create: [], reorder: [] };
  LtApi.createTemplate = async (b) => { calls.create.push(b); return { id: 99, ...b }; };
  LtApi.reorderTemplates = async (pid, ids) => { calls.reorder.push([pid, ids]); return {}; };
  return calls;
}
const src = { id: 2, name: 'Push', day_label: 'Mon', exercises: [{ uuid: 'e1', exercise_id: 1, sets: [{ uuid: 's1', reps: 5 }] }] };
const siblings = [{ id: 1, name: 'Legs' }, src, { id: 3, name: 'Pull' }];

test('copy is named, deep, keeps identity, targets the program', async () => {
  const calls = stub();
  await duplicateTemplate(7, src, siblings);
  const body = calls.create[0];
  assert.equal(body.program_id, 7);
  assert.equal(body.name, 'Push (Copy)');
  assert.equal(body.day_label, 'Mon');
  assert.deepEqual(body.exercises, src.exercises);
  body.exercises[0].sets[0].reps = 99;
  assert.equal(src.exercises[0].sets[0].reps, 5);
});

test('copy name skips taken names', async () => {
  const calls = stub();
  await duplicateTemplate(7, src, [...siblings, { id: 4, name: 'Push (Copy)' }]);
  assert.equal(calls.create[0].name, 'Push (Copy 2)');
});

test('copy lands right after the source; reorder failure is tolerated', async () => {
  const calls = stub();
  await duplicateTemplate(7, src, siblings);
  assert.deepEqual(calls.reorder[0], [7, [1, 2, 99, 3]]);
  LtApi.reorderTemplates = async () => { throw new Error('x'); };
  const c = await duplicateTemplate(7, src, siblings);
  assert.equal(c.id, 99);
});

test('ProgramDetail wires a guarded, non-propagating copy button', () => {
  const s = read('src/routes/ProgramDetail.svelte');
  assert.match(s, /async function copyTemplate\(e, t\) \{\s*e\.stopPropagation\(\)/);
  assert.match(s, /duplicatingTpl/);
  const btn = s.indexOf('copyTemplate(e, t)}');
  assert.ok(btn > 0);
  assert.ok(s.lastIndexOf('{#if !othersProgram}', btn) > s.lastIndexOf('{/if}', btn));
});
