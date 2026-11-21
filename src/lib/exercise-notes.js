export const EXERCISE_NOTE_MAX = 500;
export const EXERCISE_NOTES_MAX_ENTRIES = 500;

/** Trim and cap a standing exercise note; '' means "no note". */
export function cleanNote(text) {
  return String(text ?? '').trim().slice(0, EXERCISE_NOTE_MAX).trim();
}

/** The notes map with `id` set to the cleaned `text` (empty deletes). A new
 *  entry past the entry cap is refused (map returned unchanged). */
export function withNote(map, id, text) {
  const next = { ...(map || {}) };
  const note = cleanNote(text);
  const key = String(id);
  if (!note) delete next[key];
  else if (key in next || Object.keys(next).length < EXERCISE_NOTES_MAX_ENTRIES) next[key] = note;
  return next;
}
