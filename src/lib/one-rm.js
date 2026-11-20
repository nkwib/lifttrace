import { calc1RM } from './workout.js';

export const MAX_REPS = 12;
export const PERCENTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];

/** Loading step: matches the smallest plate pair (2.5 kg / 5 lb). */
export function stepFor(unit) {
  return unit === 'kg' ? 2.5 : 5;
}

/** Epley 1RM via calc1RM; null for invalid weight or reps (integer 1..12). */
export function estimateOneRm(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isInteger(r) || r < 1 || r > MAX_REPS) return null;
  return calc1RM(w, r) || null;
}

/** Percent-of-1RM table, each weight rounded to the nearest loading step. */
export function percentTable(oneRm, unit) {
  if (!Number.isFinite(oneRm) || oneRm <= 0) return [];
  const step = stepFor(unit);
  return PERCENTS.map(pct => ({
    pct,
    weight: Math.round(Math.round((oneRm * pct) / 100 / step * 1e6) / 1e6) * step,
  }));
}
