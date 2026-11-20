/**
 * import-match.js: pairs a workout file's sessions with the sessions the
 * user already has, for the workout importer (preview and commit share it).
 *
 * Sessions are keyed by (date, name). The n-th file session of a key pairs
 * with the n-th existing one (existing rows in session_seq, id order), so two
 * same-name same-day sessions import as two and a re-import lines each up
 * with its own copy. Pure: `existingByKey` is read before anything is
 * written, so rows the import itself inserts never count as matches.
 */

export const importName = w => w.name || 'Imported';
export const importKey = (date, name) => `${date}\u0000${name}`;

/** Distinct [date, name] pairs in a parsed file. */
export function importKeys(workouts) {
  const seen = new Map();
  for (const w of workouts) {
    const name = importName(w);
    const k = importKey(w.date, name);
    if (!seen.has(k)) seen.set(k, [w.date, name]);
  }
  return [...seen.values()];
}

/** [{ w, name, existing }] in file order; existing is null when there is
 *  no n-th live row for the key. */
export function planImport(workouts, existingByKey) {
  const seen = new Map();
  return workouts.map(w => {
    const name = importName(w);
    const k = importKey(w.date, name);
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    return { w, name, existing: (existingByKey.get(k) || [])[n] || null };
  });
}
