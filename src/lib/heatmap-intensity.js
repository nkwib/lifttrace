/**
 * heatmap-intensity.js: how hard each trained day was, for the Statistics
 * heatmap shading (training-depth plan item 6). Display only: which days are
 * trained still comes from trained-day.js.
 *
 * A day's size is its summed duration_min, or its completed working sets
 * (same rule as hasWorkingSet: completed, not a warm-up) when the window has
 * no usable durations. Minutes and set counts are never ranked together: one
 * metric is picked for the whole window, minutes when most trained days have
 * them, else sets. Days that lack the chosen metric get level 1.
 *
 * Levels 1..4 come from each day's mid-rank percentile among the user's own
 * days, so ties share a level and outliers do not flatten the rest. A lone
 * day (or all days equal) lands on level 3. Pure, no imports beyond
 * trained-day.js.
 */
import { exercisesOf, workoutCounts } from './trained-day.js';

/** One workout's minutes are capped here so a forgotten timer is not a day's whole scale. */
export const MAX_WORKOUT_MIN = 300;

function workingSets(row) {
  let n = 0;
  for (const ex of exercisesOf(row)) {
    for (const s of ex?.sets || []) if (s && s.completed && !s.warmup) n++;
  }
  return n;
}

/**
 * @param {object[]} workouts workout_log rows ({ date, duration_min, exercises, deleted_at })
 * @returns {Map<string,{level:number,minutes:number,sets:number,metric:'minutes'|'sets'}>}
 *   only days with a counting workout; callers treat other trained days
 *   (cardio only) as level 1.
 */
export function dayIntensity(workouts) {
  const days = new Map();
  for (const w of workouts || []) {
    if (!w?.date || !workoutCounts(w)) continue;
    const d = String(w.date).slice(0, 10);
    const cur = days.get(d) || { minutes: 0, sets: 0 };
    const m = Number(w.duration_min);
    if (Number.isFinite(m) && m > 0) cur.minutes += Math.min(m, MAX_WORKOUT_MIN);
    cur.sets += workingSets(w);
    days.set(d, cur);
  }
  const withMinutes = [...days.values()].filter(v => v.minutes > 0).length;
  const metric = days.size > 0 && withMinutes * 2 > days.size ? 'minutes' : 'sets';
  const vals = [...days.values()].map(v => v[metric]).filter(v => v > 0).sort((a, b) => a - b);
  const out = new Map();
  for (const [d, v] of days) {
    const x = v[metric];
    let level = 1;
    if (x > 0) {
      const below = vals.filter(y => y < x).length;
      const equal = vals.filter(y => y === x).length;
      const p = (below + equal / 2) / vals.length;
      level = Math.min(4, 1 + Math.floor(p * 4));
    }
    out.set(d, { level, minutes: Math.round(v.minutes), sets: v.sets, metric });
  }
  return out;
}
