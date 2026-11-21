// Safety snapshot before a Local restore includes uploads, and is pruned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backupsToPrune } from '../server/lib/backup-schedule.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('backupsToPrune keeps the newest N of one prefix only', () => {
  const P = 'lifttrace-backup-prerestore-';
  const files = [
    { name: `${P}2026-01-01T10-00-00+0000.json` },
    { name: `${P}2026-01-03T10-00-00+0000.json` },
    { name: `${P}2026-01-02T10-00-00+0000.json` },
    { name: 'lifttrace-backup-auto-2025-01-01T10-00-00+0000.json' },
    { name: `${P}2026-01-04T10-00-00+0000.json.tmp` },
  ];
  const del = backupsToPrune(files, P, 2).map(f => f.name);
  assert.deepEqual(del, [`${P}2026-01-01T10-00-00+0000.json`]);
});

test('restore snapshot keeps uploads, uses the safety prefix and prunes', () => {
  const ui = read('src/components/settings/SettingsBackup.svelte');
  const call = ui.match(/lb\.exportBackup\(\{[^}]*\}\)/)[0];
  assert.ok(!call.includes('includeUploads: false'));
  assert.ok(call.includes('prefix: lb.SAFETY_PREFIX'));
  assert.ok(ui.includes('lb.pruneSafetySnapshots('));
});
