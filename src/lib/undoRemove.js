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

// Set clips are keyed by exercise_uuid + set_uuid, and undo mints new uuids,
// so each *WithMap variant also returns { oldUuid: newUuid } for every
// exercise and set it re-keyed. The plain variants keep returning the list.

function mapIds(oldExs, newExs) {
  const uuidMap = {};
  oldExs.forEach((o, i) => {
    const n = newExs[i];
    if (!o || !n) return;
    if (o.uuid) uuidMap[o.uuid] = n.uuid;
    (Array.isArray(o.sets) ? o.sets : []).forEach((s, j) => {
      const ns = Array.isArray(n.sets) ? n.sets[j] : null;
      if (s && s.uuid && ns) uuidMap[s.uuid] = ns.uuid;
    });
  });
  return uuidMap;
}

/** Put a removed set back at its original index, with a fresh uuid. */
export function reinsertSetWithMap(sets, set, origIdx) {
  const cur = Array.isArray(sets) ? sets : [];
  if (!set) return { list: cur, uuidMap: {} };
  const out = cur.slice();
  const fresh = { ...set, uuid: newUuid() };
  out.splice(clampIdx(origIdx, cur.length), 0, fresh);
  return { list: out, uuidMap: set.uuid ? { [set.uuid]: fresh.uuid } : {} };
}

export function reinsertSet(sets, set, origIdx) {
  return reinsertSetWithMap(sets, set, origIdx).list;
}

/** Put a removed exercise back at its original index, with fresh exercise and
 *  set uuids. When the superset it belonged to has no other member
 *  left, the superset link is cleared so it does not come back as a group of one. */
export function reinsertExerciseWithMap(exercises, ex, origIdx) {
  const cur = Array.isArray(exercises) ? exercises : [];
  if (!ex) return { list: cur, uuidMap: {} };
  const fresh = withFreshIds([ex])[0];
  let item = fresh;
  if (ex.superset_id != null && !cur.some(e => e && e.superset_id === ex.superset_id)) {
    item = { ...item };
    delete item.superset_id;
    delete item.superset_size;
  }
  const out = cur.slice();
  out.splice(clampIdx(origIdx, cur.length), 0, item);
  return { list: out, uuidMap: mapIds([ex], [fresh]) };
}

export function reinsertExercise(exercises, ex, origIdx) {
  return reinsertExerciseWithMap(exercises, ex, origIdx).list;
}

/** Put a removed superset back. `removed` is [{ ex, idx }] with original
 *  indices. Inserts ascending (clamped), fresh exercise and set uuids, and
 *  keeps superset_id/superset_size (the whole group returns together). */
export function reinsertExercisesWithMap(exercises, removed) {
  const cur = Array.isArray(exercises) ? exercises : [];
  const list = (Array.isArray(removed) ? removed : []).filter(r => r && r.ex);
  if (!list.length) return { list: cur, uuidMap: {} };
  const fresh = withFreshIds(list.map(r => r.ex));
  const out = cur.slice();
  list
    .map((r, k) => ({ item: fresh[k], idx: r.idx }))
    .sort((a, b) => a.idx - b.idx)
    .forEach(({ item, idx }) => out.splice(clampIdx(idx, out.length), 0, item));
  return { list: out, uuidMap: mapIds(list.map(r => r.ex), fresh) };
}

export function reinsertExercises(exercises, removed) {
  return reinsertExercisesWithMap(exercises, removed).list;
}

/** Clips attached to any of the removed uuids (exercise or set level).
 *  Capture at removal time: the Diary reloads its clip list on date change. */
export function clipsForUuids(media, uuids) {
  const want = new Set((uuids || []).filter(Boolean));
  return (Array.isArray(media) ? media : [])
    .filter(m => m && m.id != null && (want.has(m.set_uuid) || want.has(m.exercise_uuid)));
}

/** PATCH bodies that move each captured clip onto the re-keyed uuids. */
export function relinkPlan(clips, uuidMap) {
  const map = uuidMap || {};
  return (Array.isArray(clips) ? clips : [])
    .map(m => ({
      id: m.id,
      exercise_uuid: map[m.exercise_uuid] || m.exercise_uuid,
      set_uuid: m.set_uuid ? (map[m.set_uuid] || m.set_uuid) : null,
      changed: !!(map[m.exercise_uuid] || (m.set_uuid && map[m.set_uuid])),
    }))
    .filter(b => b.changed)
    .map(({ changed, ...b }) => b);
}
