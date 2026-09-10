/**
 * Fixed-window rate limiter keyed by bucket + client identifier (IP).
 * Buckets isolate cheap, frequent calls (geocoding autocomplete) from
 * expensive ones (route generation) so that one cannot starve the other.
 *
 * In-memory: good enough for a single instance; replace the store by a shared
 * one (Redis) behind the same function signature for multi-instance setups.
 */
export type RateLimitBucket = "geocoding" | "generation" | "calculate" | "import" | "diagnostics";

interface Window {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __circuitRateLimit?: Map<string, Window> };
const store = (g.__circuitRateLimit ??= new Map<string, Window>());

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterS: number;
  limit: number;
}

export function checkRateLimit(bucket: RateLimitBucket | string, key: string, limitPerMinute: number, now = Date.now(), weight = 1): RateLimitResult {
  // Opportunistic cleanup so the map cannot grow without bounds.
  if (store.size > 10_000) {
    for (const [k, w] of store) if (w.resetAt <= now) store.delete(k);
  }
  const windowMs = 60_000;
  const id = `${bucket}:${key}`;
  let w = store.get(id);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    store.set(id, w);
  }
  w.count += weight;
  const allowed = w.count <= limitPerMinute;
  return {
    allowed,
    remaining: Math.max(0, limitPerMinute - w.count),
    retryAfterS: Math.ceil((w.resetAt - now) / 1000),
    limit: limitPerMinute,
  };
}

/** Extracts a best-effort client identifier from request headers. */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "local";
}

/** User-facing message per bucket. */
export const RATE_LIMIT_MESSAGES: Record<RateLimitBucket, string> = {
  geocoding: "Trop de recherches de lieux en peu de temps. Patientez quelques secondes puis réessayez.",
  generation: "Trop de générations de parcours en une minute. Patientez un instant avant de relancer un calcul.",
  calculate: "Trop de recalculs en peu de temps. Patientez quelques secondes avant de modifier à nouveau le parcours.",
  import: "Trop d'analyses en peu de temps. Patientez un instant.",
  diagnostics: "Diagnostic déjà lancé récemment. Patientez une minute.",
};
