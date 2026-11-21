/**
 * Programs page header: the Import + New actions must wrap under the title
 * instead of collapsing the h1 to 0px (320px) or "Progra" (390px).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../src/routes/Programs.svelte', import.meta.url), 'utf8');
const style = src.slice(src.indexOf('<style>'));

test('page header wraps', () => {
  assert.match(style, /\.page-header\s*\{[^}]*flex-wrap:\s*wrap/);
});

test('title keeps a width floor and does not shrink', () => {
  const m = style.match(/\.page-header h1\s*\{([^}]*)\}/);
  assert.ok(m, 'scoped h1 rule');
  assert.match(m[1], /min-width:\s*\d+ch/);
  assert.match(m[1], /flex:\s*1 0 auto/);
});
