import assert from 'node:assert/strict';
import test from 'node:test';

import { safeJson, todayLocal, daysAgoLocal, toolError, toolResult, validateDate, validateDateRange, resolveDateRange, DATE_RE } from '../server/lib/mcp/_util.js';

test('safeJson parses valid JSON', () => {
  assert.deepEqual(safeJson('{"a":1}', {}), { a: 1 });
});

test('safeJson returns fallback on invalid JSON', () => {
  assert.deepEqual(safeJson('not json', { x: 1 }), { x: 1 });
});

test('safeJson returns fallback on JSON null (not bare null)', () => {
  assert.deepEqual(safeJson('null', { x: 1 }), { x: 1 });
});

test('safeJson passes through falsy-but-real values unchanged', () => {
  assert.equal(safeJson('false', 'fallback'), false);
  assert.equal(safeJson('0', 'fallback'), 0);
  assert.equal(safeJson('""', 'fallback'), '');
});

test('todayLocal returns YYYY-MM-DD matching DATE_RE', () => {
  assert.match(todayLocal(), DATE_RE);
});

test('daysAgoLocal(0) equals todayLocal()', () => {
  assert.equal(daysAgoLocal(0), todayLocal());
});

test('daysAgoLocal(N) returns a valid YYYY-MM-DD string', () => {
  assert.match(daysAgoLocal(90), DATE_RE);
});

test('toolError sets isError and carries the message as text content', () => {
  const r = toolError('bad input');
  assert.equal(r.isError, true);
  assert.equal(r.content[0].text, 'bad input');
});

test('toolResult carries both text and structuredContent', () => {
  const payload = { ok: true, n: 3 };
  const r = toolResult(payload);
  assert.deepEqual(r.structuredContent, payload);
  assert.deepEqual(JSON.parse(r.content[0].text), payload);
  assert.equal(r.isError, undefined);
});

test('validateDate accepts YYYY-MM-DD and rejects everything else', () => {
  assert.equal(validateDate('2026-09-04'), '2026-09-04');
  assert.equal(validateDate('09/04/2026'), null);
  assert.equal(validateDate('2026-9-4'), null);
  assert.equal(validateDate(''), null);
  assert.equal(validateDate(undefined), null);
});

test('validateDateRange accepts arbitrary ordered ranges and rejects reversed ranges', () => {
  assert.equal(validateDateRange('2000-01-01', '2099-12-31'), null);
  assert.equal(validateDateRange('2024-02-29', '2024-03-01'), null);
  assert.match(validateDateRange('2026-02-31', '2026-03-01'), /YYYY-MM-DD/i);
  assert.match(validateDateRange('2026-09-02', '2026-09-01'), /on or before/i);
  assert.match(validateDateRange('not-a-date', '2026-09-01'), /YYYY-MM-DD/i);
});

test('validateDateRange accepts open sides and rejects invalid supplied bounds', () => {
  assert.equal(validateDateRange(null, '2020-01-02'), null);
  assert.equal(validateDateRange('2020-01-02', null), null);
  assert.match(validateDateRange(null, '2026-02-31'), /YYYY-MM-DD/i);
});

test('resolveDateRange leaves the other side open when one bound is given', () => {
  // A start on its own reads forward, planned sessions included, rather
  // than stopping at today, which is what the tool descriptions promise.
  assert.equal(resolveDateRange('2020-01-02', null).start, '2020-01-02');
  assert.equal(resolveDateRange('2020-01-02', null).end, null);
  assert.equal(resolveDateRange(null, '2020-01-02').start, null);
  assert.equal(resolveDateRange(null, '2020-01-02').end, '2020-01-02');
});

test('resolveDateRange falls back to a window only when neither bound is given', () => {
  const both = resolveDateRange(null, null);
  assert.equal(both.end, todayLocal());
  assert.match(both.start, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(both.start < both.end, 'the window reaches back, it is not a single day');
});

import { isCalendarDate, assertDate } from '../server/lib/mcp/_util.js';
import { getWorkoutCore } from '../server/lib/mcp/tools/get-workout.js';
import { logSetCore } from '../server/lib/mcp/tools/log-set.js';
import { listProgressPhotosCore } from '../server/lib/mcp/tools/list-progress-photos.js';

test('isCalendarDate rejects impossible dates and non-strings', () => {
  for (const v of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', ['2026-01-01'], 20260101, null]) {
    assert.equal(isCalendarDate(v), false, String(v));
  }
  assert.equal(isCalendarDate('2024-02-29'), true);
});

test('assertDate throws a readable error for bad input', () => {
  assert.throws(() => assertDate('2026-02-30'), /Invalid date '2026-02-30'/);
  assert.throws(() => assertDate(['2026-01-01'], 'start'), /Invalid start/);
  assert.doesNotThrow(() => assertDate('2024-02-29'));
});

test('cores reject impossible dates before touching the db', () => {
  assert.throws(() => getWorkoutCore(1, { date: '2026-02-31' }), /Invalid date/);
  assert.throws(() => getWorkoutCore(1, { date: ['2026-01-01'] }), /Invalid date/);
  assert.throws(() => logSetCore(1, { date: '2026-02-30' }), /Invalid date/);
  assert.throws(() => listProgressPhotosCore(1, { start: '2026-99-99' }), /Invalid start/);
});
