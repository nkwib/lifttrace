// Wiring: Android Local backup list / back up now / share / restore UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const ui = read('src/components/settings/SettingsBackup.svelte');
const lib = read('src/lib/local-backup.js');
const sched = read('src/lib/local-backup-scheduler.js');
const en = JSON.parse(read('src/i18n/en.json'));

test('SettingsBackup wires the local backup helpers behind _isNativeLocal', () => {
  for (const fn of ['importBackup', 'listLocalBackups', 'readBackupFile', 'deleteLocalBackup', 'shareLocalBackup', 'runLocalBackupNow']) {
    assert.ok(ui.includes(fn), fn);
  }
  assert.match(ui, /\{#if _isNativeLocal\}/);
  assert.ok(!/^\s*import .*local-backup/m.test(ui), 'local-backup stays a dynamic import');
  assert.match(ui, /application\/json/);
});

test('list/read/delete use the Documents dir the scheduler writes', () => {
  assert.match(sched, /BACKUP_DIR\s*=\s*'lifttrace-backups'/);
  assert.match(lib, /BACKUP_DIR\s*=\s*'lifttrace-backups'/);
  const tail = lib.slice(lib.indexOf('export async function listLocalBackups'));
  assert.ok(!tail.includes('Directory.Data'));
  assert.ok(tail.includes('Directory.Documents'));
});

test('runLocalBackupNow reports ok/error/busy', () => {
  assert.match(sched, /busy: true/);
  assert.match(sched, /return \{ ok: false, error: msg \}/);
});

test('en.json has the local keys used by the UI', () => {
  const keys = [...ui.matchAll(/settings_backup\.local\.([a-z_]+)/g)].map(m => m[1]);
  assert.ok(keys.length);
  for (const k of keys) assert.ok(en.settings_backup.local[k], k);
});
