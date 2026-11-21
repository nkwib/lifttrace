/**
 * Progress photo and set video URLs must be one plain file name inside their
 * own subdir. Pure helper tests (no db.js import) plus wiring greps.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.UPLOADS_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-media-url-'));
const { isUploadFileUrl } = await import('../server/lib/upload-paths.js');

test('isUploadFileUrl accepts generated names', () => {
  assert.equal(isUploadFileUrl('/uploads/body-stats/1700000000000-abcdef0123456789abcdef01.jpg', 'body-stats'), true);
  assert.equal(isUploadFileUrl('/uploads/set-videos/1700000000000-abcdef.webm', 'set-videos'), true);
});

test('isUploadFileUrl rejects traversal and encoded variants', () => {
  for (const [bad, sub] of [
    ['/uploads/body-stats/../backups/lifttrace-backup-1.zip', 'body-stats'],
    ['/uploads/body-stats/..', 'body-stats'],
    ['/uploads/body-stats/.', 'body-stats'],
    ['/uploads/body-stats/', 'body-stats'],
    ['/uploads/body-stats/a/b.jpg', 'body-stats'],
    ['/uploads/body-stats/..%2fbackups%2fx.zip', 'body-stats'],
    ['/uploads/body-stats/..\\x.jpg', 'body-stats'],
    ['/uploads/body-stats/a.jpg?x=1', 'body-stats'],
    ['/uploads/body-stats/a\0.jpg', 'body-stats'],
    ['/uploads/body-stats/.hidden', 'body-stats'],
    ['/uploads/set-videos/../body-stats/a.jpg', 'set-videos'],
    ['/uploads/backups/x.zip', 'body-stats'],
    ['/uploads/body-stats/a.jpg', 'set-videos'],
    [null, 'body-stats'],
  ]) assert.equal(isUploadFileUrl(bad, sub), false, String(bad));
});

test('helpers, file routes, unlinks and sync insert are wired', () => {
  const rd = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(rd('server/lib/body-stat-media.js'), /isUploadFileUrl\(url, PHOTO_SUBDIR\)/);
  assert.match(rd('server/lib/body-stat-media.js'), /resolveUploadSubdirPath\(row\.url, PHOTO_SUBDIR\)/);
  assert.match(rd('server/lib/set-media.js'), /isUploadFileUrl\(url, VIDEO_SUBDIR\)/);
  assert.match(rd('server/lib/set-media.js'), /resolveUploadSubdirPath\(row\.url, VIDEO_SUBDIR\)/);
  assert.match(rd('server/routes/sync.js'), /isLocalPhotoUrl\(url\) \|\| \/\^https\?/);
  for (const f of ['server/lib/body-stat-media.js', 'server/lib/set-media.js', 'server/routes/body-stats.js', 'server/routes/set-media.js']) {
    assert.doesNotMatch(rd(f), /unlinkMediaFile\((?:r|row)\.url\)/, f);
  }
});
