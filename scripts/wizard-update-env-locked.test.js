import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/routes/Wizard.svelte', import.meta.url), 'utf8');
const upd = readFileSync(new URL('../src/lib/updates.js', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));

test('wizard reads envLocked and skips the PUT when locked', () => {
  assert.match(src, /getServerUpdateConfig/);
  assert.match(src, /updateEnvLocked = !!cfg\?\.envLocked/);
  assert.match(src, /async function _saveUpdateChoice\(\) \{\s*if \(updateEnvLocked\) return;/);
});

test('toggle is hidden when locked, with a translated note', () => {
  assert.match(src, /\{#if updateEnvLocked\}[\s\S]*wizard\.updates\.env_locked[\s\S]*\{:else\}[\s\S]*<Toggle[\s\S]*\{\/if\}/);
  assert.ok(en.wizard.updates.env_locked);
});

test('updates.js exports a config getter hitting GET /api/updates/config', () => {
  assert.match(upd, /export async function getServerUpdateConfig/);
  assert.match(upd, /apiUrl\('\/api\/updates\/config'\), \{ credentials/);
});
