import type { RoutePoint, RouteRequest, RouteResult, RouteSegment, RouteStyle, RouteWaypoint } from "@/lib/types";
import { ACTIVITY_LABELS, getActivityProfile } from "@/lib/activities/profiles";
import { computeBBox, toRoutePoints } from "@/lib/geo";
import { buildInsights, computeRouteDNA, scoreRoute } from "@/lib/scoring";
import { computeRouteStatistics } from "@/lib/stats/statistics";
import { shortId } from "@/lib/utils/id";
import type { RawRoute } from "@/lib/routing/provider";
import { snapWaypointIndices } from "@/lib/routing/snap";

export interface BuildRouteInput {
  request: RouteRequest;
  style: RouteStyle;
  raw: RawRoute;
  /** Route points already enriched with elevation (falls back to raw coordinates). */
  points?: RoutePoint[];
  segments?: RouteSegment[];
  /** Waypoints used to compute the route (start, vias, end). */
  waypoints: RouteWaypoint[];
  provider: string;
  name?: string;
  id?: string;
}

/**
 * Converts raw engine output into a fully described RouteResult (statistics,
 * score, DNA, insights). Cumulative distances are scaled so that the total
 * matches the distance reported by the routing engine.
 */
export function buildRouteResult(input: BuildRouteInput): RouteResult {
  const { request, style, raw, provider } = input;
  const profile = getActivityProfile(request.activity);
  let points = input.points ?? toRoutePoints(raw.coordinates);
  points = scaleDistances(points, raw.distanceM);

  const segments = input.segments ?? raw.segments ?? [];
  const stats = computeRouteStatistics(points, segments, { activity: request.activity, mode: request.mode, turnCount: raw.turnCount });
  const score = scoreRoute({ request, stats, profile, style });
  const dna = computeRouteDNA(stats, profile);
  const insights = buildInsights(request, stats, profile);
  const km = Math.round(stats.distanceM / 1000);

  return {
    id: input.id ?? shortId(),
    name: input.name ?? `${request.start.name} · ${ACTIVITY_LABELS[request.activity]} ${km} km`,
    activity: request.activity,
    mode: request.mode,
    style,
    points,
    waypoints: input.waypoints,
    stats,
    segments,
    score,
    dna,
    insights,
    provider,
    createdAt: new Date().toISOString(),
    bbox: computeBBox(points),
    request,
  };
}

/** Builds waypoint objects (start / vias / end) for a set of coordinates. */
export function makeWaypoints(coords: readonly { lat: number; lng: number; name?: string }[], mode: RouteRequest["mode"]): RouteWaypoint[] {
  return coords.map((c, i) => ({
    id: shortId(6),
    lat: c.lat,
    lng: c.lng,
    name: c.name,
    kind: i === 0 ? "start" : i === coords.length - 1 && mode === "point_to_point" ? "end" : "via",
  }));
}

/** Waypoint indices along the geometry, using the engine's if provided. */
export function waypointIndices(raw: RawRoute, waypoints: readonly RouteWaypoint[]): number[] {
  return raw.waypointIndices ?? snapWaypointIndices(raw.coordinates, waypoints);
}

function scaleDistances(points: RoutePoint[], engineDistanceM: number): RoutePoint[] {
  const last = points[points.length - 1];
  if (!last || last.dist <= 0 || !Number.isFinite(engineDistanceM) || engineDistanceM <= 0) return points;
  const factor = engineDistanceM / last.dist;
  if (Math.abs(factor - 1) < 0.002) return points;
  return points.map((p) => ({ ...p, dist: p.dist * factor }));
}
