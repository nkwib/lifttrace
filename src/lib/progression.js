// Pure "what to try next" rule for the Diary progression chip. No svelte or
// i18n imports: returns a reasonKey + values so the caller translates.
import { normalizeEquipment } from './equipment.js';

// [kg, lb] per equipment bucket. Unknown or Other keeps the flat step.
const STEPS = {
  Barbell: [2.5, 5],
  Dumbbell: [2, 5],
  Cable: [5, 10],
  Machine: [5, 10],
};
const FLAT = [2.5, 5];

/** "8-12", "8 – 12" -> {min:8,max:12}; "10" -> {min:10,max:10}; else null. */
export function parseRepTarget(target) {
  const s = String(target ?? '').trim();
  let m = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  m = s.match(/^(\d+)$/);
  if (m) { const n = parseInt(m[1], 10); return { min: n, max: n }; }
  return null;
}

export function incrementFor(unit, equipment) {
  const bucket = normalizeEquipment(equipment);
  const [kg, lb] = STEPS[bucket] || FLAT;
  return unit === 'kg' ? kg : lb;
}

/**
 * lastSets: last session's completed sets. Reps are read through `repsOf`
 * (pass workout.js setReps so split L/R reps are honoured).
 * Returns { weight, step, reasonKey, values } or null.
 */
export function nextTarget({ targetReps, lastSets, unit = 'lbs', equipment = '', loadType, repsOf } = {}) {
  const tgt = parseRepTarget(targetReps);
  if (!tgt || !Array.isArray(lastSets)) return null;
  if (normalizeEquipment(equipment) === 'Bodyweight' && loadType !== 'weighted') return null;
  const read = repsOf || (s => s.reps);
  const working = lastSets.filter(s => s && !s.warmup && (parseInt(read(s)) || 0) > 0);
  if (!working.length) return null;
  if (!working.every(s => (parseInt(read(s)) || 0) >= tgt.max)) return null;
  const lastWeight = Math.max(...working.map(s => parseFloat(s.weight) || 0));
  if (!lastWeight) return null;
  const step = incrementFor(unit, equipment);
  return {
    weight: lastWeight + step,
    step,
    reasonKey: tgt.min === tgt.max ? 'diary.progression.reason_target' : 'diary.progression.reason_range',
    values: { reps: tgt.max, step },
  };
}
