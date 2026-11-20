// Local-calendar date helpers (no heavy imports, safe for lazy chunks).
export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// date minus n calendar months (local), day clamped to the target month's last day.
export function monthsAgo(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth() - n, 1, 12);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), last));
  return d;
}
