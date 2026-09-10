import { z } from "zod";
import type { LatLng } from "@/lib/types";
import { fetchJson } from "@/lib/server/http";
import type { ElevationProvider } from "./provider";

const schema = z.object({ elevation: z.array(z.number().nullable()) });

/** Open-Meteo elevation API (Copernicus DEM 90 m). No key, up to 100 points per call. */
export class OpenMeteoElevationProvider implements ElevationProvider {
  readonly id = "open-meteo";
  readonly batchSize = 100;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async lookup(points: readonly LatLng[], signal?: AbortSignal): Promise<(number | null)[]> {
    if (points.length === 0) return [];
    const lat = points.map((p) => p.lat.toFixed(5)).join(",");
    const lng = points.map((p) => p.lng.toFixed(5)).join(",");
    const raw = await fetchJson(`${this.baseUrl}?latitude=${lat}&longitude=${lng}`, {
      timeoutMs: this.timeoutMs,
      signal,
      service: "open-meteo",
    });
    const parsed = schema.safeParse(raw);
    if (!parsed.success || parsed.data.elevation.length !== points.length) {
      return points.map(() => null);
    }
    return parsed.data.elevation;
  }
}
