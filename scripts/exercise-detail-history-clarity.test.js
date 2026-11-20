import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fmtHistorySet, historyHasRepSets, exerciseWeightPr } from '../src/lib/history-set.js';

test('rep set: w×r', () => {
  assert.equal(fmtHistorySet({ weight: 60, reps: 5, completed: true }, {}, {}), '60×5');
});
test('split reps on any load type', () => {
  assert.equal(fmtHistorySet({ weight: 30, reps: 10, reps_l: 5, reps_r: 5 }, {}, {}), '30×5+5');
  assert.equal(fmtHistorySet({ weight: 30, reps_l: 6 }, {}, {}), '30×6+');
});
test('timed and distance keep their own unit', () => {
  const t = fmtHistorySet({ weight: 0, duration_sec: 60, completed: true }, { set_type: 'time' }, {});
  assert.match(t, /1:00/);
  const d = fmtHistorySet({ distance_m: 500, completed: true }, { set_type: 'distance' }, { imperial: false });
  assert.match(d, /500/);
  assert.ok(!historyHasRepSets({ set_type: 'time', sets: [{ completed: true, duration_sec: 60 }] }));
  assert.ok(historyHasRepSets({ sets: [{ completed: true, weight: 1, reps: 1 }] }));
});
test('wiring: warm-up marker, show all', () => {
  const info = readFileSync('src/components/exercises/ExerciseInfo.svelte', 'utf8');
  const det = readFileSync('src/routes/ExerciseDetail.svelte', 'utf8');
  assert.match(info, /warmup_short/);
  assert.match(info, /show_all/);
  assert.match(det, /exerciseWeightPr/);
});
test('exerciseWeightPr: warm-ups excluded, tie to highest reps, e1RM range', () => {
  const e = (v, u) => `${v} ${u}`;
  const hist = [
    { date: 'd1', sets: [{ completed: true, warmup: true, weight: 200, reps: 5 }, { completed: true, weight: 100, reps: 3 }] },
    { date: 'd2', sets: [{ completed: true, weight: 100, reps: 5 }, { completed: false, weight: 150, reps: 1 }] },
  ];
  const pr = exerciseWeightPr(hist, 'kg', e);
  assert.equal(pr.weight, 100);
  assert.equal(pr.reps, 5);
  assert.equal(pr.date, 'd2');
  assert.equal(pr.label, '100 kg × 5');
  assert.ok(pr.sub);
  assert.equal(exerciseWeightPr([{ date: 'x', sets: [{ completed: true, weight: 100, reps: 1 }] }], 'kg', e).sub, undefined);
  assert.equal(exerciseWeightPr([{ date: 'x', sets: [{ completed: true, weight: 100, reps: 13 }] }], 'kg', e).sub, undefined);
  assert.equal(exerciseWeightPr([{ date: 'x', sets: [{ completed: true, warmup: true, weight: 100, reps: 5 }] }], 'kg', e), null);
  assert.equal(exerciseWeightPr(null, 'kg', e), null);
});
