import type { LatLng } from "@/lib/types";

/**
 * Elevation lookup abstraction. Implementations return one elevation (metres)
 * per input coordinate, or `null` when unknown for that position.
 */
export interface ElevationProvider {
  readonly id: string;
  /** Maximum number of coordinates per upstream call. */
  readonly batchSize: number;
  lookup(points: readonly LatLng[], signal?: AbortSignal): Promise<(number | null)[]>;
}
