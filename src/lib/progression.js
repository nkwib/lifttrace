// Pure "what to try next" rule for the Diary progression chip. No svelte or
// i18n imports: returns a reasonKey + values so the caller translates.
import { normalizeEquipment } from './equipment.js';
import { estimateOneRm } from './one-rm.js';
import { setKind, setReps } from './workout.js';

// [kg, lb] per equipment bucket. Unknown or Other keeps the flat step.
const STEPS = {
  Barbell: [2.5, 5],
  Dumbbell: [2, 5],
  Cable: [5, 10],
  Machine: [5, 10],
};
const FLAT = [2.5, 5];

/** "8-12", "8 – 12" -> {min:8,max:12}; "10" -> {min:10,max:10}; else null. */
export function parseRepTarget(target) {
  const s = String(target ?? '').trim();
  let m = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  m = s.match(/^(\d+)$/);
  if (m) { const n = parseInt(m[1], 10); return { min: n, max: n }; }
  return null;
}

export function incrementFor(unit, equipment) {
  const bucket = normalizeEquipment(equipment);
  const [kg, lb] = STEPS[bucket] || FLAT;
  return unit === 'kg' ? kg : lb;
}

/**
 * lastSets: last session's completed sets. Reps are read through `repsOf`
 * (pass workout.js setReps so split L/R reps are honoured).
 * Returns { weight, step, reasonKey, values } or null.
 */
export function nextTarget({ targetReps, lastSets, unit = 'lbs', equipment = '', loadType, repsOf } = {}) {
  const tgt = parseRepTarget(targetReps);
  if (!tgt || !Array.isArray(lastSets)) return null;
  // Assisted lifts progress by lowering the assist, so adding weight is wrong.
  if (/assisted/i.test(String(equipment))) return null;
  const read = repsOf || (s => s.reps);
  const working = lastSets.filter(s => s && !s.warmup && (parseInt(read(s)) || 0) > 0);
  if (!working.length) return null;
  if (!working.every(s => (parseInt(read(s)) || 0) >= tgt.max)) return null;
  const lastWeight = Math.max(...working.map(s => parseFloat(s.weight) || 0));
  if (!lastWeight) return null;
  const step = incrementFor(unit, equipment);
  return {
    weight: lastWeight + step,
    step,
    reasonKey: tgt.min === tgt.max ? 'diary.progression.reason_target' : 'diary.progression.reason_range',
    values: { reps: tgt.max, step },
  };
}

const DAY_MS = 86400000;
const dayNumber = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS : null;
};
const localToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

/**
 * Has this rep-based lift gone `sessions` sessions (spanning >= minDays) with
 * no new best e1RM? history: [{date:'YYYY-MM-DD', set_type, sets}] in any
 * order; same-date entries count as one session. Returns
 * { sessions, days, lastWeight, suggestedWeight, step, date } or null.
 * Null for assisted or bodyweight-only lifts, fewer than sessions+1 usable
 * sessions, and when the window sits well below the old best (post-deload).
 */
export function detectStall(history, { sessions = 4, minDays = 14, unit = 'lbs', equipment = '', today = localToday() } = {}) {
  if (!Array.isArray(history) || /assisted/i.test(String(equipment))) return null;
  const todayN = dayNumber(today);
  const byDate = new Map();
  for (const h of history) {
    const day = dayNumber(h?.date);
    if (day === null || (todayN !== null && day > todayN)) continue;
    for (const s of h.sets || []) {
      if (!s || !s.completed || s.warmup || setKind({ set_type: h.set_type }, s) !== 'reps') continue;
      const weight = parseFloat(s.weight) || 0;
      const e1rm = estimateOneRm(weight, setReps(s));
      if (e1rm === null) continue;
      const cur = byDate.get(day) || { day, date: String(h.date).slice(0, 10), best: 0, top: 0 };
      cur.best = Math.max(cur.best, e1rm);
      cur.top = Math.max(cur.top, weight);
      byDate.set(day, cur);
    }
  }
  const days = [...byDate.values()].sort((a, b) => a.day - b.day);
  if (days.length < sessions + 1) return null;
  const win = days.slice(-sessions);
  const prior = days.slice(0, -sessions);
  const span = win[win.length - 1].day - win[0].day;
  if (span < minDays) return null;
  const r1 = (v) => Math.round(v * 10) / 10;
  const priorBest = r1(Math.max(...prior.map(d => d.best)));
  const winBest = r1(Math.max(...win.map(d => d.best)));
  if (winBest > priorBest) return null;
  if (winBest < priorBest * 0.97) return null;
  const last = win[win.length - 1];
  if (!last.top) return null;
  const step = incrementFor(unit, equipment);
  let suggested = Math.max(step, Math.floor((last.top * 0.9) / step) * step);
  if (suggested >= last.top) suggested = last.top - step;
  if (suggested <= 0) return null;
  return { sessions, days: span, lastWeight: last.top, suggestedWeight: suggested, step, date: last.date };
}
