/**
 * A superset laid out round by round (src/lib/supersetRounds.js): which set
 * sits in which round, which round is current, what is next, and adding a
 * round. "Next" has to agree with the rest timer's "next up"
 * (rest-next.js), so that is checked against it directly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const { supersetRounds, withRoundAdded, memberLetter, numberedWorkingSets } = await import('../src/lib/supersetRounds.js');
const { nextUp } = await import('../src/lib/rest-next.js');

const set = (weight, reps, over = {}) => ({ weight, reps, completed: false, ...over });
const done = (weight, reps, over = {}) => set(weight, reps, { completed: true, ...over });
const ex = (id, name, sets) => ({ exercise_id: id, exercise_name: name, superset_id: 's1', superset_size: 3, sets });

const pick = (r) => r.entries.map(e => `${memberLetter(e.member)}${e.setIdx}`).join(' ');

test('letters follow the members', () => {
  assert.equal(memberLetter(0), 'A');
  assert.equal(memberLetter(2), 'C');
  assert.equal(memberLetter(26), '27');
});

test('three exercises interleave A B C per round', () => {
  const members = [
    ex(1, 'Bench', [set(80, 8), set(80, 8), set(80, 8)]),
    ex(2, 'Row', [set(60, 10), set(60, 10), set(60, 10)]),
    ex(3, 'Curl', [set(14, 12), set(14, 12), set(14, 12)]),
  ];
  const r = supersetRounds(members);
  assert.deepEqual(r.rounds.map(x => x.number), [1, 2, 3]);
  assert.equal(pick(r.rounds[0]), 'A0 B0 C0');
  assert.equal(pick(r.rounds[2]), 'A2 B2 C2');
  assert.equal(r.current, 1);
  assert.deepEqual(r.next, { member: 0, setIdx: 0 });
  assert.equal(r.count, 3);
});

test('warm-ups stay out of the rounds and do not shift numbering', () => {
  const members = [
    ex(1, 'Bench', [done(20, 10, { warmup: true }), set(40, 5, { warmup: true }), set(80, 8), set(80, 8)]),
    ex(2, 'Row', [set(60, 10), set(60, 10)]),
  ];
  const r = supersetRounds(members);
  assert.deepEqual(r.warmups.map(w => `${memberLetter(w.member)}${w.setIdx}`), ['A0', 'A1']);
  assert.equal(pick(r.rounds[0]), 'A2 B0');
  assert.equal(pick(r.rounds[1]), 'A3 B1');
  assert.deepEqual(numberedWorkingSets(members[0]).map(n => n.number), [1, 2]);
});

test('current and next move through the round, then to the next round', () => {
  const members = [
    ex(1, 'Bench', [done(80, 8), set(80, 8)]),
    ex(2, 'Row', [set(60, 10), set(60, 10)]),
  ];
  let r = supersetRounds(members);
  assert.equal(r.current, 1);
  assert.deepEqual(r.next, { member: 1, setIdx: 0 });
  members[1].sets[0].completed = true;
  r = supersetRounds(members);
  assert.equal(r.rounds[0].done, true);
  assert.equal(r.current, 2);
  assert.deepEqual(r.next, { member: 0, setIdx: 1 });
});

test('all done: no current round, nothing next', () => {
  const r = supersetRounds([ex(1, 'Bench', [done(80, 8)]), ex(2, 'Row', [done(60, 10)])]);
  assert.equal(r.current, null);
  assert.equal(r.next, null);
  assert.equal(r.count, 1);
});

test('an uneven pairing: a renumbered set lands in its round, a member can sit one out', () => {
  const members = [
    ex(1, 'Bench', [set(80, 8), set(80, 8), set(80, 8)]),
    // Row skips round 2: its second set is numbered 3.
    ex(2, 'Row', [set(60, 10), set(60, 10, { number: 3 })]),
  ];
  const r = supersetRounds(members);
  assert.deepEqual(r.rounds.map(x => x.number), [1, 2, 3]);
  assert.equal(pick(r.rounds[1]), 'A1');
  assert.equal(pick(r.rounds[2]), 'A2 B1');
});

test('next agrees with the rest timer\'s next up', () => {
  const cases = [
    [[done(80, 8), set(80, 8)], [done(60, 10), set(60, 10)], [set(14, 12), set(14, 12)]],
    [[done(80, 8), done(80, 8)], [done(60, 10), set(60, 10)], [done(14, 12), set(14, 12)]],
    [[done(80, 8), set(80, 8)], [done(60, 10), set(60, 10, { number: 3 })], [done(14, 12), set(14, 12)]],
  ];
  for (const [a, b, c] of cases) {
    const members = [ex(1, 'Bench', a), ex(2, 'Row', b), ex(3, 'Curl', c)];
    const r = supersetRounds(members);
    const up = nextUp(members, 0);
    assert.equal(up.name, members[r.next.member].exercise_name);
    assert.equal(up.number, r.current);
    assert.equal(up.count, r.count);
  }
});

test('adding a round gives every member one set, in the new round', () => {
  const members = [
    ex(1, 'Bench', [done(80, 8), done(82.5, 6)]),
    ex(2, 'Row', [done(60, 10), done(60, 10)]),
    ex(3, 'Plank', [{ duration_sec: 45, weight: 0, completed: true }, { duration_sec: 50, weight: 0, completed: true }]),
  ];
  const after = withRoundAdded(members);
  assert.deepEqual(after.map(e => e.sets.length), [3, 3, 3]);
  assert.deepEqual(after[0].sets[2], { reps: 6, weight: 82.5, completed: false, notes: '' });
  assert.equal(after[2].sets[2].duration_sec, 50);
  const r = supersetRounds(after);
  assert.equal(r.count, 3);
  assert.equal(pick(r.rounds[2]), 'A2 B2 C2');
  assert.equal(r.current, 3);
  // The originals are left as they were.
  assert.equal(members[0].sets.length, 2);
});

test('adding a round after a renumbered set does not land on a taken round', () => {
  const members = [
    ex(1, 'Bench', [done(80, 8), done(80, 8), done(80, 8)]),
    ex(2, 'Row', [done(60, 10), done(60, 10, { number: 3 })]),
  ];
  const after = withRoundAdded(members);
  const r = supersetRounds(after);
  assert.equal(r.count, 4);
  assert.equal(pick(r.rounds[r.rounds.length - 1]), 'A3 B2');
  assert.equal(after[0].sets[3].number, undefined);
  assert.equal(after[1].sets[2].number, 4);
});

test('a member with no sets yet: in no round, and gets one when a round is added', () => {
  const members = [ex(1, 'Bench', [set(80, 8)]), ex(2, 'Row', [])];
  assert.equal(pick(supersetRounds(members).rounds[0]), 'A0');
  const after = withRoundAdded(members);
  assert.equal(after[1].sets.length, 1);
  // Round 2 for both: Row's first set is put there explicitly.
  assert.equal(after[1].sets[0].number, 2);
  assert.equal(pick(supersetRounds(after).rounds[1]), 'A1 B0');
});
