import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moveTemplate } from '../src/lib/program-actions.js';

const svelte = readFileSync(new URL('../src/routes/ProgramDetail.svelte', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));

test('moveTemplate moves, returns a new array, ignores bad indexes', () => {
  const l = [1, 2, 3];
  assert.deepEqual(moveTemplate(l, 0, 2), [2, 3, 1]);
  assert.deepEqual(moveTemplate(l, 2, 1), [1, 3, 2]);
  assert.deepEqual(l, [1, 2, 3]);
  assert.equal(moveTemplate(l, 1, 1), l);
  assert.equal(moveTemplate(l, -1, 1), l);
  assert.equal(moveTemplate(l, 0, 3), l);
});

test('ProgramDetail: drop and buttons share one guarded path', () => {
  assert.match(svelte, /moveTemplate\(program\.templates, from, to\)/);
  assert.match(svelte, /if \(reordering \|\| othersProgram/);
  assert.match(svelte, /LtApi\.reorderTemplates\(params\.id/);
  assert.match(svelte, /onTplDrop\(e, idx\)/);
  assert.match(svelte, /e\.stopPropagation\(\)/);
  assert.match(svelte, /on:keydown\|stopPropagation/);
  assert.match(svelte, /disabled=\{reordering \|\| idx === 0\}/);
});

test('en.json has program_detail move keys', () => {
  for (const k of ['move_up', 'move_down', 'move_day_up', 'move_day_down']) {
    assert.ok(en.program_detail?.[k] || JSON.stringify(en).includes(`"${k}"`), k);
  }
});
