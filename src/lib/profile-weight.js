// A weigh-in logged for today also becomes the profile weight (currentWeightKg)
// that calorie burn reads. Past or future dates never touch it.
import { displayToKg } from './workout.js';
import { localDateStr } from './date-local.js';

/** kg to store, or null when the entry must not change the profile weight. */
export function profileWeightFor(date, weight, unit, today = localDateStr()) {
  const v = Number(weight);
  if (date !== today || !Number.isFinite(v) || v <= 0) return null;
  const kg = displayToKg(v, unit);
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

/**
 * Call only after the body-stats PUT succeeded, with the weight edited in this
 * save. Writes through the settings store (syncs, works in Local mode); skips
 * when unchanged. `store` and `today` are injectable for tests.
 */
export async function adoptLoggedWeight(date, weight, unit, { store, today } = {}) {
  const kg = profileWeightFor(date, weight, unit, today);
  if (kg == null) return false;
  const s = store || (await import('../stores/settings.js')).currentWeightKg;
  let cur;
  const unsub = s.subscribe(v => { cur = v; });
  unsub();
  if (cur === kg) return false;
  s.set(kg);
  return true;
}
