import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const fb = src('../server/routes/full-backup.js');
const sch = src('../server/lib/scheduler.js');

// Extract the real pure helper from source so its logic is what is tested.
const m = fb.match(/export const BACKUP_RETRY_BACKOFF_MS[^\n]*\n[\s\S]*?\n}\n/);
const { backupRetryAllowed } = new Function(`${m[0].replace(/export /g, '')}; return { backupRetryAllowed };`)();

const now = Date.parse('2026-01-01T12:00:00Z');
test('backupRetryAllowed', () => {
  assert.equal(backupRetryAllowed(new Date(now - (6 * 60 - 1) * 60000).toISOString(), now), false);
  assert.equal(backupRetryAllowed(new Date(now - 6 * 3600000).toISOString(), now), true);
  assert.equal(backupRetryAllowed('', now), true);
  assert.equal(backupRetryAllowed(null, now), true);
  assert.equal(backupRetryAllowed('garbage', now), true);
});

test('wiring: error_at recorded, cleared, gated, partial zip removed', () => {
  assert.match(fb, /_setCfg\('backup_last_auto_error_at', new Date\(\)\.toISOString\(\)\)/);
  assert.match(fb, /_setCfg\('backup_last_auto_error_at', ''\)/);
  assert.match(fb, /firstOfStreak/);
  assert.match(fb, /fs\.rmSync\(destPath, \{ force: true \}\)/);
  assert.match(sch, /scheduledBackupRetryAllowed\(\)/);
});

test('wiring: a saved schedule change clears the backoff but keeps the error text', () => {
  const body = fb.match(/export function setScheduleConfig[\s\S]*?\n}\n/)[0];
  const clear = body.indexOf("writes.push(['backup_last_auto_error_at', ''])");
  assert.ok(clear > 0);
  assert.ok(clear > body.indexOf('must be 1-99'), 'after validation');
  assert.ok(clear < body.indexOf('db.transaction'), 'inside the same write batch');
  assert.ok(clear > body.indexOf('ENV_LOCKED'), 'not on the env-locked path');
  assert.doesNotMatch(body, /'backup_last_auto_error', ''/);
});
