/**
 * server/lib/mcp/_util.js
 *
 * Shared helpers for the MCP tool implementations. Extracted so any
 * hardening (date handling, error envelope tweaks) lives in one place
 * instead of drifting across tool files. Ported from NutriTrace's
 * server/lib/mcp/_util.js — fully generic, no app-specific logic.
 */
import { withoutPrivateFields } from '../private-fields.js';
import { userToday } from '../user-zone.js';
import { shiftDate } from '../weekly-summary.js';

/**
 * Safely parse a JSON string; return `fallback` on any error.
 *
 * Also returns `fallback` when the parsed value is JSON `null` — a
 * literal `'null'` in a DB column is functionally "no value" for our
 * callers, and returning bare null would turn every downstream
 * .map / .reduce / .keys call into a TypeError. Explicit `false`, `0`,
 * `''` all pass through unchanged.
 */
export function safeJson(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v == null ? fallback : v;
  } catch { return fallback; }
}

/**
 * YYYY-MM-DD in server-local time. Only the fallback for a caller with no
 * account (todayFor reads the account's own zone, the way the app does).
 */
export function todayLocal() {
  return new Date().toLocaleDateString('sv-SE');
}

/** YYYY-MM-DD `days` days before today in server-local time. See todayLocal. */
export function daysAgoLocal(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv-SE');
}

/**
 * Today (YYYY-MM-DD) for `userId`, in the zone their app said last (see
 * lib/user-zone.js), else the server's. A null userId gives the server's.
 * `now` is injectable for tests.
 */
export function todayFor(userId, now = Date.now()) {
  return userToday(userId, { now });
}

/** YYYY-MM-DD `days` days before todayFor(userId): calendar arithmetic, no zone. */
export function daysAgoFor(userId, days, now = Date.now()) {
  return shiftDate(todayFor(userId, now), -days);
}

/**
 * Standard MCP error result. `isError: true` means "the tool ran but
 * couldn't do what was asked" — protocol-level errors (unknown tool,
 * malformed JSON-RPC) are returned as JSON-RPC error objects by the
 * SDK itself and don't come through here. With a `code`, structuredContent
 * carries { error, code } too, the same pair the REST API returns; the
 * text stays the message alone.
 */
export function toolError(message, code) {
  const result = { content: [{ type: 'text', text: message }], isError: true };
  if (code) result.structuredContent = { error: message, code };
  return result;
}

/**
 * An error a caller may want to tell apart from the others without reading
 * its message, such as cardio being off ('cardio_disabled'). The public
 * REST API returns `code` next to `error` in its 400 body, and an MCP tool
 * returns it in structuredContent. Only errors made this way carry a code
 * out: a database error's own `code` (SQLITE_...) never reaches a caller.
 */
export class CodedError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** The machine-readable code of a CodedError, else undefined. */
export function errorCode(e) {
  return e instanceof CodedError && typeof e.code === 'string' ? e.code : undefined;
}

/**
 * Standard MCP success result carrying both a text rendering (for
 * clients that don't understand structuredContent) and the raw JSON
 * (for clients that do). Matches the pattern the MCP spec recommends
 * for backward compatibility.
 */
export function toolResult(payload) {
  // Never when each field of a row changed (lib/private-fields.js).
  payload = withoutPrivateFields(payload);
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ];
  return day >= 1 && day <= daysInMonth[month - 1];
}

/** Throw unless `value` is a real YYYY-MM-DD calendar date (strings only). */
export function assertDate(value, label = 'date') {
  if (!isCalendarDate(value)) throw new Error(`Invalid ${label} '${String(value)}'; expected YYYY-MM-DD.`);
}

export function validateDateRange(start, end) {
  if ((start != null && !isCalendarDate(start)) || (end != null && !isCalendarDate(end))) {
    return 'Invalid start/end date; expected YYYY-MM-DD.';
  }
  if (start != null && end != null && start > end) {
    return 'Invalid date range; start must be on or before end.';
  }
  return null;
}

/**
 * Fill in the bounds a caller left out. Giving one bound leaves the other
 * open, so `start` alone reads from that date onwards (planned sessions in
 * the future included) and `end` alone reads everything up to it. Only when
 * both are missing does it fall back to a window, the last `defaultDays`
 * ending today, so an unbounded read can't walk someone's whole history by
 * accident. "Today" is the account's (todayFor) when `userId` is given,
 * else the server's.
 */
export function resolveDateRange(start, end, defaultDays = 90, userId = null, now = Date.now()) {
  if (start == null && end == null) {
    return { start: daysAgoFor(userId, defaultDays, now), end: todayFor(userId, now) };
  }
  return { start: start ?? null, end: end ?? null };
}

/**
 * Validate a YYYY-MM-DD string; return the string when valid, or
 * `null` when invalid. Empty / undefined is a caller error and should
 * be handled upstream (each tool decides whether to default to today).
 */
export function validateDate(s) {
  return typeof s === 'string' && DATE_RE.test(s) ? s : null;
}
