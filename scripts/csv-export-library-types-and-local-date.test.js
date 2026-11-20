import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLibraryLoadTypes, workoutRows } from '../src/lib/workoutCsv.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const COMPONENTS = ['../src/components/diary/WorkoutSummary.svelte', '../src/components/settings/SettingsBackup.svelte'];

test('no listExercises call in export code', () => {
  for (const f of [...COMPONENTS, '../src/lib/workoutCsv.js']) {
    assert.ok(!/listExercises/.test(stripComments(read(f))), f);
  }
});

test('every LtApi method used by the export components exists in api.js', () => {
  const api = read('../src/lib/api.js');
  for (const f of COMPONENTS) {
    const used = new Set([...stripComments(read(f)).matchAll(/LtApi\.(\w+)/g)].map(m => m[1]));
    for (const m of used) assert.match(api, new RegExp(`\\b${m}\\s*:`), `${f}: LtApi.${m}`);
  }
});

test('both components use the shared helper', () => {
  for (const f of COMPONENTS) assert.match(read(f), /loadLibraryLoadTypes\(LtApi\)/);
});

test('filename uses local date, not UTC', () => {
  const src = stripComments(read('../src/lib/workoutCsv.js'));
  assert.match(src, /localDateStr\(\)/);
  assert.ok(!/toISOString/.test(src));
});

test('unilateral library exercise expands to L and R rows', async () => {
  const api = { getExercises: async () => [{ id: 7, load_type: 'unilateral' }, { id: 8 }] };
  const map = await loadLibraryLoadTypes(api);
  assert.equal(map.get(7), 'unilateral');
  const w = { date: '2026-01-01', name: 'A', exercises: [{ exercise_id: 7, exercise_name: 'Curl', sets: [{ reps: 5, weight: 10, completed: true }] }] };
  assert.equal(workoutRows(w, 'kg', map).length, 2);
  assert.equal(workoutRows(w, 'kg', null).length, 1);
});

test('helper failure is non-fatal and returns null', async () => {
  const warn = console.warn;
  let warned = 0;
  console.warn = () => { warned++; };
  try {
    assert.equal(await loadLibraryLoadTypes({ getExercises: async () => { throw new Error('x'); } }), null);
    assert.equal(await loadLibraryLoadTypes({}), null);
  } finally { console.warn = warn; }
  assert.equal(warned, 2);
});
