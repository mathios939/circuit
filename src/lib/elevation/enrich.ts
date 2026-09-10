import type { RoutePoint } from "@/lib/types";
import { samplePath } from "@/lib/geo";
import { mapLimit } from "@/lib/utils/concurrency";
import { smoothElevation } from "@/lib/stats/elevation-gain";
import type { ElevationProvider } from "./provider";

export interface EnrichOptions {
  /** Maximum number of sampled positions sent to the provider. */
  maxSamples: number;
  /** Minimum spacing between samples in metres. */
  minStepM?: number;
  concurrency?: number;
  signal?: AbortSignal;
}

/**
 * Attaches elevation to every route point. The route is sampled at regular
 * intervals (bounded by `maxSamples`), elevations are fetched in batches and
 * linearly interpolated back onto the full geometry. Any provider failure
 * results in the original points being returned untouched: elevation is an
 * enrichment, never a blocker.
 */
export async function enrichWithElevation(
  points: readonly RoutePoint[],
  provider: ElevationProvider,
  options: EnrichOptions,
): Promise<{ points: RoutePoint[]; ok: boolean }> {
  if (points.length < 2) return { points: [...points], ok: false };
  if (points.every((p) => typeof p.ele === "number")) return { points: [...points], ok: true };

  const samples = samplePath(points, options.minStepM ?? 50, options.maxSamples);
  const batches: RoutePoint[][] = [];
  for (let i = 0; i < samples.length; i += provider.batchSize) {
    batches.push(samples.slice(i, i + provider.batchSize));
  }

  let elevations: (number | null)[];
  try {
    const results = await mapLimit(batches, options.concurrency ?? 3, (batch) => provider.lookup(batch, options.signal));
    elevations = results.flat();
  } catch {
    return { points: [...points], ok: false };
  }

  const known: { dist: number; ele: number }[] = [];
  for (let i = 0; i < samples.length; i++) {
    const ele = elevations[i];
    if (typeof ele === "number" && Number.isFinite(ele)) known.push({ dist: samples[i]!.dist, ele });
  }
  // Require a reasonable coverage, otherwise the profile would be misleading.
  if (known.length < Math.max(2, samples.length * 0.8)) return { points: [...points], ok: false };

  let k = 0;
  const enriched = points.map((p) => {
    while (k < known.length - 2 && known[k + 1]!.dist < p.dist) k++;
    const a = known[k]!;
    const b = known[Math.min(k + 1, known.length - 1)]!;
    const span = b.dist - a.dist;
    const t = span > 0 ? Math.min(1, Math.max(0, (p.dist - a.dist) / span)) : 0;
    return { ...p, ele: Math.round((a.ele + (b.ele - a.ele) * t) * 10) / 10 };
  });

  return { points: smoothElevation(enriched, 3), ok: true };
}
