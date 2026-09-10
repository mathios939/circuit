import type { LatLng } from "@/lib/types";
import { isRetryableError } from "@/lib/errors";
import type { Cache } from "@/lib/server/cache";
import type { Logger } from "@/lib/server/logger";
import type { ElevationProvider } from "./provider";

/**
 * Tries each provider of the chain in order until one answers. The caller
 * (enrichWithElevation) handles the final "no elevation" fallback: a route is
 * always returned, with or without altitude.
 */
export class ChainedElevationProvider implements ElevationProvider {
  readonly id: string;
  readonly batchSize: number;
  lastUsed: string;

  constructor(
    private readonly providers: ElevationProvider[],
    private readonly logger?: Logger,
  ) {
    if (providers.length === 0) throw new Error("ChainedElevationProvider needs at least one provider");
    this.id = providers[0]!.id;
    // The smallest batch keeps every provider of the chain usable for the same request.
    this.batchSize = Math.min(...providers.map((p) => p.batchSize));
    this.lastUsed = this.id;
  }

  async lookup(points: readonly LatLng[], signal?: AbortSignal): Promise<(number | null)[]> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        const result = await provider.lookup(points, signal);
        this.lastUsed = provider.id;
        return result;
      } catch (e) {
        lastError = e;
        if (!isRetryableError(e)) throw e;
        this.logger?.warn("elevation provider unavailable, trying next", { provider: provider.id, error: e });
      }
    }
    throw lastError;
  }
}

/**
 * Memoises elevations per coordinate (rounded to ~1 m) so that repeated
 * candidates around the same start, recalculations and re-generations do not
 * hit the upstream again. TTL is long: terrain does not change.
 */
export class CachedElevationProvider implements ElevationProvider {
  readonly id: string;
  readonly batchSize: number;

  constructor(
    private readonly inner: ElevationProvider,
    private readonly cache: Cache<number>,
    private readonly ttlMs = 7 * 24 * 60 * 60 * 1000,
  ) {
    this.id = inner.id;
    this.batchSize = inner.batchSize;
  }

  static key(p: LatLng): string {
    return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  }

  async lookup(points: readonly LatLng[], signal?: AbortSignal): Promise<(number | null)[]> {
    const out: (number | null)[] = new Array(points.length).fill(null);
    const missing: number[] = [];
    points.forEach((p, i) => {
      const hit = this.cache.get(CachedElevationProvider.key(p));
      if (hit !== undefined) out[i] = hit;
      else missing.push(i);
    });
    if (missing.length === 0) return out;
    const fetched = await this.inner.lookup(
      missing.map((i) => points[i]!),
      signal,
    );
    missing.forEach((pointIndex, k) => {
      const value = fetched[k] ?? null;
      out[pointIndex] = value;
      if (value !== null) this.cache.set(CachedElevationProvider.key(points[pointIndex]!), value, this.ttlMs);
    });
    return out;
  }
}
