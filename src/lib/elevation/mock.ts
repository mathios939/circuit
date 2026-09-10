import type { LatLng } from "@/lib/types";
import type { ElevationProvider } from "./provider";

/**
 * Deterministic synthetic terrain (sum of sines) used for tests and
 * `ELEVATION_PROVIDER=mock`. Rolling hills with ~80 m amplitude.
 */
export class MockElevationProvider implements ElevationProvider {
  readonly id = "mock";
  readonly batchSize = 1000;

  async lookup(points: readonly LatLng[]): Promise<(number | null)[]> {
    return points.map((p) => syntheticElevation(p));
  }
}

function syntheticElevation(p: LatLng): number {
  const x = p.lng * 111;
  const y = p.lat * 111;
  return (
    400 +
    80 * Math.sin(x * 0.9) * Math.cos(y * 0.7) +
    40 * Math.sin(x * 3.1 + 1.3) * Math.sin(y * 2.3) +
    15 * Math.sin(x * 11 + y * 7)
  );
}
