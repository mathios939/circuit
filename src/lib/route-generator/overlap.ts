import type { LatLng } from "@/lib/types";
import { haversineDistance } from "@/lib/geo";

/**
 * Estimates the share of a route's length that re-uses ground already
 * travelled (out-and-back sections, repeated streets).
 *
 * The path is rasterised into ~`cellM` grid cells; every step from one cell to
 * a *previously visited* cell that is not the immediately preceding cell is
 * counted as overlapping length. Loops naturally revisit the start cell, which
 * is tolerated.
 */
export function computeOverlapRatio(points: readonly LatLng[], cellM = 40): number {
  if (points.length < 3) return 0;
  const lat0 = points[0]!.lat;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);

  const cellOf = (p: LatLng): string =>
    `${Math.floor((p.lat * metersPerDegLat) / cellM)}:${Math.floor((p.lng * metersPerDegLng) / cellM)}`;

  const visited = new Map<string, number>(); // cell -> last index that visited it
  let total = 0;
  let overlapping = 0;
  let prevCell = cellOf(points[0]!);
  visited.set(prevCell, 0);

  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const len = haversineDistance(points[i - 1]!, p);
    total += len;
    const cell = cellOf(p);
    if (cell !== prevCell) {
      const lastVisit = visited.get(cell);
      // Revisiting a cell we left more than a few steps ago = overlap.
      if (lastVisit !== undefined && i - lastVisit > 3) overlapping += len;
      visited.set(cell, i);
      prevCell = cell;
    }
  }

  return total > 0 ? Math.min(1, overlapping / total) : 0;
}
