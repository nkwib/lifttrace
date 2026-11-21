/**
 * MCP tool: get_workout
 *
 * Read a single day's workout — every exercise and set. Mirrors
 * GET /api/workout/:date. Filters out soft-deleted rows the same way
 * that route does (deleted_at IS NULL, see LT v1.2.0 CHANGELOG).
 *
 * A date can have more than one session (issue #76). By default this
 * returns the lowest surviving session_seq/id, as GET /:date does; pass
 * session_seq to read another one. Every answer carries workout_id (what
 * log_set takes), session_seq and, for a logged day, session_count.
 */
import { z } from 'zod';
import db from '../../../db.js';
import { assertDate, DATE_RE, todayFor, toolResult, toolError } from '../_util.js';
import { holdSides, sideReps, setReps } from '../../volume.js';

const sidesOf = (s) => {
  const sides = holdSides(s);
  return sides ? { duration_l_sec: sides.l, duration_r_sec: sides.r } : {};
};
// Reps split left/right: reps is the weaker side, whatever an older app left
// in it (setReps), and the sides go with it.
const repSidesOf = (s) => (sideReps(s.reps_l, s.reps_r) != null
  ? { reps_l: s.reps_l ?? null, reps_r: s.reps_r ?? null } : {});

/**
 * Core lookup, shared by the MCP tool below and the public REST API
 * (issue #77) at GET /api/v1/workouts/:date. Throws a plain Error on bad
 * input so callers on either side can decide how to surface it: the MCP
 * wrapper maps it to toolError, the REST route maps it to a 400.
 */
export function getWorkoutCore(userId, { date, session_seq } = {}) {
  const day = date || todayFor(userId);
  assertDate(day);

  const picked = session_seq != null && session_seq !== '';
  let seq = null;
  if (picked) {
    seq = typeof session_seq === 'string' && /^\d+$/.test(session_seq) ? Number(session_seq) : session_seq;
    if (!Number.isSafeInteger(seq) || seq < 0) throw new Error('session_seq must be a whole number, 0 or more.');
  }

  const row = picked
    ? db.prepare(
      'SELECT * FROM workout_log WHERE date = ? AND user_id = ? AND deleted_at IS NULL AND session_seq = ? ORDER BY id ASC LIMIT 1'
    ).get(day, userId, seq)
    : db.prepare(
      'SELECT * FROM workout_log WHERE date = ? AND user_id = ? AND deleted_at IS NULL ORDER BY session_seq ASC, id ASC LIMIT 1'
    ).get(day, userId);
  if (!row) return { date: day, logged: false, session_count: 0, exercises: [] };

  const session_count = db.prepare(
    'SELECT COUNT(*) AS c FROM workout_log WHERE date = ? AND user_id = ? AND deleted_at IS NULL'
  ).get(day, userId).c;
  return { ...formatWorkoutRow(row), session_count };
}

/**
 * One shape for a logged session, used by this tool and by get_workouts.
 * Kept in one place so a field added for one (set_type and duration_sec
 * were, for issue #89; distance_m and calories for #119) can never be
 * missing from the other.
 */
export function formatWorkoutRow(row) {
  const exercises = JSON.parse(row.exercises || '[]');
  return {
    workout_id: row.id,
    session_seq: row.session_seq ?? 0,
    date: row.date,
    logged: true,
    name: row.name || null,
    completed: !!row.completed,
    duration_min: row.duration_min ?? null,
    exercises: exercises.map(ex => ({
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise_name,
      superset_id: ex.superset_id ?? null,
      set_type: ex.set_type ?? null,
      sets: (ex.sets || []).map(s => ({
        reps: setReps(s) ?? null,
        ...repSidesOf(s),
        weight: s.weight ?? null,
        completed: !!s.completed,
        warmup: !!s.warmup,
        rpe: s.rpe ?? null,
        duration_sec: s.duration_sec ?? null,
        // A hold timed per side (issue #143); duration_sec is the shorter side.
        ...sidesOf(s),
        distance_m: s.distance_m ?? null,
        calories: s.calories ?? null,
      })),
    })),
  };
}

export function registerGetWorkout(server, { userId }) {
  server.registerTool(
    'get_workout',
    {
      title: 'Get Workout',
      description:
        "Read a day's workout — every exercise and its sets (reps, with reps_l and reps_r for reps split left/right and reps then the weaker side, weight, " +
        "completed, warmup, RPE, duration_sec for timed sets like planks (with duration_l_sec and duration_r_sec for a hold timed per side, duration_sec then the shorter side), distance_m in meters for distance sets like rows and sled pushes, calories for calorie sets like air bikes). Date defaults to today in the server's " +
        'timezone; pass an explicit YYYY-MM-DD for calendar accuracy from a ' +
        'different TZ. Also returns workout_id (pass it to log_set), session_seq and session_count. ' +
        'A day can hold several sessions: the default is the first, and session_seq (0, 1, ...) reads another; ' +
        'a session_seq with no workout answers logged: false.',
      inputSchema: {
        date: z.string().regex(DATE_RE, 'YYYY-MM-DD').optional(),
        session_seq: z.number().int().min(0).optional(),
      },
    },
    async ({ date, session_seq }) => {
      try {
        return toolResult(getWorkoutCore(userId, { date, session_seq }));
      } catch (e) {
        return toolError(e.message);
      }
    }
  );
}
