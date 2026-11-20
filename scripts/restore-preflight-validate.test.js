import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { checkBackupArchive } from '../server/lib/backup-validate.js';
const AdmZip = createRequire(new URL('../server/package.json', import.meta.url))('adm-zip');

const zipOf = (files) => {
  const z = new AdmZip();
  for (const [n, c] of Object.entries(files)) z.addFile(n, Buffer.from(c));
  return z;
};
const rejects400 = (z, re, opts) =>
  assert.throws(() => checkBackupArchive(z, opts), (e) => e.status === 400 && re.test(e.message));

test('missing database.json is a 400', () => {
  rejects400(zipOf({ 'images/a.png': 'x' }), /missing/);
});
test('garbage JSON is a 400 without the parser message', () => {
  rejects400(zipOf({ 'database.json': '{nope' }), /not valid JSON\.$/);
});
test('{}, null, arrays and other apps dumps are a 400', () => {
  for (const body of ['{}', 'null', '[]', '{"users":[]}', '{"users":{},"workout_log":[]}'])
    rejects400(zipOf({ 'database.json': body }), /not a LiftTrace backup/);
});
test('valid dump is accepted, empty users allowed', () => {
  const data = checkBackupArchive(zipOf({ 'database.json': '{"users":[],"workout_log":[]}' }));
  assert.deepEqual(data.users, []);
});
test('entry count and size limits trip', () => {
  const z = zipOf({ 'database.json': '{"users":[],"workout_log":[]}', 'images/a': 'abcd' });
  rejects400(z, /too many entries/, { maxEntries: 1 });
  rejects400(z, /uncompressed size/, { maxBytes: 3 });
});
