import { Router } from 'express';
import multer from 'multer';
import db from '../db.js';
import { wrap, logger } from '../logger.js';
import { requireAuth, uid } from '../middleware/auth.js';
import { parseStrong }    from '../lib/workout-import/strong.js';
import { parseHevy }      from '../lib/workout-import/hevy.js';
import { parseFitnotes }  from '../lib/workout-import/fitnotes.js';
import { parseJefit }     from '../lib/workout-import/jefit.js';
import { parseGarminFit } from '../lib/workout-import/garmin-fit.js';
import { matchExercise }  from '../lib/workout-import/common.js';
import { importKeys, importKey, planImport } from '../../src/lib/import-match.js';
import { userZone } from '../lib/user-zone.js';
import { readTimes } from '../lib/field-sync.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — generous for multi-year exports
});

const SUPPORTED_SOURCES = ['strong', 'hevy', 'fitnotes', 'jefit', 'garmin-fit'];
// Sources whose payload is binary (not UTF-8 text). Route sends the
// raw Buffer to the parser instead of decoding to string.
const BINARY_SOURCES = new Set(['garmin-fit']);

function _parse(source, buf, userUnit, zone) {
  if (source === 'strong')     return parseStrong(buf.toString('utf8'),   userUnit);
  if (source === 'hevy')       return parseHevy(buf.toString('utf8'),     userUnit);
  if (source === 'fitnotes')   return parseFitnotes(buf.toString('utf8'), userUnit);
  if (source === 'jefit')      return parseJefit(buf.toString('utf8'),    userUnit);
  if (source === 'garmin-fit') return parseGarminFit(buf,                 userUnit, zone);
  throw new Error(`Unsupported source: ${source}`);
}

// ── POST /api/workout-import/preview ────────────────────────────────────────
// Parses the file, fuzzy-matches exercise names, and returns counts without
// writing anything. Lets the user see what they're about to import before
// committing (especially useful for multi-year files).
router.post('/preview', upload.single('file'), wrap((req, res) => {
  const { source } = req.body || {};
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!SUPPORTED_SOURCES.includes(source)) return res.status(400).json({ error: 'Unsupported source' });

  const userId = uid(req);
  const userUnit = _getUserWeightUnit(userId);

  let workouts;
  try { workouts = _parse(source, req.file.buffer, userUnit, userZone(userId)); }
  catch(e) { return res.status(400).json({ error: `Parse failed: ${e.message}` }); }

  if (workouts.length === 0) return res.status(400).json({ error: 'No workouts found in file' });

  const library = _loadLibraryForUser(userId);
  let totalSets = 0;
  const unmatchedNames = new Map(); // name -> count
  const matchedNames   = new Set();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      totalSets += (ex.sets || []).length;
      const m = matchExercise(ex.sourceName, library);
      if (m) matchedNames.add(ex.sourceName);
      else unmatchedNames.set(ex.sourceName, (unmatchedNames.get(ex.sourceName) || 0) + 1);
    }
  }

  // A file session is a duplicate when it pairs with a live same-(date,
  // name) session, n-th with n-th: the same pairing commit uses (issue #76).
  const duplicateCount = planImport(workouts, _loadExisting(userId, workouts)).filter(p => p.existing).length;

  res.json({
    workouts: workouts.length,
    sets: totalSets,
    uniqueExercises: matchedNames.size + unmatchedNames.size,
    matchedExercises: matchedNames.size,
    unmatchedExercises: [...unmatchedNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([name, count]) => ({ name, count })),
    duplicateDates: duplicateCount,
    dateRange: { from: workouts[0].date, to: workouts[workouts.length - 1].date },
  });
}));

// ── POST /api/workout-import/commit ─────────────────────────────────────────
// Re-parses the file and writes every non-duplicate workout to workout_log.
// We don't trust client-side state so we parse from scratch.
router.post('/commit', upload.single('file'), wrap((req, res) => {
  const { source, onDuplicate } = req.body || {};
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!SUPPORTED_SOURCES.includes(source)) return res.status(400).json({ error: 'Unsupported source' });
  // 'skip' (safe default) or 'replace'
  const dupeMode = onDuplicate === 'replace' ? 'replace' : 'skip';

  const userId = uid(req);
  const userUnit = _getUserWeightUnit(userId);

  let workouts;
  try { workouts = _parse(source, req.file.buffer, userUnit, userZone(userId)); }
  catch(e) { return res.status(400).json({ error: `Parse failed: ${e.message}` }); }

  const library = _loadLibraryForUser(userId);
  // Dedup scoped to (user_id, date, name), not date alone (issue #76): the
  // n-th file session of a key pairs with the n-th live existing one, so two
  // same-name same-day sessions import as two, and a re-import skips or
  // replaces each against its own copy. Existing rows are read once up front;
  // rows inserted below are never candidates.
  const plan = planImport(workouts, _loadExisting(userId, workouts));
  const nextSeqStmt  = db.prepare('SELECT COALESCE(MAX(session_seq), -1) + 1 AS n FROM workout_log WHERE user_id IS ? AND date = ?');
  const insertStmt   = db.prepare(
    `INSERT INTO workout_log (user_id, date, name, notes, duration_min, exercises, completed, session_seq, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))`
  );
  // In place, so the row keeps its id (coach feedback, tombstones, template/
  // program links) and its position among the date's sessions.
  const replaceStmt  = db.prepare(
    `UPDATE workout_log SET notes = ?, duration_min = ?, exercises = ?, completed = 1, field_times = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id IS ? AND deleted_at IS NULL`
  );

  let imported = 0, skipped = 0, replaced = 0;
  const tx = db.transaction(() => {
    for (const { w, name: importName, existing } of plan) {
      if (existing && dupeMode === 'skip') { skipped++; continue; }
      const exerciseRows = w.exercises.map(ex => {
        const match = matchExercise(ex.sourceName, library);
        return {
          exercise_id:   match ? match.id : null,
          exercise_name: match ? match.name : ex.sourceName,
          sets:          ex.sets,
          superset_id:   ex.superset_id,
          superset_size: ex.superset_size || 1,
          // Carried through for timed exercises (issue #89); the importers
          // stamp it when every set on the exercise is a hold.
          ...(ex.set_type ? { set_type: ex.set_type } : {}),
        };
      });
      if (existing) {
        const now = new Date().toISOString();
        const times = { ...readTimes(existing.field_times) };
        for (const f of ['notes', 'duration_min', 'exercises', 'completed']) times[f] = now;
        replaceStmt.run(
          w.notes || null, w.duration_min || null, JSON.stringify(exerciseRows),
          JSON.stringify(times), existing.id, userId,
        );
        replaced++;
        continue;
      }
      insertStmt.run(
        userId, w.date, importName, w.notes || null,
        w.duration_min || null, JSON.stringify(exerciseRows), nextSeqStmt.get(userId, w.date).n,
      );
      imported++;
    }
  });
  try { tx(); }
  catch(e) {
    logger.error('[workout-import] commit failed:', e.message);
    return res.status(500).json({ error: `Import failed: ${e.message}` });
  }

  res.json({ imported, skipped, replaced });
}));

// ── helpers ────────────────────────────────────────────────────────────────
// Live rows per (date, name) key of the file, in session_seq, id order.
function _loadExisting(userId, workouts) {
  const stmt = db.prepare('SELECT id, session_seq, field_times FROM workout_log WHERE user_id IS ? AND date = ? AND name = ? AND deleted_at IS NULL ORDER BY session_seq, id');
  const byKey = new Map();
  for (const [date, name] of importKeys(workouts)) byKey.set(importKey(date, name), stmt.all(userId, date, name));
  return byKey;
}

function _getUserWeightUnit(userId) {
  const row = db.prepare("SELECT value FROM user_settings WHERE user_id IS ? AND key = 'weightUnit'").get(userId);
  if (!row) return 'lbs';
  try { return JSON.parse(row.value); } catch { return row.value || 'lbs'; }
}

function _loadLibraryForUser(userId) {
  return db.prepare(
    // Live rows only — matching an imported workout against a soft-deleted
    // exercise would immediately orphan the reference again (#49).
    `SELECT id, name FROM exercises WHERE deleted_at IS NULL AND (is_global = 1 OR created_by IS ?)`
  ).all(userId);
}

export default router;
