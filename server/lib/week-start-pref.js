import db from '../db.js';
import { readSettingRaw } from './secret-settings.js';
import { normalizeWeekStart } from '../../src/lib/week-start.js';

/** The user's week start ('monday' | 'sunday'); Monday when unset, invalid or no account. */
export function userWeekStart(userId) {
  if (userId == null) return 'monday';
  const row = db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, 'weekStartsOn');
  return normalizeWeekStart(row ? readSettingRaw('weekStartsOn', row.value) : null);
}
