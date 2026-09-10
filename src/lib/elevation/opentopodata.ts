import { z } from "zod";
import type { LatLng } from "@/lib/types";
import { createThrottle, fetchJson } from "@/lib/server/http";
import type { ElevationProvider } from "./provider";

const schema = z.object({
  status: z.string(),
  results: z.array(z.object({ elevation: z.number().nullable() })).optional(),
});

/** OpenTopoData public API (SRTM 30 m by default). No key, 100 points per call, 1 call/s. */
export class OpenTopoDataElevationProvider implements ElevationProvider {
  readonly id = "opentopodata";
  readonly batchSize = 100;
  /** Public API policy: 1 call per second, 100 locations per call, 1000 calls per day. */
  private readonly throttle = createThrottle(1_050);

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async lookup(points: readonly LatLng[], signal?: AbortSignal): Promise<(number | null)[]> {
    if (points.length === 0) return [];
    const locations = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
    const raw = await this.throttle(() =>
      fetchJson(`${this.baseUrl}?locations=${encodeURIComponent(locations)}`, { timeoutMs: this.timeoutMs, signal, service: "opentopodata" }),
    );
    const parsed = schema.safeParse(raw);
    if (!parsed.success || parsed.data.status !== "OK" || !parsed.data.results || parsed.data.results.length !== points.length) {
      return points.map(() => null);
    }
    return parsed.data.results.map((r) => r.elevation);
  }
}
