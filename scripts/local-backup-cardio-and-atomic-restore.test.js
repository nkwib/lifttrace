import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/local-backup.js', import.meta.url), 'utf8');
const tables = src.match(/const TABLES = \[([\s\S]*?)\];/)[1];
const imp = src.slice(src.indexOf('export async function importBackup'), src.indexOf('export async function listLocalBackups'));

test('backup includes cardio_log', () => assert.match(tables, /'cardio_log'/));
test('restore runs in one dbExec transaction, no swallowed errors', () => {
  assert.match(imp, /await dbExec\(stmts\)/);
  assert.doesNotMatch(imp, /dbRun/);
});
test('restore validates shape and filters columns by PRAGMA table_info', () => {
  assert.match(imp, /is not a list/);
  assert.match(imp, /PRAGMA table_info/);
  assert.match(imp, /real\.has\(c\)/);
});
test('uploads are written after the DB commit', () => {
  assert.ok(imp.indexOf('dbExec(stmts)') < imp.indexOf('writeFile'));
});
