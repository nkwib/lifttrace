/**
 * supersetRounds.js: a superset laid out the way it is lifted, round by
 * round (A, B, C, then A, B, C again), instead of one exercise after the
 * other.
 *
 * Rounds go by the rule the rest timer and the rest notification already
 * use (Diary.svelte _shouldStartRest, rest-next.js): a working set's round
 * is its own `number` when it has one, else its place among the exercise's
 * working sets. So an uneven pairing (an add-on set, a drop set moved to
 * round 3) shows in the round it is lifted in, and an exercise sitting a
 * round out is simply not in it. Warm-ups are in no round.
 *
 * Pure, so it is tested on its own (scripts/superset-rounds.test.js).
 */
import { setAfter } from './workout.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A, B, C… for a member's place in the superset. */
export function memberLetter(i) {
  return LETTERS[i] ?? String(i + 1);
}

/** Working sets with the round each goes by, and where it sits in `sets`. */
export function numberedWorkingSets(ex) {
  let auto = 0;
  const out = [];
  (ex?.sets || []).forEach((set, setIdx) => {
    if (!set || set.warmup) return;
    auto += 1;
    out.push({ set, setIdx, number: set.number != null ? Number(set.number) : auto });
  });
  return out;
}

/**
 * The superset's sets as warm-ups and rounds.
 *
 *   warmups  [{ member, setIdx, set }], member order
 *   rounds   [{ number, entries: [{ member, setIdx, set }], done }], by number
 *   current  the earliest round with a set still to do, or null when all are
 *   next     { member, setIdx } of the set to lift next: in the current
 *            round, the first exercise of the group with it still to do, as
 *            the rest timer's "next up" picks (rest-next.js nextInGroup)
 *   count    the highest round, the "of 4" in "Round 2 of 4"
 */
export function supersetRounds(members) {
  const list = Array.isArray(members) ? members : [];
  const warmups = [];
  const byNumber = new Map();
  list.forEach((ex, member) => {
    (ex?.sets || []).forEach((set, setIdx) => {
      if (set?.warmup) warmups.push({ member, setIdx, set });
    });
    for (const n of numberedWorkingSets(ex)) {
      if (!byNumber.has(n.number)) byNumber.set(n.number, []);
      byNumber.get(n.number).push({ member, setIdx: n.setIdx, set: n.set });
    }
  });
  const rounds = [...byNumber.keys()].sort((a, b) => a - b).map(number => {
    const entries = byNumber.get(number);
    return { number, entries, done: entries.every(e => e.set.completed) };
  });
  const current = rounds.find(r => !r.done) || null;
  const nextEntry = current ? current.entries.find(e => !e.set.completed) : null;
  return {
    warmups,
    rounds,
    current: current ? current.number : null,
    next: nextEntry ? { member: nextEntry.member, setIdx: nextEntry.setIdx } : null,
    count: rounds.length ? rounds[rounds.length - 1].number : 0,
  };
}

/**
 * One more round: every member gets the set "Add Set" would give it, all in
 * the round after the last one. A member whose sets were renumbered (so its
 * next place is not that round) gets the round as the set's `number`, or the
 * new set would land in a round that already has one of its sets.
 * Returns the members as they read after, in the same order.
 */
export function withRoundAdded(members) {
  const list = members || [];
  const round = supersetRounds(list).count + 1;
  return list.map(ex => {
    const sets = ex.sets || [];
    const next = setAfter(sets);
    const place = numberedWorkingSets(ex).length + 1;
    if (place !== round) next.number = round;
    return { ...ex, sets: [...sets, next] };
  });
}
