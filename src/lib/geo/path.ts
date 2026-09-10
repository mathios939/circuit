import type { BBox, LatLng, RoutePoint } from "@/lib/types";
import { haversineDistance } from "./distance";

/** Attach cumulative distances to a list of coordinates. */
export function toRoutePoints(coords: readonly (LatLng & { ele?: number })[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  let dist = 0;
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i]!;
    if (i > 0) dist += haversineDistance(coords[i - 1]!, c);
    const p: RoutePoint = { lat: c.lat, lng: c.lng, dist };
    if (typeof c.ele === "number" && Number.isFinite(c.ele)) p.ele = c.ele;
    out.push(p);
  }
  return out;
}

export function computeBBox(points: readonly LatLng[]): BBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of points) {
    if (p.lng < west) west = p.lng;
    if (p.lng > east) east = p.lng;
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
  }
  if (!Number.isFinite(west)) return [0, 0, 0, 0];
  return [west, south, east, north];
}

/**
 * Interpolate the position at a given cumulative distance along the route.
 * Returns the last point when `dist` exceeds the route length.
 */
export function pointAtDistance(points: readonly RoutePoint[], dist: number): RoutePoint | undefined {
  if (points.length === 0) return undefined;
  if (dist <= 0) return points[0];
  const last = points[points.length - 1]!;
  if (dist >= last.dist) return last;

  // Binary search for the segment containing `dist`.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.dist <= dist) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  const span = b.dist - a.dist;
  const t = span > 0 ? (dist - a.dist) / span : 0;
  const out: RoutePoint = {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    dist,
  };
  if (typeof a.ele === "number" && typeof b.ele === "number") {
    out.ele = a.ele + (b.ele - a.ele) * t;
  }
  return out;
}

/**
 * Sample the route every `stepM` metres (always including the last point),
 * capped at `maxPoints` samples.
 */
export function samplePath(points: readonly RoutePoint[], stepM: number, maxPoints: number): RoutePoint[] {
  if (points.length === 0) return [];
  const total = points[points.length - 1]!.dist;
  const step = Math.max(stepM, total / Math.max(1, maxPoints - 1));
  const samples: RoutePoint[] = [];
  for (let d = 0; d < total; d += step) {
    const p = pointAtDistance(points, d);
    if (p) samples.push(p);
  }
  samples.push(points[points.length - 1]!);
  return samples;
}

/** Index of the closest vertex to `target`, plus its distance in metres. */
export function nearestPointIndex(points: readonly LatLng[], target: LatLng): { index: number; distanceM: number } {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversineDistance(points[i]!, target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return { index: best, distanceM: bestDist };
}

/** Perpendicular distance in metres from p to the segment [a,b] (planar approximation, fine for short segments). */
function segmentDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const cosLat = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lng * cosLat;
  const ay = a.lat;
  const bx = b.lng * cosLat;
  const by = b.lat;
  const px = p.lng * cosLat;
  const py = p.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return haversineDistance(p, { lat: cy, lng: cx / cosLat });
}

/** Ramer–Douglas–Peucker simplification with a tolerance in metres. */
export function simplifyPath<T extends LatLng>(points: readonly T[], toleranceM: number): T[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(points[i]!, points[start]!, points[end]!);
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }
    if (maxDist > toleranceM && maxIndex > 0) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }
  const out: T[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]!);
  return out;
}
