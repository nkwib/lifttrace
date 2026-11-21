/**
 * /exercise/:id (singular) has no tab of its own and used to fall through to
 * index 0, highlighting Diary. It must map onto the Exercises tab.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/components/layout/BottomNav.svelte', import.meta.url), 'utf8');

test('BottomNav maps /exercise/ detail routes onto /exercises', () => {
  assert.match(SRC, /startsWith\('\/exercise\/'\)\)\s*normalized\s*=\s*'\/exercises'/);
});

test('route remap sits before the exact-match lookup', () => {
  const remap = SRC.indexOf("startsWith('/exercise/')");
  const exact = SRC.indexOf('TABS.findIndex(t => t.path === normalized)');
  assert.ok(remap > 0 && exact > remap);
});
