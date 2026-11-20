/**
 * Client copy of server/lib/set-input.js (src cannot import server code).
 * Same limits, same messages; scripts/trace-log-values-validation.test.js
 * asserts the two stay identical. Used by Trace's log_set and log_workout so
 * a bad value is rejected with a message the model can act on instead of
 * being stored as 0.
 */
export const SET_LIMITS = {
  reps: { min: 0, max: 1000 },
  weight: { min: 0, max: 10000 },
  rpe: { min: 1, max: 10 },
};

const unsent = (v) => v == null || v === '';

function num(name, v, { min, max }, whole) {
  if (unsent(v)) return undefined;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || n < min || n > max || (whole && !Number.isInteger(n))) {
    throw new Error(`${name} must be ${whole ? 'a whole number' : 'a number'} between ${min} and ${max}.`);
  }
  return n;
}

export const normalizeReps = (v) => num('reps', v, SET_LIMITS.reps, true);
export const normalizeWeight = (v) => num('weight', v, SET_LIMITS.weight, false);
export const normalizeRpe = (v) => num('rpe', v, SET_LIMITS.rpe, false);

/** true/false, "true"/"false" or 1/0; undefined when not sent. */
export function normalizeFlag(name, v) {
  if (unsent(v)) return undefined;
  if (v === true || v === 1 || v === 'true') return true;
  if (v === false || v === 0 || v === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

/**
 * Validate one set's values. Unsent fields come back undefined. Weight must
 * be a plain number in the user's unit (no "lbs"/"kg" suffix). Reps are
 * required unless `amount` is true (a timed, distance or calorie set, where
 * reps stay 0).
 */
export function normalizeSetValues({ weight, reps, rpe, warmup, completed }, { amount = false } = {}) {
  const out = {
    weight: normalizeWeight(weight),
    reps: normalizeReps(reps),
    rpe: normalizeRpe(rpe),
    warmup: normalizeFlag('warmup', warmup),
    completed: normalizeFlag('completed', completed),
  };
  if (out.reps == null && !amount) {
    throw new Error('reps is required for a rep set (send duration_sec, distance_m or calories for a timed, distance or calorie set).');
  }
  return out;
}
