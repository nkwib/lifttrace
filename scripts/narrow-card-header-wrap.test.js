import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL('../src/components/diary/' + p, import.meta.url), 'utf8');
const rule = (s, sel) => s.match(new RegExp('\\n\\s*' + sel.replace(/\./g, '\\.') + '\\s*\\{([^}]*)\\}'))?.[1] ?? '';

test('ExerciseCard header wraps actions below the name at 320px', () => {
  const s = rd('ExerciseCard.svelte');
  assert.match(rule(s, '.ex-header'), /flex-wrap:\s*wrap/);
  assert.match(rule(s, '.ex-info'), /flex:\s*1 1 140px/);
  assert.match(rule(s, '.ex-actions'), /flex-shrink:\s*0/);
});

test('SupersetCard header labels do not wrap', () => {
  const s = rd('SupersetCard.svelte');
  assert.match(rule(s, '.superset-header'), /flex-wrap:\s*wrap/);
  for (const c of ['.ss-label', '.ss-count', '.ss-progress']) assert.match(rule(s, c), /white-space:\s*nowrap/);
});
