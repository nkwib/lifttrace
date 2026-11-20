// Mirror of the dedupe in server/routes/cardio.js GET /templates: rows arrive
// newest-first, so the first row per activity wins. Exact-match key, no case
// folding, to stay identical to the server.
export function uniqueByActivity(rows) {
  const seen = new Set();
  return rows.filter(row => {
    if (seen.has(row.activity)) return false;
    seen.add(row.activity);
    return true;
  });
}
