/**
 * Pure cardio input checks shared by the server (server/lib/cardio-log.js)
 * and the Android Local mode (api-native.js), so both refuse the same input.
 */

import { isCalendarDate } from './trained-day.js';

/**
 * A cardio date as YYYY-MM-DD. A legacy value with a time on it
 * (2026-05-01T08:00:00) keeps its day; anything else that isn't a real
 * calendar date throws.
 */
export function checkedCardioDate(date) {
  const day = typeof date === 'string' ? date.slice(0, 10) : '';
  if (!isCalendarDate(day) || (date.length > 10 && !/^[T ]/.test(date.slice(10)))) {
    throw new Error('date must be a calendar date, YYYY-MM-DD');
  }
  return day;
}

/**
 * Validate and normalize a cardio session the way POST /api/cardio always
 * has: date and activity required, duration_min a positive whole number of
 * minutes, distance and avg_hr optional, distance_unit km (default) or mi.
 * Throws a plain Error whose message is safe to return as a 400.
 */
export function normalizeCardioInput(input = {}) {
  const { date, activity, duration_min, distance, distance_unit, avg_hr, notes, is_template } = input;
  if (!date) throw new Error('date required');
  const day = checkedCardioDate(date);
  if (!activity || !String(activity).trim()) throw new Error('activity required');
  const dm = Math.floor(Number(duration_min));
  if (!Number.isFinite(dm) || dm <= 0) throw new Error('duration_min must be a positive integer');
  const dist = distance == null || distance === '' ? null : Number(distance);
  const hr = avg_hr == null || avg_hr === '' ? null : Math.floor(Number(avg_hr));
  return {
    date: day,
    activity: String(activity).trim(),
    duration_min: dm,
    distance: Number.isFinite(dist) ? dist : null,
    distance_unit: distance_unit === 'mi' || distance_unit === 'km' ? distance_unit : 'km',
    avg_hr: Number.isFinite(hr) ? hr : null,
    notes: notes ? String(notes).trim() : null,
    is_template: is_template ? 1 : 0,
  };
}
