import type { LatLng, RouteStyle } from "@/lib/types";
import { bearing, destinationPoint, haversineDistance } from "@/lib/geo";
import type { RawRoute, RoutingProfileOptions, RoutingProvider } from "@/lib/routing/provider";

export interface PointToPointCandidate {
  raw: RawRoute;
  waypoints: LatLng[];
  style: RouteStyle;
  distanceError?: number;
  routingCalls: number;
  iterations: number;
}

export interface PointToPointOptions {
  start: LatLng;
  end: LatLng;
  /** Optional target distance in metres: a detour is inserted to reach it. */
  targetM?: number;
  tolerance?: number;
  seed: number;
  profile: RoutingProfileOptions;
  signal?: AbortSignal;
  /** Max detour adjustments (default 3). */
  maxIterations?: number;
}

/**
 * Routes from A to B. When a target distance longer than the direct route is
 * requested, a via point is pushed sideways from the midpoint and its offset
 * is adjusted iteratively until the distance fits.
 */
export async function routePointToPoint(provider: RoutingProvider, options: PointToPointOptions): Promise<PointToPointCandidate> {
  const { start, end, targetM, tolerance = 0.05, seed, profile, signal } = options;
  const maxIterations = options.maxIterations ?? 3;
  let routingCalls = 1;
  const direct = await provider.calculateRoute({ waypoints: [start, end], profile, signal });
  if (!targetM || direct.distanceM >= targetM * (1 - tolerance)) {
    return {
      raw: direct,
      waypoints: [start, end],
      style: profile.style,
      distanceError: targetM ? Math.abs(direct.distanceM - targetM) / targetM : undefined,
      routingCalls,
      iterations: 1,
    };
  }

  const straight = haversineDistance(start, end);
  const mid = destinationPoint(start, bearing(start, end), straight / 2);
  const side = seed % 2 === 0 ? 90 : -90;
  const brg = (bearing(start, end) + side + 360) % 360;
  // First guess: the detour forms a triangle; extra length ≈ 2 * offset * detour factor.
  let offsetM = (targetM - direct.distanceM) / 2.5;
  let best: PointToPointCandidate = { raw: direct, waypoints: [start, end], style: profile.style, distanceError: Math.abs(direct.distanceM - targetM) / targetM, routingCalls, iterations: 1 };

  for (let i = 0; i < maxIterations; i++) {
    const via = destinationPoint(mid, brg, offsetM);
    const waypoints = [start, via, end];
    routingCalls++;
    try {
      const raw = await provider.calculateRoute({ waypoints, profile, signal });
      const distanceError = Math.abs(raw.distanceM - targetM) / targetM;
      if (distanceError < (best.distanceError ?? Infinity)) best = { raw, waypoints, style: profile.style, distanceError, routingCalls, iterations: i + 2 };
      if (distanceError <= tolerance) break;
      offsetM *= Math.pow(targetM / Math.max(1, raw.distanceM), 0.9);
    } catch {
      offsetM *= 0.6; // the via point may be unroutable (water, ...): pull it closer
    }
  }
  best.routingCalls = routingCalls;
  return best;
}
