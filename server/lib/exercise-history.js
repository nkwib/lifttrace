/**
 * An exercise's history: every live workout it's in, newest first, with that
 * workout's sets of it. GET /api/workout/history/:exerciseId answers with
 * this, and start_program_workout reads it for last session's weights, the
 * way the Diary's Load Workout reads that route (issue #140).
 */
import db from '../db.js';

const NAMES_EXERCISE = `EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(exercises) AND json_type(exercises) = 'array' THEN exercises ELSE '[]' END) j
                           WHERE CAST(json_extract(j.value, '$.exercise_id') AS INTEGER) = ?)`;

export function exerciseHistory(userId, exerciseId) {
  // Only workouts that list the exercise; the JS find below stays the strict
  // filter (the SQL cast is never stricter, same guard as program-access.js).
  const owner = userId != null ? 'user_id = ?' : 'user_id IS NULL';
  const rows = db.prepare(
    `SELECT date, exercises FROM workout_log
      WHERE ${owner} AND deleted_at IS NULL AND ${NAMES_EXERCISE}
      ORDER BY date DESC`
  ).all(...(userId != null ? [userId] : []), exerciseId);

  const history = [];
  for (const row of rows) {
    const exercises = JSON.parse(row.exercises || '[]');
    const match = exercises.find(e => e.exercise_id === exerciseId);
    if (match) {
      history.push({
        date: row.date, sets: match.sets || [], notes: match.notes,
        ...(match.set_type ? { set_type: match.set_type } : {}),
        // The unit a distance entry was shown in (issue #119).
        ...(match.distance_unit ? { distance_unit: match.distance_unit } : {}),
      });
    }
  }
  return history;
}
