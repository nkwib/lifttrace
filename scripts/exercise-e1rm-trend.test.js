import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sessionE1rms } from '../src/lib/history-set.js';

const set = (weight, reps, extra = {}) => ({ weight, reps, completed: true, ...extra });

test('best e1RM per session, oldest first, 1 decimal', () => {
  const history = [
    { date: '2026-02-01', sets: [set(100, 5), set(110, 3)] },
    { date: '2026-01-01', sets: [set(100, 1), set(60, 10)] },
  ];
  const r = sessionE1rms(history);
  assert.deepEqual(r.map(p => p.date), ['2026-01-01', '2026-02-01']);
  assert.equal(r[0].e1rm, 100);
  assert.equal(r[1].e1rm, Math.max(Math.round(100 * (1 + 5 / 30) * 10) / 10, Math.round(110 * (1 + 3 / 30) * 10) / 10));
});

test('max estimate wins over heaviest set', () => {
  const r = sessionE1rms([{ date: 'd', sets: [set(100, 10), set(110, 1)] }]);
  assert.equal(r[0].e1rm, 133);
});

test('warm-ups, incomplete, 13+ reps, no weight skipped', () => {
  const history = [{ date: 'd', sets: [
    set(200, 5, { warmup: true }), set(200, 5, { completed: false }),
    set(50, 13), set(0, 10),
  ] }];
  assert.deepEqual(sessionE1rms(history), []);
  assert.deepEqual(sessionE1rms([{ date: 'd', sets: [set(50, 13), set(50, 10)] }]), [{ date: 'd', e1rm: 67 }]);
});

test('timed sets skipped; empty input', () => {
  assert.deepEqual(sessionE1rms([{ date: 'd', sets: [{ duration_sec: 60, completed: true }] }]), []);
  assert.deepEqual(sessionE1rms([]), []);
  assert.deepEqual(sessionE1rms(null), []);
});

test('ExerciseDetail wires the toggle and keys exist', () => {
  const src = fs.readFileSync(new URL('../src/routes/ExerciseDetail.svelte', import.meta.url), 'utf8');
  assert.match(src, /sessionE1rms/);
  assert.match(src, /aria-pressed/);
  assert.match(src, /canE1rm/);
  const en = JSON.parse(fs.readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8')).exercise_detail;
  for (const k of ['e1rm_over_time', 'chart_mode', 'mode_top_set', 'mode_e1rm', 'e1rm_hint']) {
    assert.ok(en[k], k);
    assert.ok(src.includes(`exercise_detail.${k}`), k);
  }
});
