/**
 * Shared formatting helpers for the Statistics page and its extracted
 * chart components. Kept as plain functions so they're also usable
 * from Svelte reactive statements without subscribing to stores.
 */
import { weekStartOf, shiftDate } from './trained-day.js';

/** Compact volume number: 12 → "12", 4800 → "4.8k", 1234567 → "1.2M". */
export function fmtVol(v) {
  if (!Number.isFinite(v)) return '0';
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000)    return (v / 1000).toFixed(1) + 'k';
  return String(Math.round(v));
}

/** Turn a "2026-W17" style ISO week into just "W17" for axis labels. */
export function fmtWeekLabel(w) {
  return w ? w.slice(5) : '';
}

/**
 * Does a records row hold a record? A bodyweight rep exercise has none: the
 * records only track weight, so its row came back with a weight of 0 and no
 * reps and read "0 kg × undefined". A hold, a distance or calories counts
 * without any weight (issues #89, #119).
 */
export function hasRecord(r) {
  return !!r && ((r.maxWeight || 0) > 0 || (r.maxDuration || 0) > 0
    || (r.maxDistance || 0) > 0 || (r.maxCalories || 0) > 0);
}

/** The date a records row's record was set: a hold, distance or calorie
 *  record keeps its own (rep records use `date`). */
export function recordDate(r) {
  return r?.date || r?.durationDate || r?.distanceDate || r?.caloriesDate || '';
}

/**
 * Weekly rows with the empty weeks between them filled in, so averages and
 * bars count a layoff. `rows` are [{ week: Monday YYYY-MM-DD, ... }] oldest
 * first; `zero` is the row's fields for a week with no data ({ count: 0 }).
 * Starts at the first data week (a range start before it, or an 'All' range
 * from before the first workout, adds nothing: a new user is not diluted).
 * Ends at the last data week, or the week before `end`'s when `end`'s own
 * week has no data yet (an in-progress empty week would drag the average).
 * Never past `end`'s week, never more than `cap` weeks. Pure UTC date math.
 */
export function fillWeeks(rows, start, end, zero, cap = 520) {
  if (!rows || !rows.length) return [];
  const byWeek = new Map(rows.map(r => [r.week, r]));
  const weeks = [...byWeek.keys()].sort();
  const endWeek = end ? weekStartOf(end) : weeks[weeks.length - 1];
  const lastData = weeks[weeks.length - 1];
  let first = weeks[0];
  if (start) { const s = weekStartOf(start); if (s > first) first = s; }
  let last = lastData;
  if (endWeek > last) last = byWeek.has(endWeek) ? endWeek : shiftDate(endWeek, -7);
  if (last < lastData) last = lastData;
  const out = [];
  for (let w = last; w >= first && out.length < cap; w = shiftDate(w, -7)) {
    out.unshift(byWeek.get(w) || { ...zero, week: w });
  }
  return out;
}
