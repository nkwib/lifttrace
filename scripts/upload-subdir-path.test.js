/**
 * Direct unit tests for resolveUploadSubdirPath (traversal guard used by the
 * exercise media routes). lib/upload-paths.js has no db.js import, so this
 * always runs, even without a better-sqlite3 binding. UPLOADS_PATH is set
 * before the import because the module reads it at load time.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-subdir-'));
process.env.UPLOADS_PATH = tmpRoot;

const { resolveUploadPath, resolveUploadSubdirPath, unlinkMediaFile } = await import('../server/lib/upload-paths.js');

const ex = (...p) => path.join(tmpRoot, 'exercises', ...p);

test('resolveUploadSubdirPath: legit paths resolve exactly inside the subdir', () => {
  assert.equal(resolveUploadSubdirPath('/uploads/exercises/a.jpg', 'exercises'), ex('a.jpg'));
  assert.equal(resolveUploadSubdirPath('/uploads/exercises/sub/a.jpg', 'exercises'), ex('sub', 'a.jpg'));
  assert.equal(resolveUploadSubdirPath('/uploads/exercises/a/b.jpg', 'exercises'), ex('a', 'b.jpg'));
  assert.equal(resolveUploadSubdirPath('/uploads/exercises/a b.jpg', 'exercises'), ex('a b.jpg'));
  // Dot segments that stay inside the subdir are fine.
  assert.equal(resolveUploadSubdirPath('/uploads/exercises/a/../b.jpg', 'exercises'), ex('b.jpg'));
});

test('resolveUploadSubdirPath: percent-encoded dots are not decoded, so stay inside', () => {
  assert.equal(resolveUploadSubdirPath('/uploads/exercises/..%2fkeep.jpg', 'exercises'), ex('..%2fkeep.jpg'));
});

test('resolveUploadSubdirPath: null for traversal out of the subdir', () => {
  for (const u of [
    '/uploads/exercises/../keep.jpg',
    '/uploads/exercises/../body-stats/x.jpg',
    '/uploads/exercises/a/../../b.jpg',
    '/uploads/exercises/../../etc/passwd',
  ]) assert.equal(resolveUploadSubdirPath(u, 'exercises'), null, u);
});

test('resolveUploadSubdirPath: null for the dir itself, siblings and other subdirs', () => {
  for (const u of [
    '/uploads/exercises/',
    '/uploads/exercises',
    '/uploads/exercises/.',
    '/uploads/exercisesX/a.jpg',
    '/uploads/body-stats/x.jpg',
    '/uploads/',
  ]) assert.equal(resolveUploadSubdirPath(u, 'exercises'), null, u);
  // Subdir given in a different case does not match the on-disk dir.
  assert.equal(resolveUploadSubdirPath('/uploads/exercises/a.jpg', 'Exercises'), null);
});

test('resolveUploadSubdirPath: null for NUL, non-strings and non-upload urls', () => {
  assert.equal(resolveUploadSubdirPath('/uploads/exercises/\0x.jpg', 'exercises'), null);
  assert.equal(resolveUploadSubdirPath('/uploads/exercises/a.jpg\0', 'exercises'), null);
  for (const v of [undefined, null, 42, {}, [], ['/uploads/exercises/a.jpg']]) {
    assert.equal(resolveUploadSubdirPath(v, 'exercises'), null);
  }
  assert.equal(resolveUploadSubdirPath('http://example.com/uploads/exercises/a.jpg', 'exercises'), null);
  assert.equal(resolveUploadSubdirPath('exercises/a.jpg', 'exercises'), null);
});

test('resolveUploadPath: stays within the uploads root', () => {
  assert.equal(resolveUploadPath('/uploads/x.jpg'), path.join(tmpRoot, 'x.jpg'));
  assert.equal(resolveUploadPath('/uploads/../x'), null);
  assert.equal(resolveUploadPath('http://example.com/uploads/x'), null);
});

test('unlinkMediaFile with subdir only deletes inside that subdir', () => {
  fs.mkdirSync(ex(), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, 'body-stats'), { recursive: true });
  const inside = ex('del.jpg');
  const outside = path.join(tmpRoot, 'body-stats', 'keep.jpg');
  fs.writeFileSync(inside, 'x');
  fs.writeFileSync(outside, 'x');
  assert.equal(unlinkMediaFile('/uploads/exercises/../body-stats/keep.jpg', 'exercises'), false);
  assert.equal(unlinkMediaFile('/uploads/body-stats/keep.jpg', 'exercises'), false);
  assert.ok(fs.existsSync(outside));
  assert.equal(unlinkMediaFile('/uploads/exercises/del.jpg', 'exercises'), true);
  assert.ok(!fs.existsSync(inside));
});
