// Effort scale: set.rpe stays the canonical number (RPE). A set logged as
// reps in reserve also stores set.rpe_scale = 'rir', and RIR n is rpe 10 - n.
// RIR "5+" is rpe 5 (an exact RIR 5 is not told apart from it). Half RPEs
// (7.5, 8.5, 9.5) have no whole RIR: they are never written from the RIR
// picker, and a set holding one shows as RPE by its own scale.

export const RIR_VALUES = [0, 1, 2, 3, 4, 5];
export const RIR_MAX = 5;

export function rirToRpe(rir) {
  const n = Number(rir);
  if (rir == null || rir === '' || !Number.isFinite(n)) return null;
  return 10 - Math.min(RIR_MAX, Math.max(0, Math.round(n)));
}

// Whole RIR for a stored RPE (5 and below is the "5+" bucket); halves round
// to the nearest whole RIR, ties toward the harder set. null for no value.
export function rpeToRir(rpe) {
  const n = Number(rpe);
  if (rpe == null || rpe === '' || !Number.isFinite(n)) return null;
  return Math.min(RIR_MAX, Math.max(0, Math.floor(10 - n + 0.5 - 1e-9)));
}

// The scale a set is shown in: its own, never the current setting. Sets
// without rpe_scale were logged as RPE.
export function setScale(set) {
  return set && set.rpe_scale === 'rir' ? 'rir' : 'rpe';
}

// Chip text: "@8" for RPE, "R2" / "R5+" for RIR (the chip column is narrow;
// the full wording is in the title).
export function effortChip(set) {
  if (!set || set.rpe == null) return null;
  if (setScale(set) === 'rir') {
    const r = rpeToRir(set.rpe);
    return r === RIR_MAX ? 'R5+' : `R${r}`;
  }
  return `@${set.rpe}`;
}

export function rirLabel(rir) {
  return rir >= RIR_MAX ? '5+' : String(rir);
}

// Colour level: 'easy' | 'moderate' | 'hard' | 'max' (by reps left).
export function effortLevel(rpe) {
  const r = rpeToRir(rpe);
  if (r == null) return null;
  return r === 0 ? 'max' : r === 1 ? 'hard' : r <= 3 ? 'moderate' : 'easy';
}

// The set with a new effort value from the given scale; null clears both
// rpe and rpe_scale.
export function withEffort(set, scale, value) {
  const { rpe_scale, ...rest } = set;
  if (value == null) return { ...rest, rpe: null };
  if (scale === 'rir') return { ...rest, rpe: rirToRpe(value), rpe_scale: 'rir' };
  return { ...rest, rpe: value };
}
