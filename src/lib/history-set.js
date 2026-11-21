import { setKind, fmtSetLabel, distanceUnitOf, setReps } from './workout.js';
import { estimateOneRm } from './one-rm.js';

/**
 * One completed set as shown in an exercise's history row. Rep sets read
 * `w×r`, or `w×L+R` whenever either side is recorded (any load type); the
 * unit is shown once per row by the caller. Timed, distance and calorie sets
 * carry their own unit via fmtSetLabel.
 * ctx: { exerciseId, exerciseName, imperial, distanceUnits }
 */
export function fmtHistorySet(set, h, ctx = {}) {
  const kind = setKind({ set_type: h?.set_type }, set);
  if (kind !== 'reps') {
    const unit = distanceUnitOf(
      { exercise_id: ctx.exerciseId, exercise_name: ctx.exerciseName, distance_unit: h?.distance_unit },
      !!ctx.imperial, ctx.distanceUnits);
    return fmtSetLabel({ set_type: kind }, set, unit);
  }
  if (set.reps_l != null || set.reps_r != null) {
    return `${set.weight}×${set.reps_l ?? ''}+${set.reps_r ?? ''}`;
  }
  return `${set.weight}×${setReps(set)}`;
}

/** True when the row has a completed rep set (so a weight unit applies). */
export function historyHasRepSets(h) {
  return (h?.sets || []).some(s => s.completed && setKind({ set_type: h?.set_type }, s) === 'reps');
}

/**
 * Heaviest completed, non-warm-up rep set across history. Tie on weight goes
 * to the most reps. Returns { weight, date, unit, reps?, label?, sub? } or null.
 * e1RM (sub) is omitted for 1 rep or more than 12 (estimateOneRm range).
 * fmtE1rm(value, unit) supplies the localized sub text.
 */
export function exerciseWeightPr(history, unit, fmtE1rm) {
  let max = 0, maxReps = 0, date = '';
  for (const h of history || []) {
    for (const s of h.sets || []) {
      if (!s.completed || s.warmup || setKind({ set_type: h.set_type }, s) !== 'reps') continue;
      const w = Number(s.weight) || 0, r = Number(setReps(s)) || 0;
      if (w > max || (w === max && w > 0 && r > maxReps)) { max = w; maxReps = r; date = h.date; }
    }
  }
  if (!(max > 0)) return null;
  if (!maxReps) return { weight: max, date, unit };
  const e1 = estimateOneRm(max, maxReps);
  return {
    weight: max, date, unit, reps: maxReps,
    label: `${max} ${unit} × ${maxReps}`,
    sub: e1 && maxReps > 1 && fmtE1rm ? fmtE1rm(Math.round(e1 * 10) / 10, unit) : undefined,
  };
}

/** Assisted lifts are marked by equipment (string or array), not load_type. */
export function isAssisted(exercise) {
  return /assisted/i.test(String(exercise?.equipment ?? ''));
}

/**
 * Best Epley e1RM per session, oldest first, as [{ date, e1rm }] (1 decimal).
 * history is newest-first. Counts completed, non-warm-up rep sets only; sets
 * outside estimateOneRm's range (13+ reps, no weight) are skipped one by one.
 * L/R splits count at the weaker side (setReps). Callers skip assisted
 * exercises (isAssisted): their weight is help, not load.
 */
export function sessionE1rms(history) {
  const out = [];
  for (const h of [...(history || [])].reverse()) {
    let best = 0;
    for (const s of h.sets || []) {
      if (!s.completed || s.warmup || setKind({ set_type: h.set_type }, s) !== 'reps') continue;
      const e = estimateOneRm(s.weight, setReps(s));
      if (e && e > best) best = e;
    }
    if (best > 0) out.push({ date: h.date, e1rm: Math.round(best * 10) / 10 });
  }
  return out;
}

/**
 * Best weight at or above each rep count: [{ reps, weight, date }] ascending
 * by reps. Same set filter as exerciseWeightPr (completed, non-warm-up, rep
 * kind, weight > 0, setReps for L/R). A row is dropped when the next-higher
 * listed rep count has the same weight, so weights strictly decrease.
 */
export function repMaxes(history, reps = [1, 2, 3, 5, 8, 10, 12]) {
  const sets = [];
  for (const h of history || []) {
    for (const s of h.sets || []) {
      if (!s.completed || s.warmup || setKind({ set_type: h.set_type }, s) !== 'reps') continue;
      const w = Number(s.weight) || 0, r = Number(setReps(s)) || 0;
      if (w > 0 && r > 0) sets.push({ w, r, date: h.date });
    }
  }
  const out = [];
  for (const target of reps) {
    let best = null;
    for (const s of sets) if (s.r >= target && (!best || s.w > best.w)) best = s;
    if (best) out.push({ reps: target, weight: best.w, date: best.date });
  }
  return out.filter((row, i) => i === out.length - 1 || out[i + 1].weight !== row.weight);
}
