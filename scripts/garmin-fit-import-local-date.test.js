import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { _toIsoDate } from '../server/lib/workout-import/garmin-fit.js';

const T = new Date('2026-03-10T02:30:00Z');

test('Date is dated in the user zone, not UTC', () => {
  assert.equal(_toIsoDate(T, 'America/Los_Angeles'), '2026-03-09');
  assert.equal(_toIsoDate(T, 'Asia/Tokyo'), '2026-03-10');
  assert.equal(_toIsoDate(T, 'UTC'), '2026-03-10');
});

test('epoch ms and seconds follow the zone too', () => {
  assert.equal(_toIsoDate(T.getTime(), 'America/Los_Angeles'), '2026-03-09');
  assert.equal(_toIsoDate(T.getTime() / 1000, 'America/Los_Angeles'), '2026-03-09');
});

test('DST edge: the offset changes across the spring-forward day', () => {
  // LA springs forward 2026-03-08 10:00Z (PST -8 to PDT -7).
  assert.equal(_toIsoDate(new Date('2026-03-08T07:30:00Z'), 'America/Los_Angeles'), '2026-03-07');
  assert.equal(_toIsoDate(new Date('2026-03-09T06:59:00Z'), 'America/Los_Angeles'), '2026-03-08');
  assert.equal(_toIsoDate(new Date('2026-03-09T07:00:00Z'), 'America/Los_Angeles'), '2026-03-09');
});

test('strings stay sliced', () => {
  assert.equal(_toIsoDate('2026-03-10T02:30:00Z', 'America/Los_Angeles'), '2026-03-10');
});

test('unset or invalid zone falls back to the server zone', () => {
  const local = _toIsoDate(T);
  assert.equal(_toIsoDate(T, undefined), local);
  assert.equal(_toIsoDate(T, 'Not/AZone'), local);
});

test('invalid Date falls back to today instead of throwing', () => {
  assert.match(_toIsoDate(new Date(NaN), 'Asia/Tokyo'), /^\d{4}-\d{2}-\d{2}$/);
});

test('preview and commit both pass the stored zone', () => {
  const r = readFileSync(new URL('../server/routes/workout-import.js', import.meta.url), 'utf8');
  assert.equal(r.match(/_parse\(source, req\.file\.buffer, userUnit, userZone\(userId\)\)/g).length, 2);
});
