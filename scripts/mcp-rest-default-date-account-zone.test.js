/**
 * MCP and REST v1 tools default "today" to the account's zone (the one its
 * app said last, user-zone.js), not the server's. Temporary SQLite database,
 * cores called directly. Kiritimati (UTC+14) and Pago_Pago (UTC-11) never
 * share a date, so at any hour one of them differs from UTC.
 */
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP_DB = path.join(os.tmpdir(), `mcp-zone-default-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TMP_DB;
process.env.NODE_ENV = 'test';

let db, util, bodyStat, logBody, workoutCore, photos, addPhoto;
try {
  ({ default: db } = await import('../server/db.js'));
  util = await import('../server/lib/mcp/_util.js');
  bodyStat = await import('../server/lib/mcp/tools/get-body-stat.js');
  logBody = await import('../server/lib/mcp/tools/log-body-stat.js');
  workoutCore = await import('../server/lib/mcp/tools/get-workout.js');
  photos = await import('../server/lib/mcp/tools/list-progress-photos.js');
  addPhoto = await import('../server/lib/mcp/tools/add-progress-photo.js');
} catch (e) {
  test('account-zone default dates skipped (native module unavailable)', { skip: true }, () => {});
  console.warn(`[zone-default] skipping: ${(e?.message || e).split('\n')[0]}`);
  process.exit(0);
}

const AHEAD = 'Pacific/Kiritimati', BEHIND = 'Pacific/Pago_Pago';
const dayIn = (zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
const mkUser = (name, zone) => {
  const id = db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, 'x', 'member')").run(name).lastInsertRowid;
  if (zone) db.prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'timezone', ?)").run(id, JSON.stringify(zone));
  return Number(id);
};

let ahead, behind, plain;
before(() => { ahead = mkUser('zd-ahead', AHEAD); behind = mkUser('zd-behind', BEHIND); plain = mkUser('zd-plain', null); });
after(() => { try { db.close(); } catch { /* ignore */ } for (const s of ['', '-wal', '-shm']) fs.rmSync(TMP_DB + s, { force: true }); });

test('todayFor uses the stored zone at a fixed instant', () => {
  const now = Date.parse('2026-03-10T23:30:00Z');
  assert.equal(util.todayFor(ahead, now), '2026-03-11');
  assert.equal(util.todayFor(behind, now), '2026-03-10');
  const la = mkUser('zd-la', 'America/Los_Angeles');
  const nz = mkUser('zd-nz', 'Pacific/Auckland');
  assert.equal(util.todayFor(la, Date.parse('2026-03-11T03:00:00Z')), '2026-03-10');
  assert.equal(util.todayFor(nz, Date.parse('2026-03-10T12:00:00Z')), '2026-03-11');
});

test('todayFor falls back to the server zone for no account or no stored zone', () => {
  const now = Date.parse('2026-03-10T23:30:00Z');
  assert.equal(util.todayFor(null, now), util.todayFor(plain, now));
  assert.match(util.todayFor(null), util.DATE_RE);
  assert.equal(util.todayFor(null), util.todayLocal());
});

test('daysAgoFor shifts the account day by calendar days, across month ends', () => {
  const now = Date.parse('2026-03-01T10:00:00Z'); // 03-01 in UTC, 03-02 ahead
  assert.equal(util.daysAgoFor(ahead, 0, now), '2026-03-02');
  assert.equal(util.daysAgoFor(ahead, 2, now), '2026-02-28');
  assert.equal(util.daysAgoFor(behind, 1, now), '2026-02-27');
});

test('resolveDateRange: account window when userId given, unchanged without', () => {
  const now = Date.parse('2026-03-10T23:30:00Z');
  assert.deepEqual(util.resolveDateRange(null, null, 90, ahead, now), { start: util.daysAgoFor(ahead, 90, now), end: '2026-03-11' });
  assert.equal(util.resolveDateRange(null, null, 7, behind, now).end, '2026-03-10');
  assert.equal(util.resolveDateRange(null, null).end, util.todayLocal());
  assert.deepEqual(util.resolveDateRange('2020-01-02', null, 90, ahead), { start: '2020-01-02', end: null });
});

test('log_body_stat and get_body_stat default to the account day', () => {
  for (const [id, zone] of [[ahead, AHEAD], [behind, BEHIND]]) {
    logBody.logBodyStatCore(id, { weight: 70 });
    assert.ok(db.prepare('SELECT 1 FROM body_stats_log WHERE user_id = ? AND date = ?').get(id, dayIn(zone)), zone);
    assert.equal(bodyStat.getBodyStatCore(id, {}).date, dayIn(zone));
  }
});

test('add_progress_photo and list_progress_photos default to the account day', () => {
  addPhoto.addProgressPhotoCore(behind, { url: '/uploads/body-stats/a.jpg' });
  assert.equal(db.prepare('SELECT date FROM body_stat_media WHERE user_id = ?').get(behind).date, dayIn(BEHIND));
  assert.doesNotThrow(() => photos.listProgressPhotosCore(null, {}));
  assert.doesNotThrow(() => photos.listProgressPhotosCore(behind, {}));
});

test('get_workout with no date works for an account and for a null userId', () => {
  assert.doesNotThrow(() => workoutCore.getWorkoutCore(ahead, {}));
  assert.doesNotThrow(() => workoutCore.getWorkoutCore(null, {}));
});
