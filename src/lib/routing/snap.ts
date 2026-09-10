import type { LatLng, RouteSegment } from "@/lib/types";
import { haversineDistance } from "@/lib/geo";

/**
 * Finds, for each waypoint, the index of the closest route vertex, keeping the
 * indices monotonically increasing along the route.
 */
export function snapWaypointIndices(coords: readonly LatLng[], waypoints: readonly LatLng[]): number[] {
  const out: number[] = [];
  let from = 0;
  for (let w = 0; w < waypoints.length; w++) {
    const wp = waypoints[w]!;
    const isLast = w === waypoints.length - 1;
    if (isLast) {
      out.push(coords.length - 1);
      break;
    }
    let best = from;
    let bestDist = Infinity;
    for (let i = from; i < coords.length; i++) {
      const d = haversineDistance(coords[i]!, wp);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    out.push(best);
    from = Math.min(best + 1, coords.length - 1);
  }
  return out;
}

/** Cumulative distances (metres) for a coordinate list. */
export function cumulativeDistances(coords: readonly LatLng[]): number[] {
  const out = new Array<number>(coords.length);
  let d = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) d += haversineDistance(coords[i - 1]!, coords[i]!);
    out[i] = d;
  }
  return out;
}

/**
 * Builds segments from "interval details" as returned by GraphHopper /
 * openrouteservice: arrays of [fromIndex, toIndex, value] for each attribute.
 */
export function segmentsFromIntervals(
  coords: readonly LatLng[],
  surfaceIntervals: readonly [number, number, string][],
  wayIntervals: readonly [number, number, string][],
  normaliseSurface: (v: string) => RouteSegment["surface"],
  normaliseWay: (v: string) => RouteSegment["way"],
): RouteSegment[] {
  if (coords.length < 2) return [];
  const cum = cumulativeDistances(coords);
  const cuts = new Set<number>([0, coords.length - 1]);
  for (const [a, b] of surfaceIntervals) {
    cuts.add(a);
    cuts.add(b);
  }
  for (const [a, b] of wayIntervals) {
    cuts.add(a);
    cuts.add(b);
  }
  const sorted = [...cuts].filter((i) => i >= 0 && i < coords.length).sort((x, y) => x - y);

  const lookup = (intervals: readonly [number, number, string][], index: number): string | undefined => {
    for (const [a, b, v] of intervals) if (index >= a && index < b) return v;
    return undefined;
  };

  const segments: RouteSegment[] = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const start = sorted[k]!;
    const end = sorted[k + 1]!;
    if (end <= start) continue;
    const lengthM = cum[end]! - cum[start]!;
    if (lengthM <= 0) continue;
    segments.push({
      startIndex: start,
      endIndex: end,
      lengthM,
      surface: normaliseSurface(lookup(surfaceIntervals, start) ?? ""),
      way: normaliseWay(lookup(wayIntervals, start) ?? ""),
    });
  }
  return segments;
}
