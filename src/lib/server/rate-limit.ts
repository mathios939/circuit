/**
 * Fixed-window rate limiter keyed by client identifier (IP). In-memory: good
 * enough for a single instance; replace by a shared store (Redis) behind the
 * same function signature for multi-instance deployments.
 */
interface Window {
  count: number;
  resetAt: number;
}

const store = (globalThis as unknown as { __circuitRateLimit?: Map<string, Window> }).__circuitRateLimit ??
  new Map<string, Window>();
(globalThis as unknown as { __circuitRateLimit?: Map<string, Window> }).__circuitRateLimit = store;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterS: number;
}

export function checkRateLimit(key: string, limitPerMinute: number, now = Date.now()): RateLimitResult {
  // Opportunistic cleanup so the map cannot grow without bounds.
  if (store.size > 10_000) {
    for (const [k, w] of store) if (w.resetAt <= now) store.delete(k);
  }
  const windowMs = 60_000;
  let w = store.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    store.set(key, w);
  }
  w.count += 1;
  const allowed = w.count <= limitPerMinute;
  return {
    allowed,
    remaining: Math.max(0, limitPerMinute - w.count),
    retryAfterS: Math.ceil((w.resetAt - now) / 1000),
  };
}

/** Extracts a best-effort client identifier from request headers. */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "local";
}
