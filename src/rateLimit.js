'use strict';

/**
 * Tiny in-memory sliding-window rate limiter (no dependency). It protects the
 * Gemini API key from being drained by a single client. For multi-instance
 * deployments, replace it with a shared store.
 */
function createRateLimiter({ limit, windowMs = 60000, now = Date.now, maxKeys = 10000 }) {
  const hits = new Map(); // key -> timestamps[]

  function prune(ts, t) {
    while (ts.length && t - ts[0] >= windowMs) ts.shift();
  }

  /** @returns {{allowed:boolean, retryAfterSec:number, remaining:number}} */
  function check(key) {
    const t = now();
    let ts = hits.get(key);
    if (!ts) {
      if (hits.size >= maxKeys) {
        // Drop stale keys first; if still full, evict the oldest.
        for (const [k, v] of hits) {
          prune(v, t);
          if (!v.length) hits.delete(k);
        }
        if (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
      }
      ts = [];
      hits.set(key, ts);
    }
    prune(ts, t);
    if (ts.length >= limit) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((ts[0] + windowMs - t) / 1000)), remaining: 0 };
    }
    ts.push(t);
    return { allowed: true, retryAfterSec: 0, remaining: limit - ts.length };
  }

  return { check };
}

module.exports = { createRateLimiter };
