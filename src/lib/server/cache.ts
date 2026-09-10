/**
 * Small in-memory LRU cache with TTL. Suitable for a single Node process (dev,
 * small deployments). Swap for Redis behind the same interface when scaling.
 */
export interface Cache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V, ttlMs?: number): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class LruTtlCache<V> implements Cache<V> {
  private readonly map = new Map<string, Entry<V>>();

  constructor(
    private readonly maxEntries = 500,
    private readonly defaultTtlMs = 10 * 60 * 1000,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, ttlMs = this.defaultTtlMs): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

/**
 * Memoises an async function by key, sharing in-flight promises so that
 * concurrent identical calls hit the upstream only once.
 */
export function memoizeAsync<V>(cache: Cache<V>, ttlMs?: number) {
  const inflight = new Map<string, Promise<V>>();
  return async (key: string, compute: () => Promise<V>): Promise<V> => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = compute()
      .then((v) => {
        cache.set(key, v, ttlMs);
        return v;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}

/** Process-wide caches (survive across requests in the same Node process). */
const globalCaches = globalThis as unknown as { __circuitCaches?: Map<string, LruTtlCache<unknown>> };

export function getGlobalCache<V>(name: string, maxEntries = 500, ttlMs = 10 * 60 * 1000): LruTtlCache<V> {
  if (!globalCaches.__circuitCaches) globalCaches.__circuitCaches = new Map();
  let cache = globalCaches.__circuitCaches.get(name);
  if (!cache) {
    cache = new LruTtlCache<unknown>(maxEntries, ttlMs);
    globalCaches.__circuitCaches.set(name, cache);
  }
  return cache as LruTtlCache<V>;
}
