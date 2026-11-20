// Pure filter / sort / group / cap helpers for the Exercises page.
import { foldText } from './search-text.js';

// Folded haystack (name + primary/secondary muscles) memoized per `exercises`
// array identity: typing re-filters without re-folding per keystroke.
// Reassigning the array (reload, import, save) rebuilds the map.
const _foldCache = new WeakMap();
function haystack(ex) {
  const parts = [ex.name];
  for (const k of ['primary_muscles', 'secondary_muscles']) {
    if (Array.isArray(ex[k])) parts.push(...ex[k]);
  }
  return foldText(parts.join(' '));
}
function foldedHaystacks(exercises) {
  let m = _foldCache.get(exercises);
  if (!m) {
    m = new Map();
    for (const ex of exercises) m.set(ex, haystack(ex));
    _foldCache.set(exercises, m);
  }
  return m;
}

// `q` is the already-folded query ('' = no search). Whitespace-separated
// tokens must all appear in the name or muscles.
export function matchesSearch(exercises, ex, q) {
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  if (!tokens.length) return true;
  let h = foldedHaystacks(exercises).get(ex);
  if (h === undefined) h = haystack(ex);
  return tokens.every(t => h.includes(t));
}

export function filterExercises(exercises, { q = '', category = '', eqMatch = null } = {}) {
  return exercises.filter(ex =>
    matchesSearch(exercises, ex, q)
    && (!category || ex.category === category)
    && (!eqMatch || eqMatch(ex)));
}

// Favorites first, then used / recent / alpha.
export function makeComparator({ sortMode, favorites = [], usage = {} }) {
  const favSet = new Set(favorites || []);
  return (a, b) => {
    const favDiff = (favSet.has(b.id) ? 1 : 0) - (favSet.has(a.id) ? 1 : 0);
    if (favDiff) return favDiff;
    if (sortMode === 'used') {
      const cb = usage[b.id]?.count || 0;
      const ca = usage[a.id]?.count || 0;
      if (cb !== ca) return cb - ca;
    } else if (sortMode === 'recent') {
      const lb = usage[b.id]?.last_date || '';
      const la = usage[a.id]?.last_date || '';
      if (lb !== la) return lb < la ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  };
}

// Returns { [category]: sortedCopy }. Never mutates `filtered`.
// used/recent flatten into one '' section; alpha groups by category.
export function groupExercises(filtered, { sortMode, selectedCategory = '', favorites, usage }) {
  const cmp = makeComparator({ sortMode, favorites, usage });
  if (sortMode === 'used' || sortMode === 'recent') return { '': [...filtered].sort(cmp) };
  if (selectedCategory) return { [selectedCategory]: [...filtered].sort(cmp) };
  const g = {};
  for (const ex of filtered) {
    const cat = ex.category || 'other';
    (g[cat] ||= []).push(ex);
  }
  for (const k of Object.keys(g)) g[k].sort(cmp);
  return g;
}

// Row budget across groups; groups with no rows left are dropped (no orphan
// headers). `keepId` stays visible even beyond the cap (selected detail row).
export function capGroups(grouped, limit, keepId = null) {
  const out = {};
  let left = limit;
  for (const [cat, list] of Object.entries(grouped)) {
    let rows;
    if (left >= list.length) rows = list;
    else {
      rows = list.slice(0, Math.max(left, 0));
      if (keepId != null && !rows.some(e => e.id === keepId)) {
        const k = list.find(e => e.id === keepId);
        if (k) rows.push(k);
      }
    }
    left -= Math.min(left, list.length);
    if (rows.length) out[cat] = rows;
  }
  return out;
}
