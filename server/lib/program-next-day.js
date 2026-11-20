/**
 * Which workout day of the active program comes next, for a date: the one
 * after the last one finished before it since the program was started (the
 * same workouts that move its week on), wrapping to the first; the first
 * when none was. Shared by the MCP start_program_workout tool and the
 * scheduler's workout reminder. Imports only the db (no cycles).
 */
import db from '../db.js';

/** The account's active program (its assignment and program row), or null. */
export function activeAssignment(userId) {
  return db.prepare(
    `SELECT pa.program_id, pa.assigned_at, p.name, p.duration_weeks FROM program_assignments pa
       JOIN programs p ON p.id = pa.program_id
      WHERE pa.assigned_to = ? AND pa.active = 1 AND p.deleted_at IS NULL`
  ).get(userId) || null;
}

/** A program's live workout days, in the program's order. */
export function programTemplates(programId) {
  return db.prepare(
    'SELECT * FROM workout_templates WHERE program_id = ? AND deleted_at IS NULL ORDER BY order_index ASC, id ASC'
  ).all(programId);
}

/** The next day among `templates` (non-empty) for `day`. */
export function nextDay(userId, assignment, templates, day) {
  const ids = templates.map(t => t.id);
  const last = db.prepare(
    `SELECT template_id FROM workout_log
      WHERE user_id = ? AND completed = 1 AND deleted_at IS NULL AND date < ?
        AND template_id IN (${ids.map(() => '?').join(',')})
        ${assignment.assigned_at ? 'AND date >= date(?)' : ''}
      ORDER BY date DESC, session_seq DESC, id DESC LIMIT 1`
  ).get(userId, day, ...ids, ...(assignment.assigned_at ? [assignment.assigned_at] : []));
  const at = last ? ids.indexOf(last.template_id) : -1;
  return templates[at < 0 ? 0 : (at + 1) % templates.length];
}

/** The active program's next day (template row) for `day`, or null when the
 *  account has no active program or it has no live days. */
export function nextProgramDay(userId, day) {
  if (!userId) return null;
  const assignment = activeAssignment(userId);
  if (!assignment) return null;
  const templates = programTemplates(assignment.program_id);
  return templates.length ? nextDay(userId, assignment, templates, day) : null;
}
