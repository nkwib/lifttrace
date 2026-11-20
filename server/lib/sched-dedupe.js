/**
 * Send-marker dedupe for the scheduler. Markers live in a store (app_config in
 * production) so a restart inside a due window does not resend. Sync API; the
 * in-memory Map is the source of truth at runtime and a store failure never
 * throws (falls back to memory only).
 */
export const SCHED_PREFIX = 'sched:';
export const SCHED_MAX_AGE_MS = 7 * 24 * 3600000;

export function createRanRecently(store, now = Date.now) {
  const cache = new Map();
  return function ranRecently(userId, task, windowMs) {
    const key = `${SCHED_PREFIX}${userId || 0}:${task}`;
    const t = now();
    let last = cache.get(key);
    if (last === undefined) {
      try { last = store.get(key); } catch { last = undefined; }
    }
    if (last && t - last < windowMs) { cache.set(key, last); return true; }
    cache.set(key, t);
    try { store.set(key, t); } catch { /* memory fallback */ }
    return false;
  };
}

export function dbStore(db) {
  const sel = db.prepare('SELECT value FROM app_config WHERE key = ?');
  const up = db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  return {
    get: (key) => { const r = sel.get(key); return r ? Number(r.value) || undefined : undefined; },
    set: (key, t) => { up.run(key, String(t)); },
  };
}

// Drop markers older than the longest window. Values are epoch ms strings.
export function pruneMarkers(db, now = Date.now()) {
  try {
    db.prepare("DELETE FROM app_config WHERE key LIKE 'sched:%' AND CAST(value AS INTEGER) < ?").run(now - SCHED_MAX_AGE_MS);
  } catch { /* best effort */ }
}
