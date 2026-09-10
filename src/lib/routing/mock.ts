import type { LatLng, RouteSegment, SurfaceType, WayType } from "@/lib/types";
import { AppError } from "@/lib/errors";
import { bearing, destinationPoint, haversineDistance } from "@/lib/geo";
import { hashString, seededRandom } from "@/lib/utils/id";
import { buildRoutingIntent } from "./intent";
import type { CalculateMatrixInput, CalculateRouteInput, RawRoute, RoutingProfileOptions, RoutingProvider } from "./provider";
import { cumulativeDistances } from "./snap";

/**
 * Deterministic synthetic routing engine used by unit / end-to-end tests and
 * by `ROUTING_PROVIDER=mock`. It never talks to the network.
 *
 * Behaviour:
 * - Routes are wiggly great-circle paths with a realistic detour factor (~1.3)
 *   so that the loop generator has to iterate on the radius like it would with
 *   a real engine.
 * - Points inside the "ocean" box (Atlantic) are reported as not routable so
 *   error handling can be exercised.
 * - Surface / way attributes are generated from a seeded PRNG, shifted by the
 *   routing intent (adventure styles get more trails).
 */
export class MockRoutingProvider implements RoutingProvider {
  readonly id = "mock";
  readonly capabilities = { nativeLoop: false, elevation: false, segments: true, matrix: true };

  static readonly OCEAN_BBOX = { west: -60, south: -50, east: -20, north: 50 };

  private static isOcean(p: LatLng): boolean {
    const b = MockRoutingProvider.OCEAN_BBOX;
    return p.lng >= b.west && p.lng <= b.east && p.lat >= b.south && p.lat <= b.north;
  }

  async calculateRoute(input: CalculateRouteInput): Promise<RawRoute> {
    if (input.waypoints.length < 2) throw new AppError("INVALID_REQUEST", "Au moins deux points sont nécessaires.");
    for (const wp of input.waypoints) {
      if (MockRoutingProvider.isOcean(wp)) throw new AppError("NOT_ROUTABLE");
    }
    const coordinates: LatLng[] = [];
    let turnCount = 0;
    for (let i = 1; i < input.waypoints.length; i++) {
      const a = input.waypoints[i - 1]!;
      const b = input.waypoints[i]!;
      if (haversineDistance(a, b) > 400_000) throw new AppError("NO_ROUTE");
      const leg = wigglyPath(a, b, hashString(`${a.lat},${a.lng}->${b.lat},${b.lng}`));
      const start = coordinates.length > 0 ? 1 : 0;
      for (let k = start; k < leg.length; k++) coordinates.push(leg[k]!);
      turnCount += Math.max(1, Math.round(haversineDistance(a, b) / 700));
    }
    const cum = cumulativeDistances(coordinates);
    const distanceM = cum[cum.length - 1] ?? 0;
    const segments = syntheticSegments(coordinates, cum, input.profile);
    return { coordinates, distanceM, durationS: distanceM / 5, turnCount, segments };
  }

  async calculateMatrix(input: CalculateMatrixInput): Promise<number[][]> {
    return input.sources.map((s) => input.targets.map((t) => haversineDistance(s, t) * 1.3));
  }

  async getRouteDetails(route: RawRoute, profile: RoutingProfileOptions): Promise<RouteSegment[]> {
    return route.segments ?? syntheticSegments(route.coordinates, cumulativeDistances(route.coordinates), profile);
  }
}

/** A path from a to b that meanders like a real road network (length ≈ 1.3 × straight line). */
function wigglyPath(a: LatLng, b: LatLng, seed: number): LatLng[] {
  const straight = haversineDistance(a, b);
  const n = Math.max(8, Math.min(400, Math.round(straight / 60)));
  const brg = bearing(a, b);
  const rnd = seededRandom(seed);
  const phase1 = rnd() * Math.PI * 2;
  const phase2 = rnd() * Math.PI * 2;
  const amp = straight * 0.16;
  const points: LatLng[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const along = destinationPoint(a, brg, straight * t);
    const lateral = amp * (Math.sin(t * Math.PI * 2 + phase1) * Math.sin(t * Math.PI) + 0.35 * Math.sin(t * Math.PI * 6 + phase2) * Math.sin(t * Math.PI));
    points.push(lateral === 0 ? along : destinationPoint(along, brg + 90, lateral));
  }
  points[0] = a;
  points[n] = b;
  return points;
}

function syntheticSegments(coords: readonly LatLng[], cum: readonly number[], profile: RoutingProfileOptions): RouteSegment[] {
  const intent = buildRoutingIntent(profile);
  const rnd = seededRandom(hashString(`${coords[0]?.lat},${coords[0]?.lng},${coords.length},${profile.style}`));
  const segments: RouteSegment[] = [];
  let start = 0;
  while (start < coords.length - 1) {
    const end = Math.min(coords.length - 1, start + 5 + Math.floor(rnd() * 20));
    const roll = rnd();
    let surface: SurfaceType;
    let way: WayType;
    if (roll < intent.useTrails * 0.6) {
      surface = "trail";
      way = "path";
    } else if (roll < intent.useTrails * 0.6 + intent.useUnpaved * 0.3) {
      surface = "gravel";
      way = "track";
    } else if (roll < 0.9) {
      surface = "paved";
      way = rnd() < intent.useQuietStreets ? "residential" : "road";
    } else {
      surface = "paved";
      way = intent.avoidMajorRoads ? "road" : "major_road";
    }
    segments.push({ startIndex: start, endIndex: end, lengthM: cum[end]! - cum[start]!, surface, way });
    start = end;
  }
  return segments;
}
