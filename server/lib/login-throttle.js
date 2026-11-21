// Failure and attempt buckets for sign-in limits. In-memory, no db import.
// A bucket is a count per key in a fixed window; the map is capped so a spray
// of random usernames can't grow memory without bound.

export function createBucket({ limit, windowMs = 15 * 60 * 1000, maxKeys = 10000, now = Date.now } = {}) {
  const map = new Map();
  const live = (key) => {
    const e = map.get(key);
    return e && now() <= e.resetAt ? e : null;
  };
  return {
    // True when the key is already at its limit (does not count).
    isLimited: (key) => (live(key)?.count || 0) >= limit,
    // Count one; true when that put the key over its limit.
    hit(key) {
      let e = live(key);
      if (!e) {
        if (map.size >= maxKeys) this.prune();
        if (map.size >= maxKeys) map.delete(map.keys().next().value);
        e = { count: 0, resetAt: now() + windowMs };
      }
      e.count++;
      map.set(key, e);
      return e.count > limit;
    },
    clear: (key) => { map.delete(key); },
    prune() {
      const t = now();
      for (const [k, e] of map) if (t > e.resetAt) map.delete(k);
    },
    size: () => map.size,
  };
}

// Wrong current-password tries on a signed-in session, per user id.
export const passwordBucket = createBucket({ limit: 5 });

// Cleanup every 30 min; unref'd so it never keeps the process (or a test) alive.
export function startPruning(buckets, ms = 30 * 60 * 1000) {
  const t = setInterval(() => { for (const b of buckets) b.prune(); }, ms);
  t.unref?.();
  return t;
}

// TRUST_PROXY: unset/empty/false = off, "true" = trust every hop (spoofable
// when the app is directly reachable), digits = hop count, else an Express
// subnet list ("loopback, 10.0.0.0/8"). Returns undefined when off.
export function parseTrustProxy(raw) {
  const v = String(raw ?? '').trim();
  if (!v || /^(false|0)$/i.test(v)) return undefined;
  if (/^true$/i.test(v)) return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
