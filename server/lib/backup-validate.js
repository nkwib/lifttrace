// Pre-flight check for a restore archive: runs before anything is wiped.
import AdmZip from 'adm-zip';

export const ZIP_MAX_ENTRIES = 50_000;
export const ZIP_MAX_UNCOMPRESSED_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

function reject(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// AdmZip throws on a file that is not a zip: that is the caller's mistake, 400.
export function openBackupZip(file) {
  try { return new AdmZip(file); }
  catch { throw reject('Backup rejected: not a valid zip file.'); }
}

// Returns the parsed database.json. Throws an Error with status 400 when the
// archive is not a usable LiftTrace backup. Sizes come from zip headers (no
// inflating); the extraction loop keeps its own running total as a backstop.
export function checkBackupArchive(zip, { maxEntries = ZIP_MAX_ENTRIES, maxBytes = ZIP_MAX_UNCOMPRESSED_BYTES } = {}) {
  const entries = zip.getEntries();
  if (entries.length > maxEntries) {
    throw reject(`Backup rejected: too many entries (${entries.length} > ${maxEntries}).`);
  }
  let total = 0;
  for (const e of entries) total += e.header?.size || 0;
  if (total > maxBytes) {
    throw reject(`Backup rejected: uncompressed size exceeds ${Math.floor(maxBytes / 1024 / 1024 / 1024)} GB.`);
  }
  const entry = zip.getEntry('database.json');
  if (!entry || entry.isDirectory) throw reject('Backup rejected: database.json is missing.');
  let data;
  try { data = JSON.parse(zip.readAsText(entry)); }
  catch { throw reject('Backup rejected: database.json is not valid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || !Array.isArray(data.users) || !Array.isArray(data.workout_log)) {
    throw reject('Backup rejected: database.json is not a LiftTrace backup (users and workout_log must be lists).');
  }
  return data;
}
