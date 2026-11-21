import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../src/components/settings/SettingsUserManagement.svelte', import.meta.url), 'utf8');

test('session duration row wraps and controls can shrink', () => {
  assert.match(src, /class="setting-row session-row"/);
  assert.match(src, /\.session-row\s*\{\s*flex-wrap:\s*wrap/);
  assert.match(src, /\.session-controls\s*\{[^}]*min-width:\s*0/);
  assert.match(src, /\.session-controls :global\(\.form-select-sm\)\s*\{[^}]*min-width:\s*0/);
});
