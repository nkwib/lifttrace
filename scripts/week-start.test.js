/**
 * Week start setting (weekStartsOn: monday | sunday). One rule in
 * src/lib/week-start.js for the server, the phone's copy and Statistics.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const { weekStart, normalizeWeekStart, weekdayOrder } = await import('../src/lib/week-start.js');
const { weekStartOf, trainedDaysByWeek } = await import('../src/lib/trained-day.js');

const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

test('every weekday of a week lands on its Monday or its Sunday', () => {
  // Sun Oct 11 .. Sat Oct 17 2026 (Monday Oct 12, Sunday Oct 11 or 18).
  const mon = { '2026-10-11': '2026-10-05', '2026-10-12': '2026-10-12', '2026-10-13': '2026-10-12', '2026-10-14': '2026-10-12', '2026-10-15': '2026-10-12', '2026-10-16': '2026-10-12', '2026-10-17': '2026-10-12' };
  const sun = { '2026-10-11': '2026-10-11', '2026-10-12': '2026-10-11', '2026-10-13': '2026-10-11', '2026-10-14': '2026-10-11', '2026-10-15': '2026-10-11', '2026-10-16': '2026-10-11', '2026-10-17': '2026-10-11' };
  for (const [d, w] of Object.entries(mon)) {
    assert.equal(weekStart(d, 'monday'), w, `${d} monday`);
    assert.equal(weekStart(d), w, `${d} default is Monday`);
  }
  for (const [d, w] of Object.entries(sun)) assert.equal(weekStart(d, 'sunday'), w, `${d} sunday`);
  assert.equal(weekStart('2026-10-18', 'sunday'), '2026-10-18');
  assert.equal(weekStart('2026-10-18', 'monday'), '2026-10-12');
});

test('weeks cross month and year boundaries and leap days', () => {
  assert.equal(weekStart('2026-01-01', 'monday'), '2025-12-29');   // Thursday
  assert.equal(weekStart('2026-01-01', 'sunday'), '2025-12-28');
  assert.equal(weekStart('2027-01-03', 'sunday'), '2027-01-03');   // a Sunday
  assert.equal(weekStart('2027-01-03', 'monday'), '2026-12-28');
  assert.equal(weekStart('2028-03-01', 'monday'), '2028-02-28');   // after a leap day
  assert.equal(weekStart('2028-03-01', 'sunday'), '2028-02-27');
  assert.equal(weekStart('2026-03-01', 'sunday'), '2026-03-01');
  assert.equal(weekStart('2026-10-19T07:30', 'sunday'), '2026-10-18', 'a time on the date counts by its day');
});

test('every date of two years falls in a 7 day week that starts on the right weekday', () => {
  for (const startsOn of ['monday', 'sunday']) {
    for (let i = 0; i < 730; i++) {
      const d = addDays('2026-01-01', i);
      const w = weekStart(d, startsOn);
      const back = (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${w}T00:00:00Z`)) / 86400000;
      assert.ok(back >= 0 && back <= 6, `${d} ${startsOn}`);
      assert.equal(new Date(`${w}T00:00:00Z`).getUTCDay(), startsOn === 'sunday' ? 0 : 1, `${d} ${startsOn}`);
    }
  }
});

test('a missing or invalid value is Monday', () => {
  for (const v of [undefined, null, '', 'tuesday', 'SUNDAY', 1, {}]) {
    assert.equal(normalizeWeekStart(v), 'monday');
    assert.equal(weekStart('2026-10-14', v), '2026-10-12');
  }
  assert.equal(normalizeWeekStart('sunday'), 'sunday');
});

test('weekday bars start on the week start', () => {
  assert.deepEqual(weekdayOrder('monday'), [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(weekdayOrder('sunday'), [0, 1, 2, 3, 4, 5, 6]);
});

test('trained-day weeks follow the setting, Monday by default', () => {
  assert.equal(weekStartOf('2026-10-18'), '2026-10-12');
  assert.equal(weekStartOf('2026-10-18', 'sunday'), '2026-10-18');
  const days = new Set(['2026-10-17', '2026-10-18', '2026-10-19']);
  assert.deepEqual(trainedDaysByWeek(days, '2026-10-01', '2026-10-31'), [{ week: '2026-10-12', count: 2 }, { week: '2026-10-19', count: 1 }]);
  assert.deepEqual(trainedDaysByWeek(days, '2026-10-01', '2026-10-31', 'sunday'), [{ week: '2026-10-11', count: 1 }, { week: '2026-10-18', count: 2 }]);
});

test("the phone's Stats and Cardio read the setting and bucket by it, both settings", async () => {
  const native = read('../src/lib/api-native.js');
  const section = (obj, name, async = true) => {
    const from = native.indexOf(`  ${async ? 'async ' : ''}${name}(`, native.indexOf(`const ${obj} = {`));
    return native.slice(from, native.indexOf('\n  },\n', from) + 4);
  };
  const statsHelpers = (() => {
    const s = native.indexOf('  _weekStart(date, startsOn)', native.indexOf('const Stats = {'));
    return native.slice(s, native.indexOf('\n  },\n', native.indexOf('  async _startsOn(', s)) + 4);
  })();
  const rows = [['2026-10-11', 10], ['2026-10-12', 20], ['2026-10-18', 30], ['2026-10-19', 40]].map(([date, duration_min]) => ({ date, duration_min }));
  const run = async (stored) => {
    const dbQuery = async (sql) => (/user_settings/.test(sql) ? (stored === undefined ? [] : [{ value: stored }]) : rows);
    const ME = 1;
    const _parseJson = (s, f) => { try { return JSON.parse(s); } catch { return f; } };
    const Stats = new Function('weekStart', 'normalizeWeekStart', 'dbQuery', 'ME', '_parseJson',
      `return {\n${statsHelpers}\n};`)(weekStart, normalizeWeekStart, dbQuery, ME, _parseJson);
    const Cardio = new Function('Stats', 'dbQuery', 'ME', `return {\n${section('Cardio', 'weekly')}\n};`)(Stats, dbQuery, ME);
    return Cardio.weekly('2026-10-01', '2026-10-31');
  };
  const monday = [{ week: '2026-10-05', minutes: 10 }, { week: '2026-10-12', minutes: 50 }, { week: '2026-10-19', minutes: 40 }];
  const sunday = [{ week: '2026-10-11', minutes: 30 }, { week: '2026-10-18', minutes: 70 }];
  assert.deepEqual(await run(undefined), monday);
  assert.deepEqual(await run('"monday"'), monday);
  assert.deepEqual(await run('"sunday"'), sunday);
  assert.deepEqual(await run('"weird"'), monday);
});

let ready = false;
try { createRequire(new URL('../server/package.json', import.meta.url))('better-sqlite3'); ready = true; } catch { /* server packages missing: skip */ }

test("the server reads each user's setting, Monday when unset or invalid", { skip: !ready && 'server packages missing' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lt-weekstart-'));
  process.env.DB_PATH = join(dir, 'lt.db');
  process.env.UPLOADS_PATH = join(dir, 'uploads');
  process.env.BACKUPS_PATH = join(dir, 'backups');
  try {
    const { default: db } = await import('../server/db.js');
    const { userWeekStart } = await import('../server/lib/week-start-pref.js');
    for (const id of [101, 102, 103, 104]) {
      db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(id, `u${id}`, 'x');
    }
    const put = db.prepare('INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)');
    put.run(101, 'weekStartsOn', JSON.stringify('sunday'));
    put.run(102, 'weekStartsOn', JSON.stringify('monday'));
    put.run(103, 'weekStartsOn', JSON.stringify('tuesday'));
    assert.equal(userWeekStart(101), 'sunday');
    assert.equal(userWeekStart(102), 'monday');
    assert.equal(userWeekStart(103), 'monday');
    assert.equal(userWeekStart(104), 'monday');
    assert.equal(userWeekStart(null), 'monday');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every weekly bucket and the setting are wired to the one rule', () => {
  const stats = read('../server/routes/stats.js');
  const cardio = read('../server/routes/cardio.js');
  assert.match(stats, /userWeekStart\(uid\(req\)\)/);
  assert.match(stats, /trainedDaysByWeek\(days, start, end, userWeekStart/);
  assert.match(cardio, /userWeekStart\(userId\)/);
  assert.match(read('../server/routes/settings.js'), /key === 'weekStartsOn' && !WEEK_STARTS\.includes\(value\)/);
  assert.match(read('../src/stores/settings.js'), /'dateFormat', 'timeFormat', 'weekStartsOn'/);
  assert.match(read('../src/components/settings/SettingsUnits.svelte'), /bind:value=\{\$weekStartsOn\}/);
  const page = read('../src/routes/Statistics.svelte');
  assert.equal([...page.matchAll(/weekStartOf\(.*\$weekStartsOn\)/g)].length, 2, 'Statistics passes the setting to weekStartOf');
  assert.match(read('../Dockerfile'), /COPY src\/lib\/week-start\.js \/src\/lib\/week-start\.js/);
  // The Monday maths lives only in week-start.js.
  for (const f of ['../src/lib/trained-day.js', '../server/routes/stats.js', '../server/routes/cardio.js', '../src/lib/api-native.js']) {
    assert.doesNotMatch(read(f), /day === 0 \? 6 : day - 1/, f);
  }
});
