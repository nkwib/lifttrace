import db from '../db.js';
import { readSettingRaw } from './secret-settings.js';
import { normalizeWeekStart, WEEK_STARTS } from '../../src/lib/week-start.js';

/**
 * The user's week start ('monday' | 'sunday'); Monday when unset or invalid.
 * Without an account (no-accounts mode) nothing is stored server side, so the
 * client's `week_start` query value is honoured when valid. With an account the
 * stored setting stays authoritative and the query value is ignored (a stale
 * client cannot disagree with the server).
 */
export function userWeekStart(userId, queryValue) {
  if (userId == null) {
    return typeof queryValue === 'string' && WEEK_STARTS.includes(queryValue) ? queryValue : 'monday';
  }
  const row = db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, 'weekStartsOn');
  return normalizeWeekStart(row ? readSettingRaw('weekStartsOn', row.value) : null);
}
