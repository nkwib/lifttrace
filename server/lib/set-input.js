/**
 * Validation of the values a logged set carries (reps, weight, rpe, warmup,
 * completed), shared by the MCP log_set schema and logSetCore. The REST
 * route hands its JSON body straight to the core, so the limits live here
 * rather than only in the zod schema.
 *
 * Lenient on form, strict on content: a Home Assistant template sends "12",
 * so numeric strings and "true"/"false" are accepted; null, undefined and ''
 * mean not sent. Anything else that does not parse, or is out of range,
 * throws (a 400 on the REST API).
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
