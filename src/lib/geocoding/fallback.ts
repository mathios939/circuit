import type { LatLng } from "@/lib/types";
import { isRetryableError } from "@/lib/errors";
import type { Logger } from "@/lib/server/logger";
import type { GeocodeOptions, GeocodeResult, GeocodingProvider } from "./provider";

/** Geocoder that falls back to a secondary service when the primary one is unavailable. */
export class FallbackGeocodingProvider implements GeocodingProvider {
  readonly id: string;
  lastUsed: string;

  constructor(
    private readonly primary: GeocodingProvider,
    private readonly fallback: GeocodingProvider,
    private readonly logger?: Logger,
  ) {
    this.id = primary.id;
    this.lastUsed = primary.id;
  }

  private async attempt<T>(operation: string, run: (p: GeocodingProvider) => Promise<T>): Promise<T> {
    try {
      const r = await run(this.primary);
      this.lastUsed = this.primary.id;
      return r;
    } catch (e) {
      if (!isRetryableError(e)) throw e;
      this.logger?.warn("geocoding provider unavailable, using fallback", { provider: this.primary.id, fallback: this.fallback.id, operation, error: e });
      const r = await run(this.fallback);
      this.lastUsed = this.fallback.id;
      return r;
    }
  }

  search(query: string, options?: GeocodeOptions): Promise<GeocodeResult[]> {
    return this.attempt("search", (p) => p.search(query, options));
  }

  reverse(position: LatLng, options?: { lang?: string; signal?: AbortSignal }): Promise<GeocodeResult | null> {
    return this.attempt("reverse", (p) => p.reverse(position, options));
  }
}
