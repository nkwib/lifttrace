import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/App.svelte'), 'utf8');

test('Trace is not statically imported', () => {
  assert.doesNotMatch(app, /^\s*import\s+Trace\s+from/m);
});

test('Trace chunk loads only once AI is effectively enabled', () => {
  assert.match(app, /\$:\s*if\s*\(\$aiEffectivelyEnabled\s*&&\s*!TraceComp\)\s*import\('\.\/components\/ai\/Trace\.svelte'\)/);
});

test('Trace renders conditionally and is never unmounted on disable', () => {
  assert.match(app, /\{#if TraceComp\}<svelte:component this=\{TraceComp\} \/>\{\/if\}/);
});
