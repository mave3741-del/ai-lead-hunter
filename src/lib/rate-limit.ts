type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: Math.max(0, limit - 1), retryAfterMs: windowMs };
  }
  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - now),
    };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterMs: Math.max(0, existing.resetAt - now),
  };
}

export function resetRateLimits() {
  buckets.clear();
}

/** User-initiated expensive ops: 20 / 10 minutes per workspace. */
export function limitAgentRun(workspaceId: string) {
  return rateLimit(`agent:${workspaceId}`, 20, 10 * 60 * 1000);
}

export function limitWebsiteFetch(workspaceId: string) {
  return rateLimit(`fetch:${workspaceId}`, 12, 10 * 60 * 1000);
}
