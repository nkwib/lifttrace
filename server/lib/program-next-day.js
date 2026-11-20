/**
 * Which workout day of the active program comes next, for a date: the one
 * after the last one finished before it since the program was started (the
 * same workouts that move its week on), wrapping to the first; the first
 * when none was. Shared by the MCP start_program_workout tool and the
 * scheduler's workout reminder. Imports only the db and solo-program (which
 * imports only the db and user-zone): no cycles.
 */
import db from '../db.js';
import { soloActiveId, soloStart } from './solo-program.js';

/** The account's active program (its assignment and program row), or null. */
export function activeAssignment(userId) {
  return db.prepare(
    `SELECT pa.program_id, pa.assigned_at, p.name, p.duration_weeks FROM program_assignments pa
       JOIN programs p ON p.id = pa.program_id
      WHERE pa.assigned_to = ? AND pa.active = 1 AND p.deleted_at IS NULL`
  ).get(userId) || null;
}

/**
 * Without accounts: the followed program as an assignment-like row, or null
 * (none, or deleted). Its start is the solo start (a UTC stamp or a date),
 * read as `date(start)` like programWeek does, so on the activation day it
 * may be a day off. Reading may backfill a missing start (soloStart).
 */
function soloAssignment() {
  const id = soloActiveId();
  if (id == null) return null;
  const p = db.prepare('SELECT id, name, duration_weeks FROM programs WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!p) return null;
  return { program_id: p.id, assigned_at: soloStart(), name: p.name, duration_weeks: p.duration_weeks };
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
      WHERE user_id IS ? AND completed = 1 AND deleted_at IS NULL AND date < ?
        AND template_id IN (${ids.map(() => '?').join(',')})
        ${assignment.assigned_at ? 'AND date >= date(?)' : ''}
      ORDER BY date DESC, session_seq DESC, id DESC LIMIT 1`
  ).get(userId ?? null, day, ...ids, ...(assignment.assigned_at ? [assignment.assigned_at] : []));
  const at = last ? ids.indexOf(last.template_id) : -1;
  return templates[at < 0 ? 0 : (at + 1) % templates.length];
}

/** The active program's next day (template row) for `day`, or null when the
 *  account has no active program or it has no live days. */
export function nextProgramDay(userId, day) {
  const assignment = userId ? activeAssignment(userId) : soloAssignment();
  if (!assignment) return null;
  const templates = programTemplates(assignment.program_id);
  return templates.length ? nextDay(userId, assignment, templates, day) : null;
}
