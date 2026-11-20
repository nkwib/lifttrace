/**
 * programShare.js: share a routine (program + its workout days) as a JSON
 * file, and import one. Modelled on exerciseShare.js.
 *
 * Format (v1):
 *   { format: 'lifttrace-program', version: 1, exportedAt,
 *     program: { name, description, goal, duration_weeks, advance_mode, on_complete,
 *                templates: [{ name, day_label, exercises: [...] }] } }
 *
 * Export is a whitelist: ids, uuids, assignments, access, active state, owner
 * and any logged data never leave the instance. Superset links (ids) become a
 * 0-based `superset_group`, rebuilt with fresh ids on import. Exercises are
 * matched on import by exerciseNameKey, not by id.
 */
import { isNative } from './platform.js';
import { LtApi } from './api.js';
import { exerciseNameKey } from './planned-workout.js';
import { ensureExerciseUuids } from './workout-uuid.js';
import { nextCopyName } from './program-actions.js';

export const PROGRAM_FORMAT = 'lifttrace-program';
export const PROGRAM_VERSION = 1;

export const LIMITS = {
  templates: 50,
  exercises: 60,
  sets: 50,
  weeks: 52,
  name: 120,
  description: 2000,
  short: 60,
  notes: 1000,
  fileBytes: 2 * 1024 * 1024,
};

const SET_FIELDS = ['weight', 'reps', 'reps_l', 'reps_r', 'duration', 'distance', 'calories'];
const WEEK_FIELDS = ['sets', 'reps', 'weight', 'duration', 'distance', 'calories', 'tempo', 'rest_sec'];
const FLAT_FIELDS = ['target_sets', 'target_reps', 'target_weight', 'target_duration', 'target_distance', 'target_calories', 'tempo', 'rest_sec'];
const SET_TYPES = ['reps', 'time', 'distance', 'calories'];
const DISTANCE_UNITS = ['m', 'km', 'yd', 'mi'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function str(v, max) {
  if (typeof v !== 'string') return undefined;
  return v.slice(0, max);
}
// Free-form amount (weight, reps, "8-10", "1:30"): a string or a finite number.
function amount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.min(Math.max(v, 0), 99999) : undefined;
  if (typeof v === 'string') return v.slice(0, LIMITS.short);
  return undefined;
}
function int(v, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function pick(src, fields, conv) {
  const out = {};
  for (const k of fields) {
    const v = conv(src[k], k);
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}
const countOrAmount = (v, k) => k === 'sets' || k === 'target_sets' ? int(v, 1, 50)
  : k === 'rest_sec' ? int(v, 0, 3600) : amount(v);

function cleanSpec(s) {
  if (!isObj(s)) return {};
  const out = pick(s, SET_FIELDS, amount);
  if (s.warmup) out.warmup = true;
  if (typeof s.rpe === 'number' && Number.isFinite(s.rpe)) out.rpe = Math.min(10, Math.max(0, s.rpe));
  const number = int(s.number, 1, 100);
  if (number !== undefined) out.number = number;
  return out;
}

function cleanWeek(w) {
  return isObj(w) ? pick(w, WEEK_FIELDS, countOrAmount) : null;
}

function cleanExercise(ex) {
  if (!isObj(ex)) return null;
  const name = str(ex.exercise_name, LIMITS.name)?.trim();
  if (!name) return null;
  const out = { exercise_name: name, exerciseNameKey: exerciseNameKey(name) };
  Object.assign(out, pick(ex, FLAT_FIELDS, countOrAmount));
  const notes = str(ex.notes, LIMITS.notes);
  if (notes) out.notes = notes;
  const loadType = str(ex.load_type, LIMITS.short);
  if (loadType) out.load_type = loadType;
  if (SET_TYPES.includes(ex.set_type)) out.set_type = ex.set_type;
  if (DISTANCE_UNITS.includes(ex.distance_unit)) out.distance_unit = ex.distance_unit;
  if (Array.isArray(ex.set_specs) && ex.set_specs.length) {
    out.set_specs = ex.set_specs.slice(0, LIMITS.sets).map(cleanSpec);
  }
  if (Array.isArray(ex.weeks) && ex.weeks.length) {
    out.weeks = ex.weeks.slice(0, LIMITS.weeks).map(cleanWeek);
  }
  return out;
}

/** Superset ids to 0-based group numbers by first appearance. */
function groupsOf(exercises) {
  const ids = new Map();
  return exercises.map(ex => {
    if (!isObj(ex) || ex.superset_id == null || !(ex.superset_size > 1)) return undefined;
    if (!ids.has(ex.superset_id)) ids.set(ex.superset_id, ids.size);
    return ids.get(ex.superset_id);
  });
}

// `fromProgram`: raw template from the app (superset ids), else from a file
// (superset_group numbers).
function cleanTemplate(t, fromProgram) {
  if (!isObj(t)) return null;
  const list = (Array.isArray(t.exercises) ? t.exercises : []).slice(0, LIMITS.exercises);
  const groups = fromProgram ? groupsOf(list) : null;
  const exercises = [];
  list.forEach((raw, i) => {
    const ex = cleanExercise(raw);
    if (!ex) return;
    const g = fromProgram ? groups[i] : int(raw.superset_group, 0, LIMITS.exercises);
    if (g !== undefined) ex.superset_group = g;
    exercises.push(ex);
  });
  const out = { name: str(t.name, LIMITS.name)?.trim() || 'Workout', exercises };
  const dayLabel = str(t.day_label, LIMITS.short);
  if (dayLabel) out.day_label = dayLabel;
  return out;
}

/** Whitelisted, shareable copy of a program (templates loaded). */
export function buildProgramShare(program) {
  const templates = (program?.templates || []).slice(0, LIMITS.templates)
    .map(t => cleanTemplate(t, true)).filter(Boolean);
  const payload = {
    format: PROGRAM_FORMAT,
    version: PROGRAM_VERSION,
    exportedAt: new Date().toISOString(),
    program: {
      name: str(program?.name, LIMITS.name)?.trim() || 'Program',
      description: str(program?.description, LIMITS.description) || '',
      goal: str(program?.goal, LIMITS.short) || 'general',
      duration_weeks: int(program?.duration_weeks, 1, 52) ?? 1,
      advance_mode: program?.advance_mode === 'calendar' ? 'calendar' : 'sessions',
      on_complete: program?.on_complete === 'repeat' ? 'repeat' : 'hold',
      templates,
    },
  };
  const safe = String(program?.name || 'program')
    .replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'program';
  return { payload, filename: `${safe}.lifttrace-program.json`, json: JSON.stringify(payload, null, 2) };
}

/** Validate and sanitise a file's contents. Throws an Error fit for a toast. */
export function parseProgramShare(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    if (raw.length > LIMITS.fileBytes) throw new ProgramShareError('too_large', 'File is too large');
    try { obj = JSON.parse(raw); } catch { throw new ProgramShareError('invalid_json', 'File is not valid JSON'); }
  }
  if (!isObj(obj) || obj.format !== PROGRAM_FORMAT) throw new ProgramShareError('not_program', 'File is not a LiftTrace program');
  if (typeof obj.version !== 'number' || !(obj.version >= 1)) throw new ProgramShareError('not_program', 'File is not a LiftTrace program');
  if (obj.version > PROGRAM_VERSION) throw new ProgramShareError('newer_version', 'File was made by a newer version of LiftTrace');
  const p = obj.program;
  if (!isObj(p)) throw new ProgramShareError('not_program', 'File is not a LiftTrace program');
  const name = str(p.name, LIMITS.name)?.trim();
  if (!name) throw new ProgramShareError('no_name', 'Program has no name');
  if (!Array.isArray(p.templates)) throw new ProgramShareError('no_workouts', 'Program has no workouts');
  if (p.templates.length > LIMITS.templates) throw new ProgramShareError('too_many_workouts', 'Program has too many workouts');
  for (const t of p.templates) {
    if (isObj(t) && Array.isArray(t.exercises) && t.exercises.length > LIMITS.exercises) {
      throw new ProgramShareError('too_many_exercises', 'A workout has too many exercises');
    }
  }
  return {
    name,
    description: str(p.description, LIMITS.description) || '',
    goal: str(p.goal, LIMITS.short) || 'general',
    duration_weeks: int(p.duration_weeks, 1, 52) ?? 1,
    advance_mode: p.advance_mode === 'calendar' ? 'calendar' : 'sessions',
    on_complete: p.on_complete === 'repeat' ? 'repeat' : 'hold',
    templates: p.templates.map(t => cleanTemplate(t, false)).filter(Boolean),
  };
}

/** Import validation error: stable `code` for i18n, English `message` as fallback. */
export class ProgramShareError extends Error {
  constructor(code, message) { super(message); this.name = 'ProgramShareError'; this.code = code; }
}

/** Read a File from a picker, parse + validate. */
export async function readSharedProgramFile(file) {
  if (file.size > LIMITS.fileBytes) throw new ProgramShareError('too_large', 'File is too large');
  return parseProgramShare(await file.text());
}

/** Download on the PWA, write to the device and open the Share sheet on Android. */
export async function exportProgram(program, { title = 'LiftTrace program', dialogTitle = 'Share program' } = {}) {
  const { json, filename } = buildProgramShare(program);
  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const dir = 'lifttrace-exports';
    try { await Filesystem.mkdir({ path: dir, directory: Directory.Cache, recursive: true }); } catch {}
    const writeRes = await Filesystem.writeFile({
      path: `${dir}/${filename}`, data: json, directory: Directory.Cache, encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title, text: program?.name || filename, url: writeRes?.uri, dialogTitle });
    } catch { /* dismissed; the file is still on device */ }
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Turn a parsed share into template exercises: library ids resolved by name
 * key, unmatched names created once (via `createMissing`), superset groups
 * rebuilt with fresh ids.
 */
export async function resolveTemplates(parsed, library, createMissing) {
  const byKey = new Map();
  for (const e of library || []) {
    const k = exerciseNameKey(e.name);
    if (k && !byKey.has(k)) byKey.set(k, e);
  }
  const created = [];
  const libFor = async (ex) => {
    const key = exerciseNameKey(ex.exercise_name);
    let hit = byKey.get(key);
    if (!hit) {
      hit = await createMissing(ex.exercise_name, ex);
      byKey.set(key, hit);
      created.push(ex.exercise_name);
    }
    return hit;
  };
  const stamp = Date.now().toString(36);
  const templates = [];
  for (let ti = 0; ti < parsed.templates.length; ti++) {
    const t = parsed.templates[ti];
    const sizes = new Map();
    for (const ex of t.exercises) {
      if (ex.superset_group !== undefined) sizes.set(ex.superset_group, (sizes.get(ex.superset_group) || 0) + 1);
    }
    const seen = new Map();
    const exercises = [];
    for (const src of t.exercises) {
      const { superset_group: g, exerciseNameKey: _k, ...rest } = src;
      const lib = await libFor(src);
      const ex = { ...rest, exercise_id: lib.id, exercise_name: lib.name || src.exercise_name, sets: [] };
      if (g !== undefined && sizes.get(g) > 1) {
        const pos = seen.get(g) || 0;
        seen.set(g, pos + 1);
        ex.superset_id = `${stamp}t${ti}g${g}`;
        ex.superset_size = sizes.get(g);
        ex.superset_position = pos;
      }
      exercises.push(ex);
    }
    templates.push({ name: t.name, day_label: t.day_label, exercises: ensureExerciseUuids(exercises) });
  }
  return { templates, created };
}

/** The file's name when free, else the next "(Copy N)" one. */
export function importName(name, existingNames) {
  return new Set(existingNames).has(name) ? nextCopyName(name, existingNames) : name;
}

/**
 * Import as a NEW inactive, unassigned program. Rolls the program back
 * (deleted) if a day fails. Resolves to { program, created }.
 */
export async function importProgram(parsed) {
  // Required for matching: without it every exercise would be created as a duplicate.
  const library = await LtApi.getExercises();
  const made = [];
  const createMissing = async (name, ex) => {
    const row = await LtApi.createExercise({
      name,
      ...(ex.set_type ? { set_type: ex.set_type } : {}),
      ...(ex.load_type ? { load_type: ex.load_type } : {}),
    });
    made.push(name);
    return row;
  };
  const leftover = () => (made.length ? `; ${made.length} new exercise(s) were already created: ${made.join(', ')}` : '');
  const withNote = (e) => { const err = e instanceof Error ? e : new Error(String(e)); if (made.length) err.message = `${err.message || 'error'}${leftover()}`; return err; };
  let templates, created;
  try {
    ({ templates, created } = await resolveTemplates(parsed, library, createMissing));
  } catch (e) { throw withNote(e); }
  let existingNames = [];
  try { existingNames = (await LtApi.getPrograms()).map(p => p.name); } catch { /* a nicety */ }
  let program;
  try {
    program = await LtApi.createProgram({
      name: importName(parsed.name, existingNames),
      description: parsed.description,
      goal: parsed.goal,
      duration_weeks: parsed.duration_weeks,
      advance_mode: parsed.advance_mode,
      on_complete: parsed.on_complete,
    });
  } catch (e) { throw withNote(e); }
  try {
    for (const t of templates) {
      await LtApi.createTemplate({ program_id: program.id, name: t.name, day_label: t.day_label, exercises: t.exercises });
    }
  } catch (e) {
    try { await LtApi.deleteProgram(program.id); }
    catch { throw new Error(`Import failed part way; program "${program.name}" is incomplete (${e.message || 'error'})${leftover()}`); }
    throw withNote(e);
  }
  return { program, created };
}
