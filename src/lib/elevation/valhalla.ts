import { z } from "zod";
import type { LatLng } from "@/lib/types";
import { fetchJson } from "@/lib/server/http";
import type { ElevationProvider } from "./provider";

const schema = z.object({ height: z.array(z.number().nullable()) });

/** Valhalla `/height` endpoint. One call per route, no documented point limit (we chunk anyway). */
export class ValhallaElevationProvider implements ElevationProvider {
  readonly id = "valhalla";
  readonly batchSize = 1000;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 15_000,
  ) {}

  async lookup(points: readonly LatLng[], signal?: AbortSignal): Promise<(number | null)[]> {
    if (points.length === 0) return [];
    const raw = await fetchJson(`${this.baseUrl}/height`, {
      method: "POST",
      body: { shape: points.map((p) => ({ lat: p.lat, lon: p.lng })), height_precision: 1 },
      timeoutMs: this.timeoutMs,
      signal,
      service: "valhalla-height",
    });
    const parsed = schema.safeParse(raw);
    if (!parsed.success || parsed.data.height.length !== points.length) return points.map(() => null);
    return parsed.data.height;
  }
}
