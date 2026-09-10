import type { RouteSegment } from "@/lib/types";
import { isRetryableError } from "@/lib/errors";
import type { Logger } from "@/lib/server/logger";
import type { CalculateLoopInput, CalculateMatrixInput, CalculateRouteInput, RawRoute, RoutingProfileOptions, RoutingProvider } from "./provider";

/**
 * Routing provider that switches to a secondary engine only when the primary
 * one is *unavailable* (timeout, 429, 5xx, network). Request-level failures
 * (no route, unroutable point) are never retried elsewhere: a different
 * engine would silently change the behaviour the user asked for.
 */
export class FallbackRoutingProvider implements RoutingProvider {
  readonly id: string;
  readonly capabilities: RoutingProvider["capabilities"];
  /** Which engine answered the last successful call (for diagnostics / debug). */
  lastUsed: string;

  constructor(
    private readonly primary: RoutingProvider,
    private readonly fallback: RoutingProvider,
    private readonly logger?: Logger,
  ) {
    this.id = primary.id;
    this.capabilities = primary.capabilities;
    this.lastUsed = primary.id;
  }

  private async attempt<T>(operation: string, run: (p: RoutingProvider) => Promise<T>): Promise<T> {
    try {
      const result = await run(this.primary);
      this.lastUsed = this.primary.id;
      return result;
    } catch (e) {
      if (!isRetryableError(e)) throw e;
      this.logger?.warn("routing provider unavailable, using fallback", { provider: this.primary.id, fallback: this.fallback.id, operation, error: e });
      const result = await run(this.fallback);
      this.lastUsed = this.fallback.id;
      return result;
    }
  }

  calculateRoute(input: CalculateRouteInput): Promise<RawRoute> {
    return this.attempt("route", (p) => p.calculateRoute(input));
  }

  async calculateMatrix(input: CalculateMatrixInput): Promise<number[][]> {
    return this.attempt("matrix", (p) => {
      if (!p.calculateMatrix) throw new Error(`${p.id} does not support matrices`);
      return p.calculateMatrix(input);
    });
  }

  get calculateLoop(): RoutingProvider["calculateLoop"] {
    if (!this.primary.calculateLoop) return undefined;
    return (input: CalculateLoopInput) =>
      this.attempt("loop", (p) => {
        if (!p.calculateLoop) throw new Error(`${p.id} does not support native loops`);
        return p.calculateLoop(input);
      });
  }

  async getRouteDetails(route: RawRoute, profile: RoutingProfileOptions, signal?: AbortSignal): Promise<RouteSegment[]> {
    const p = this.lastUsed === this.fallback.id ? this.fallback : this.primary;
    if (!p.getRouteDetails) return [];
    return p.getRouteDetails(route, profile, signal);
  }
}
