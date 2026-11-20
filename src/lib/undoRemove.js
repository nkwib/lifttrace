// Pure helpers for the "Undo" toast after removing a set or an exercise.
// They take the CURRENT list and return a new one, so an undo never writes
// back a stale snapshot.

import { newUuid, withFreshIds } from './workout-uuid.js';

// Undone entries get NEW uuids: the removal already put the old ones in the
// server's workout_tombstones, and the merge drops tombstoned uuids
// ("do not resurrect"), so reinserting the original would be dropped on save.
// Callers guard against a double undo (the toast action runs once).

function clampIdx(i, len) {
  const n = Number.isInteger(i) ? i : len;
  return Math.max(0, Math.min(n, len));
}

/** Put a removed set back at its original index, with a fresh uuid. */
export function reinsertSet(sets, set, origIdx) {
  const cur = Array.isArray(sets) ? sets : [];
  if (!set) return cur;
  const out = cur.slice();
  out.splice(clampIdx(origIdx, cur.length), 0, { ...set, uuid: newUuid() });
  return out;
}

/** Put a removed exercise back at its original index, with fresh exercise and
 *  set uuids. When the superset it belonged to has no other member
 *  left, the superset link is cleared so it does not come back as a group of one. */
export function reinsertExercise(exercises, ex, origIdx) {
  const cur = Array.isArray(exercises) ? exercises : [];
  if (!ex) return cur;
  let item = withFreshIds([ex])[0];
  if (ex.superset_id != null && !cur.some(e => e && e.superset_id === ex.superset_id)) {
    item = { ...item };
    delete item.superset_id;
    delete item.superset_size;
  }
  const out = cur.slice();
  out.splice(clampIdx(origIdx, cur.length), 0, item);
  return out;
}
