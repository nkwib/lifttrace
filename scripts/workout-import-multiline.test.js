// Quoted CSV fields may hold newlines (Hevy descriptions, Strong notes).
// The old line-split reader tore those rows apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as srv from '../server/lib/workout-import/common.js';
import * as app from '../src/lib/workout-import/common.js';
import { parseHevy as hevyS } from '../server/lib/workout-import/hevy.js';
import { parseHevy as hevyA } from '../src/lib/workout-import/hevy.js';
import { parseStrong as strongS } from '../server/lib/workout-import/strong.js';
import { parseStrong as strongA } from '../src/lib/workout-import/strong.js';
import { parseJefit as jefitS } from '../server/lib/workout-import/jefit.js';
import { parseJefit as jefitA } from '../src/lib/workout-import/jefit.js';
import { parseFitnotes as fnS } from '../server/lib/workout-import/fitnotes.js';
import { parseFitnotes as fnA } from '../src/lib/workout-import/fitnotes.js';

const HEVY_H = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe';
const hevyRow = (i, w, r) => `"Push ""A""","01 Aug 2024, 18:23","01 Aug 2024, 19:23","line one\nline two, with comma",Bench Press,,,${i},normal,${w},${r},,,`;
const STRONG_H = 'Date;Workout Name;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE;Weight Unit';
const JEFIT_H = 'Log Date,Routine,Exercise,Set,Weight,Weight Unit,Reps,Notes';
const FN_H = 'Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time,Comment';

for (const [label, c, hevy, strong, jefit, fn] of [
  ['server', srv, hevyS, strongS, jefitS, fnS],
  ['app', app, hevyA, strongA, jefitA, fnA],
]) {
  for (const nl of ['\n', '\r\n']) {
    const tag = nl === '\n' ? 'LF' : 'CRLF';
    test(`${label}: Hevy multi-line description keeps sets (${tag})`, () => {
      const csv = [HEVY_H, hevyRow(1, 100, 5), hevyRow(2, 102.5, 4)].join(nl);
      const ws = hevy(csv, 'kg');
      assert.equal(ws.length, 1);
      assert.equal(ws[0].name, 'Push "A"');
      assert.deepEqual(ws[0].exercises[0].sets.map(s => [s.reps, s.weight]), [[5, 100], [4, 102.5]]);
    });
    test(`${label}: Strong note with newline keeps Weight Unit (${tag})`, () => {
      const csv = [STRONG_H, '2024-08-01 18:23:30;Push;Bench Press (Barbell);1;100;5;0;0;"felt\ngood";;8;kg'].join(nl);
      const ws = strong(csv, 'lbs');
      assert.equal(ws[0].exercises[0].sets[0].weight, 220.46);
      assert.equal(ws[0].exercises[0].sets[0].reps, 5);
    });
    test(`${label}: Jefit multi-line notes keep following rows (${tag})`, () => {
      const csv = [JEFIT_H, '2024-08-01,Push,Bench Press,1,100,kg,5,"a\nb"', '2024-08-01,Push,Bench Press,2,100,kg,4,'].join(nl);
      const ws = jefit(csv, 'kg');
      assert.deepEqual(ws[0].exercises[0].sets.map(s => s.reps), [5, 4]);
      assert.equal(ws[0].exercises[0].sets[0].notes, 'a\nb');
    });
    test(`${label}: Fitnotes multi-line comment keeps following rows (${tag})`, () => {
      const csv = [FN_H, '2024-08-01,Bench Press,Chest,100,5,,,,"x\ny"', '2024-08-01,Bench Press,Chest,100,4,,,,'].join(nl);
      const ws = fn(csv, 'kg');
      assert.deepEqual(ws[0].exercises[0].sets.map(s => s.reps), [5, 4]);
    });
  }

  test(`${label}: parseCsv quoting rules`, () => {
    const rows = c.parseCsv('A,B\n"say ""hi""\nthere",5" bar\n,\n"",x\n', ',');
    assert.deepEqual(rows, [{ a: 'say "hi"\nthere', b: '5" bar' }, { a: '', b: 'x' }]);
    assert.deepEqual(c.parseCsv('﻿A\tB\r\n1\t2\r\n', '\t'), [{ a: '1', b: '2' }]);
  });
  test(`${label}: stray unbalanced quote does not throw`, () => {
    assert.doesNotThrow(() => c.parseCsv('a,b\n1,"oops\n2,3\n', ','));
    assert.equal(c.parseCsv('a,b\n1,"oops\n2,3', ',').length, 1);
    assert.doesNotThrow(() => hevy(HEVY_H + '\n"x,y', 'kg'));
  });
  test(`${label}: splitCsvLine unchanged`, () => {
    assert.deepEqual(c.splitCsvLine('a,"b,""c""", d', ','), ['a', 'b,"c"', 'd']);
  });
}
