/**
 * local-backup.js — JSON snapshot of the local SQLite database + local
 * uploaded media, produced entirely on-device.
 *
 * Used in Capacitor standalone mode where the server-driven full backup
 * (ZIP of server DB + uploads) isn't reachable. The user gets:
 *   - exportBackup() → write JSON file to device storage + Share sheet
 *   - importBackup(json) → restore from a previously-exported JSON
 *   - listLocalBackups() / deleteLocalBackup(name) for the Settings UI
 *
 * Format (schemaVersion 2, current):
 *   {
 *     version: 2,
 *     app: 'lifttrace',
 *     exportedAt: ISO timestamp,
 *     schemaVersion: 2,
 *     tables: { name: rows[] },
 *     uploads: { 'lifttrace-uploads/<file>': '<base64>' }
 *   }
 *
 * Format (schemaVersion 1, legacy): same shape without the `uploads`
 * field. `importBackup()` reads either — v1 restores DB tables only and
 * leaves the local uploads directory untouched, matching the app's
 * pre-rc.8 behaviour so backups taken on older builds still restore.
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './platform.js';
import { dbQuery, dbExec } from './db-native.js';
import { newestFirst, backupsToPrune } from '../../server/lib/backup-schedule.js';

// Same dir the scheduler writes (Directory.Documents); list/read/delete/share
// and exportBackup all use it so every backup is in one place.
const BACKUP_DIR  = 'lifttrace-backups';
const UPLOADS_DIR = 'lifttrace-uploads';
const SCHEMA_VERSION = 2;
// Taken before a restore overwrites data; pruned apart from the scheduled
// auto backups so neither crowds out the other.
export const SAFETY_PREFIX = 'lifttrace-backup-prerestore-';

const TABLES = [
  'users',
  'user_settings',
  'app_config',
  'ai_chat_history',
  'exercises',
  'programs',
  'workout_templates',
  'program_assignments',
  'workout_log',
  'body_stats_log',
  'cardio_log',
  // Excused days (issue #121). A backup from before them has none, and a
  // restore replaces everything, so it restores none.
  'excused_days',
  'coach_prescriptions',
];

async function _ensureDir(path, directory = Directory.Data) {
  try { await Filesystem.mkdir({ path, directory, recursive: true }); } catch {}
}

/** Read every file in Directory.Data/lifttrace-uploads and return them
 *  as a `{ 'lifttrace-uploads/<name>': '<base64>' }` map. Missing dir
 *  or unreadable files are silently skipped. */
async function _readUploads() {
  const uploads = {};
  let entries;
  try {
    const list = await Filesystem.readdir({ path: UPLOADS_DIR, directory: Directory.Data });
    entries = list?.files || [];
  } catch {
    return uploads;
  }
  for (const f of entries) {
    // Older Capacitor plugin versions return string names; newer ones
    // return { name, type, size, mtime } objects. Handle both.
    const name = typeof f === 'string' ? f : (f?.name || '');
    if (!name) continue;
    try {
      const data = await Filesystem.readFile({
        path: `${UPLOADS_DIR}/${name}`,
        directory: Directory.Data,
      });
      const b64 = typeof data?.data === 'string' ? data.data : '';
      if (b64) uploads[`${UPLOADS_DIR}/${name}`] = b64;
    } catch {}
  }
  return uploads;
}

/**
 * Dump every table + optionally every local upload to a single JSON
 * document.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.includeUploads=true] base64-inline every file
 *   in Directory.Data/lifttrace-uploads. Disable for a smaller,
 *   metadata-only dump (custom-exercise images will restore as broken
 *   references, matching the pre-rc.8 behaviour).
 */
export async function buildBackup(opts = {}) {
  const includeUploads = opts.includeUploads !== false;
  const out = {
    version: SCHEMA_VERSION,
    app: 'lifttrace',
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    tables: {},
  };
  for (const t of TABLES) {
    try { out.tables[t] = await dbQuery(`SELECT * FROM ${t}`, []); }
    catch { out.tables[t] = []; }
  }
  if (includeUploads) {
    out.uploads = await _readUploads();
  }
  return out;
}

/**
 * Write a backup to the device's data directory and (optionally) open
 * the system Share sheet so the user can save it elsewhere (Drive,
 * email, etc.). Set `opts.includeUploads = false` to produce a much
 * smaller metadata-only JSON.
 */
export async function exportBackup({ share = true, includeUploads = true, prefix = 'lifttrace-' } = {}) {
  if (!isNative) throw new Error('Local backup is Capacitor-only');
  await _ensureDir(BACKUP_DIR, Directory.Documents);
  const data = await buildBackup({ includeUploads });
  const json = JSON.stringify(data);
  // Named in this device's own time (TraceApps/notetrace#44).
  const { localFileStamp } = await import('./file-stamp.js');
  const name = `${BACKUP_DIR}/${prefix}${localFileStamp()}.json`;
  const writeRes = await Filesystem.writeFile({
    path: name,
    data: json,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });
  if (share) {
    try {
      await Share.share({
        title: 'LiftTrace backup',
        text: `Backup exported ${data.exportedAt}`,
        url: writeRes?.uri,
        dialogTitle: 'Save LiftTrace backup',
      });
    } catch {} // user cancelled — file is still written
  }
  return { name, path: writeRes?.uri, sizeBytes: json.length };
}

/**
 * Restore from a previously-exported JSON object. Replaces local data
 * entirely — destructive. Caller should confirm with the user first.
 *
 * v2 backups (rc.8+) restore both DB rows and the uploads/ directory.
 * v1 backups (rc.7 and earlier) restore DB rows only — the uploads
 * directory is left untouched so an in-place restore of an older
 * backup doesn't wipe media the user has kept intact.
 */
export async function importBackup(jsonOrText) {
  if (!isNative) throw new Error('Local backup is Capacitor-only');
  const data = typeof jsonOrText === 'string' ? JSON.parse(jsonOrText) : jsonOrText;
  if (!data || data.app !== 'lifttrace' || !data.tables) {
    throw new Error('Not a LiftTrace backup file');
  }
  if (typeof data.tables !== 'object' || Array.isArray(data.tables)) {
    throw new Error('Not a LiftTrace backup file');
  }
  // Validate everything before touching the DB. A table absent from the
  // file is left alone (older backups predate cardio_log etc.); a present
  // but malformed one aborts the restore.
  const present = TABLES.filter(t => data.tables[t] !== undefined && data.tables[t] !== null);
  for (const t of present) {
    if (!Array.isArray(data.tables[t])) throw new Error(`Backup table "${t}" is not a list`);
  }
  // Column names come from the file: keep only real columns of the table.
  const stmts = [];
  const counts = {};
  for (const t of [...present].reverse()) stmts.push({ statement: `DELETE FROM ${t}`, values: [] });
  for (const t of present) {
    const real = new Set((await dbQuery(`PRAGMA table_info(${t})`, [])).map(c => c.name));
    counts[t] = 0;
    for (const row of data.tables[t]) {
      if (!row || typeof row !== 'object') continue;
      const cols = Object.keys(row).filter(c => real.has(c));
      if (!cols.length) continue;
      const vals = cols.map(c => row[c] == null ? null : (typeof row[c] === 'object' ? JSON.stringify(row[c]) : row[c]));
      stmts.push({
        statement: `INSERT OR REPLACE INTO ${t} (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        values: vals,
      });
      counts[t]++;
    }
  }
  // One transaction: any failure rolls back and throws, old data intact.
  if (stmts.length) await dbExec(stmts);
  // v2+: write uploads back so custom-exercise / avatar images round-trip.
  let restoredUploads = 0;
  const uploads = data.uploads;
  if (uploads && typeof uploads === 'object') {
    await _ensureDir(UPLOADS_DIR);
    for (const [key, b64] of Object.entries(uploads)) {
      // Guard against tampered keys — accept only paths inside our
      // known uploads directory. Anything else is silently dropped so
      // a malicious backup can't scribble arbitrary files onto disk.
      if (!key.startsWith(`${UPLOADS_DIR}/`) || key.includes('..')) continue;
      if (typeof b64 !== 'string' || !b64) continue;
      try {
        await Filesystem.writeFile({
          path: key,
          data: b64,
          directory: Directory.Data,
        });
        restoredUploads++;
      } catch {}
    }
  }
  return { ok: true, tables: present.length, rows: counts, uploads: restoredUploads };
}

export async function listLocalBackups() {
  if (!isNative) return [];
  await _ensureDir(BACKUP_DIR, Directory.Documents);
  try {
    const r = await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Documents });
    // Entries are strings on old plugin versions, objects on new ones;
    // size/mtime may be missing, so order by the stamp in the name.
    return newestFirst((r?.files || [])
      .map(f => ({
        name: (typeof f === 'string' ? f : f?.name) || '',
        size: Number(f?.size) || 0,
        mtime: Number(f?.mtime) || 0,
      }))
      .filter(f => f.name.endsWith('.json')));
  } catch { return []; }
}

/** Delete safety snapshots beyond the newest `keep`. Never throws. */
export async function pruneSafetySnapshots(keep) {
  try {
    const r = await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Documents });
    const files = (r?.files || []).map(f => (typeof f === 'string' ? { name: f } : f));
    for (const f of backupsToPrune(files, SAFETY_PREFIX, keep)) {
      await deleteLocalBackup(f.name);
    }
  } catch {}
}

export async function readBackupFile(name) {
  const r = await Filesystem.readFile({
    path: `${BACKUP_DIR}/${name}`,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });
  return typeof r.data === 'string' ? r.data : '';
}

export async function deleteLocalBackup(name) {
  try {
    await Filesystem.deleteFile({
      path: `${BACKUP_DIR}/${name}`,
      directory: Directory.Documents,
    });
  } catch {}
}

/** Open the Share sheet for an existing backup file. Returns false if the
 *  user cancelled or sharing failed. */
export async function shareLocalBackup(name) {
  try {
    const { uri } = await Filesystem.getUri({ path: `${BACKUP_DIR}/${name}`, directory: Directory.Documents });
    await Share.share({ title: 'LiftTrace backup', url: uri, dialogTitle: 'Save LiftTrace backup' });
    return true;
  } catch { return false; }
}

/** Parse and sanity-check backup text without touching the DB. Throws
 *  'Not a LiftTrace backup file' (or a JSON error) on bad input. */
export function parseBackupText(text) {
  const data = JSON.parse(text);
  if (!data || data.app !== 'lifttrace' || !data.tables
      || typeof data.tables !== 'object' || Array.isArray(data.tables)) {
    throw new Error('Not a LiftTrace backup file');
  }
  return data;
}
