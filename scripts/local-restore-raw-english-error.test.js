// Local restore failure toast is translated only; parser detail is logged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/components/settings/SettingsBackup.svelte', import.meta.url), 'utf8');

test('restore failure toast has no raw message, detail is logged', () => {
  const fn = ui.slice(ui.indexOf('async function confirmLocalRestore'), ui.indexOf('async function loadFullBackups'));
  assert.ok(!/restore_failed'\)\}: \$\{/.test(fn), 'no appended raw message');
  assert.ok(!fn.includes('e?.message'));
  assert.match(fn, /console\.warn\('\[local-backup\] restore failed:', e\)/);
  assert.match(fn, /showError\(e\?\.translated \|\| \$_\('settings_backup\.local\.restore_failed'\)\)/);
});
