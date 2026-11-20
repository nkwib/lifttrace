import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildProgramShare, parseProgramShare, resolveTemplates, importName, LIMITS,
} from '../src/lib/programShare.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const program = {
  id: 7, name: 'Push / Pull', description: 'd', goal: 'strength', duration_weeks: 4,
  advance_mode: 'calendar', on_complete: 'repeat', is_active: 1, created_by: 3, visibility: 'shared',
  templates: [{
    id: 11, program_id: 7, name: 'Day A', day_label: 'Mon', order_index: 0, field_times: '{}',
    exercises: [
      { uuid: 'u1', exercise_id: 5, exercise_name: 'Bench Press', target_sets: 3, target_reps: '5', target_weight: '100',
        superset_id: 'ss1', superset_size: 2, superset_position: 0,
        set_specs: [{ weight: '100', reps: '5', warmup: true, rpe: 7, number: 1, reps_l: '5', reps_r: '4' }, { weight: '110', reps: '3' }],
        weeks: [null, { sets: 4, reps: '4', weight: '105', rest_sec: 120 }] },
      { uuid: 'u2', exercise_id: 6, exercise_name: 'Row', target_sets: 3, target_reps: '8', superset_id: 'ss1', superset_size: 2, superset_position: 1, user_note: 'secret', sets: [{ weight: 1 }] },
      { uuid: 'u3', exercise_id: 9, exercise_name: 'Plank', set_type: 'time', target_duration: '1:00' },
    ],
  }],
};

test('round trip keeps prescription, supersets, weeks, set specs', async () => {
  const { json } = buildProgramShare(program);
  const parsed = parseProgramShare(json);
  assert.equal(parsed.name, 'Push / Pull');
  assert.equal(parsed.duration_weeks, 4);
  assert.equal(parsed.advance_mode, 'calendar');
  const ex = parsed.templates[0].exercises;
  assert.equal(ex[0].superset_group, 0);
  assert.equal(ex[1].superset_group, 0);
  assert.equal(ex[2].superset_group, undefined);
  assert.equal(ex[0].set_specs[0].warmup, true);
  assert.equal(ex[0].set_specs[0].reps_l, '5');
  assert.equal(ex[0].weeks[0], null);
  assert.equal(ex[0].weeks[1].rest_sec, 120);
  assert.equal(ex[2].set_type, 'time');

  const lib = [{ id: 50, name: 'bench press' }, { id: 51, name: 'Row' }, { id: 52, name: 'Plank' }];
  const { templates, created } = await resolveTemplates(parsed, lib, async () => { throw new Error('no'); });
  assert.deepEqual(created, []);
  const [a, b, c] = templates[0].exercises;
  assert.equal(a.exercise_id, 50);
  assert.ok(a.superset_id && a.superset_id === b.superset_id);
  assert.notEqual(a.superset_id, 'ss1');
  assert.equal(a.superset_size, 2);
  assert.equal(b.superset_position, 1);
  assert.equal(c.superset_id, undefined);
  assert.ok(a.uuid && a.uuid !== 'u1');
  assert.equal(a.weeks[1].sets, 4);
});

test('export has no ids, user data, assignments or state', () => {
  const { json } = buildProgramShare(program);
  for (const bad of ['"id"', 'exercise_id', 'uuid', 'created_by', 'is_active', 'visibility', 'program_id', 'field_times', 'secret', 'ss1']) {
    assert.ok(!json.includes(bad), `leaked ${bad}`);
  }
});

test('rejects wrong format, newer version, malformed, oversize', () => {
  const ok = JSON.parse(buildProgramShare(program).json);
  assert.throws(() => parseProgramShare('{nope'), /not valid JSON/);
  assert.throws(() => parseProgramShare({ ...ok, format: 'x' }), /not a LiftTrace program/);
  assert.throws(() => parseProgramShare({ ...ok, version: 2 }), /newer version/);
  assert.throws(() => parseProgramShare({ ...ok, version: 'a' }), /not a LiftTrace program/);
  assert.throws(() => parseProgramShare({ ...ok, program: { ...ok.program, name: '' } }), /no name/);
  assert.throws(() => parseProgramShare({ ...ok, program: { ...ok.program, templates: 'x' } }), /no workouts/);
  const many = Array.from({ length: LIMITS.templates + 1 }, () => ({ name: 'd', exercises: [] }));
  assert.throws(() => parseProgramShare({ ...ok, program: { ...ok.program, templates: many } }), /too many workouts/);
  const exs = Array.from({ length: LIMITS.exercises + 1 }, () => ({ exercise_name: 'x' }));
  assert.throws(() => parseProgramShare({ ...ok, program: { ...ok.program, templates: [{ name: 'd', exercises: exs }] } }), /too many exercises/);
  assert.throws(() => parseProgramShare('x'.repeat(LIMITS.fileBytes + 1)), /too large/);
});

test('clamps numbers and strings, caps sets/weeks, ignores unknown fields', () => {
  const p = parseProgramShare({
    format: 'lifttrace-program', version: 1, evil: 1,
    program: {
      name: 'n'.repeat(500), duration_weeks: 999, advance_mode: 'zzz', on_complete: 'zzz', owner: 'x',
      templates: [{ name: 'd', admin: 1, exercises: [{
        exercise_name: 'Squat', exercise_id: 99, uuid: 'u', target_sets: 9999, rest_sec: -5, target_weight: 1e9,
        set_specs: Array.from({ length: 200 }, () => ({ weight: 1, evil: 1 })),
        weeks: Array.from({ length: 200 }, () => ({ sets: 2 })),
      }] }],
    },
  });
  assert.equal(p.name.length, LIMITS.name);
  assert.equal(p.duration_weeks, 52);
  assert.equal(p.advance_mode, 'sessions');
  assert.equal(p.on_complete, 'hold');
  const ex = p.templates[0].exercises[0];
  assert.equal(ex.target_sets, 50);
  assert.equal(ex.rest_sec, 0);
  assert.equal(ex.target_weight, 99999);
  assert.equal(ex.set_specs.length, LIMITS.sets);
  assert.equal(ex.weeks.length, LIMITS.weeks);
  assert.equal(ex.exercise_id, undefined);
  assert.equal(ex.uuid, undefined);
  assert.equal(ex.set_specs[0].evil, undefined);
});

test('unknown exercises are created once per name', async () => {
  const parsed = parseProgramShare({
    format: 'lifttrace-program', version: 1,
    program: { name: 'P', templates: [
      { name: 'A', exercises: [{ exercise_name: 'Zercher Squat' }, { exercise_name: 'Zercher  squat' }] },
      { name: 'B', exercises: [{ exercise_name: 'Zercher Squat' }] },
    ] },
  });
  const made = [];
  const { templates, created } = await resolveTemplates(parsed, [], async (name) => {
    made.push(name); return { id: 100 + made.length, name };
  });
  assert.equal(made.length, 1);
  assert.deepEqual(created, ['Zercher Squat']);
  assert.ok(templates.flatMap(t => t.exercises).every(e => e.exercise_id === 101));
});

test('collision naming', () => {
  assert.equal(importName('Plan', ['Other']), 'Plan');
  assert.equal(importName('Plan', ['Plan']), 'Plan (Copy)');
  assert.equal(importName('Plan', ['Plan', 'Plan (Copy)']), 'Plan (Copy 2)');
});

test('wiring: Share as file on ProgramDetail, Import program on Programs, en keys', () => {
  const detail = read('src/routes/ProgramDetail.svelte');
  assert.match(detail, /programShare\.js/);
  assert.match(detail, /program_detail\.share_file/);
  assert.match(detail, /value: 'share_file'/);
  const list = read('src/routes/Programs.svelte');
  assert.match(list, /readSharedProgramFile/);
  assert.match(list, /programs\.import_program/);
  assert.match(list, /type="file"/);
  const en = JSON.parse(read('src/i18n/en.json'));
  assert.equal(en.programs.import_program, 'Import program');
  assert.equal(en.program_detail.share_file, 'Share as file');
});
