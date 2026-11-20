// Reordering for the workout/template editor. A superset is a contiguous run
// of exercises sharing superset_id with superset_size > 1 (same rule as the
// editor's group builder). Standalone exercises hop over a whole run; members
// only swap inside their run, so a group is never torn apart.

function inRun(e) {
  return e && e.superset_id != null && e.superset_size > 1;
}

// [start, end] inclusive of the block containing idx.
export function blockRange(exercises, idx) {
  const e = exercises[idx];
  if (!inRun(e)) return [idx, idx];
  let s = idx;
  let t = idx;
  while (s > 0 && inRun(exercises[s - 1]) && exercises[s - 1].superset_id === e.superset_id) s--;
  while (t < exercises.length - 1 && inRun(exercises[t + 1]) && exercises[t + 1].superset_id === e.superset_id) t++;
  return [s, t];
}

export function canMove(exercises, idx, dir) {
  if (!Array.isArray(exercises) || idx < 0 || idx >= exercises.length) return false;
  const [s, t] = blockRange(exercises, idx);
  if (inRun(exercises[idx])) return dir < 0 ? idx > s : idx < t;
  return dir < 0 ? idx > 0 : idx < exercises.length - 1;
}

// Returns a new array; the input is not mutated. Returns the input unchanged
// (same reference) when the move is not allowed.
export function moveBlock(exercises, idx, dir) {
  if (!canMove(exercises, idx, dir)) return exercises;
  const arr = [...exercises];
  if (inRun(arr[idx])) {
    const j = idx + (dir < 0 ? -1 : 1);
    const a = { ...arr[idx] };
    const b = { ...arr[j] };
    const pa = a.superset_position;
    a.superset_position = b.superset_position;
    b.superset_position = pa;
    arr[idx] = b;
    arr[j] = a;
    // Positions follow array order within the run.
    const [s, t] = blockRange(arr, j);
    for (let i = s; i <= t; i++) {
      if (arr[i].superset_position !== i - s) arr[i] = { ...arr[i], superset_position: i - s };
    }
    return arr;
  }
  const [bs, bt] = blockRange(arr, dir < 0 ? idx - 1 : idx + 1);
  const [item] = arr.splice(idx, 1);
  arr.splice(dir < 0 ? bs : bt, 0, item);
  return arr;
}
