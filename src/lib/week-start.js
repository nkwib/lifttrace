/**
 * Which day a week starts on (setting weekStartsOn: 'monday' | 'sunday').
 * One rule for every weekly bucket: server stats and cardio, the phone's
 * copies in api-native.js, and the Statistics page. Pure, no imports, so the
 * server can load it from here too. Dates are calendar days (YYYY-MM-DD), so
 * the maths run in UTC and no time zone moves them.
 */

export const WEEK_STARTS = ['monday', 'sunday'];

/** A stored value as 'monday' or 'sunday'; anything else is Monday. */
export function normalizeWeekStart(v) {
  return v === 'sunday' ? 'sunday' : 'monday';
}

/** The first day of the week a date falls in, as YYYY-MM-DD. */
export function weekStart(date, startsOn = 'monday') {
  const ymd = String(date).slice(0, 10);
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = d.getUTCDay();
  const back = normalizeWeekStart(startsOn) === 'sunday' ? day : (day === 0 ? 6 : day - 1);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Weekday indexes (0 = Sunday .. 6) in display order for the week start. */
export function weekdayOrder(startsOn = 'monday') {
  return normalizeWeekStart(startsOn) === 'sunday' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
}

/** i18n key suffixes under statistics.days, indexed like Date#getDay (0 = Sunday). */
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Empty cells before day 1 in a month grid. month is 0-indexed. */
export function monthLeadingBlanks(year, month, startsOn = 'monday') {
  const dow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return (dow - weekdayOrder(startsOn)[0] + 7) % 7;
}
