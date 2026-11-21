// Seed data through the API so pages have something to render. Dense enough
// that Statistics, Records and the exercise detail panels draw real charts.
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function seedBasics(client, { weeks = 12 } = {}) {
  // A fresh install has an empty library (sources are imported on demand).
  const lifts = [];
  for (const [name, category, muscles, equipment] of [
    ['Barbell Bench Press', 'strength', ['chest'], ['barbell']],
    ['Barbell Back Squat', 'strength', ['quadriceps'], ['barbell']],
    ['Romanian Deadlift With A Long Descriptive Name', 'strength', ['hamstrings'], ['barbell']],
  ]) lifts.push(await client.call('POST', '/api/exercises', { name, category, primary_muscles: muscles, equipment }));
  // Three sessions a week, slowly progressing, with a stall near the end.
  for (let w = weeks - 1; w >= 0; w--) {
    for (const [i, offset] of [0, 2, 4].entries()) {
      const ex = lifts[i % lifts.length];
      const base = 60 + (weeks - w) * 2.5 - (w < 2 ? 2.5 : 0);
      await client.call('PUT', `/api/workout/${day(w * 7 + offset)}`, {
        name: `Session ${i + 1}`,
        completed: 1,
        duration_min: 45,
        exercises: lifts.map((e, j) => ({
          exercise_id: e.id,
          name: e.name,
          sets: [5, 5, 3].map((reps, k) => ({ weight: base + j * 10 + k * 5, reps, completed: true })),
        })).sort((a) => (a.exercise_id === ex.id ? -1 : 1)),
      });
    }
  }
  await client.call('PUT', '/api/body-stats', { date: day(0), weight: 80 }).catch(() => {});
  const programs = await client.call('GET', '/api/programs').catch(() => []);
  const progList = Array.isArray(programs) ? programs : (programs.programs || []);
  return { exerciseId: lifts[0].id, exercises: lifts, programId: progList[0]?.id || null };
}
