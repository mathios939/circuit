import type { RouteGenerationResult, RoutePoint, RouteRequest, RouteResult, RouteSegment, RouteStyle, RouteWaypoint } from "@/lib/types";
import { ROUTE_STYLES } from "@/lib/types";
import { AppError } from "@/lib/errors";
import { getActivityProfile } from "@/lib/activities/profiles";
import { toRoutePoints } from "@/lib/geo";
import { enrichWithElevation } from "@/lib/elevation/enrich";
import type { ElevationProvider } from "@/lib/elevation/provider";
import type { RawRoute, RoutingProfileOptions, RoutingProvider } from "@/lib/routing/provider";
import { addComparativeInsights } from "@/lib/scoring";
import { hashString } from "@/lib/utils/id";
import { mapLimit, settledValues } from "@/lib/utils/concurrency";
import { buildRouteResult, makeWaypoints } from "./build";
import { restyleLoop, searchLoops, type LoopCandidate } from "./loop";
import { routePointToPoint } from "./point-to-point";

export { adjustRequest, ADJUSTMENT_LABELS } from "./adjust";
export { buildRouteResult } from "./build";

export interface GeneratorDependencies {
  routing: RoutingProvider;
  elevation: ElevationProvider;
  /** Max simultaneous routing calls. */
  concurrency?: number;
  /** Max elevation samples per route. */
  elevationSamples?: number;
  signal?: AbortSignal;
}

const STYLE_LABELS: Record<RouteStyle, string> = { fast: "Rapide", balanced: "Équilibrée", adventure: "Aventure" };

/**
 * Entry point of the route engine: turns a RouteRequest into up to three
 * fully described proposals (fast / balanced / adventure), best first.
 */
export async function generateRoutes(input: RouteRequest, deps: GeneratorDependencies): Promise<RouteGenerationResult> {
  const request = normaliseRequest(input);
  const styles = request.styles && request.styles.length > 0 ? request.styles : [...ROUTE_STYLES];
  const notes: string[] = [];
  const baseProfile: RoutingProfileOptions = { activity: request.activity, style: "balanced", preferences: request.preferences ?? {} };

  const drafts: { raw: RawRoute; style: RouteStyle; waypoints: RouteWaypoint[] }[] = [];

  if (request.mode === "loop") {
    const targetM = request.distanceKm! * 1000;
    const tolerance = request.distanceTolerance ?? 0.05;
    const search = await searchLoops(deps.routing, {
      start: request.start,
      targetM,
      tolerance,
      maxTolerance: Math.max(0.1, tolerance * 2),
      seed: request.seed!,
      profile: baseProfile,
      concurrency: deps.concurrency,
      signal: deps.signal,
      keep: styles.length,
    });
    notes.push(...search.notes);

    // The best candidate keeps the balanced costing it was computed with (when
    // requested); the others are re-routed with the remaining styles.
    const ordered: RouteStyle[] = styles.includes("balanced") ? ["balanced", ...styles.filter((s) => s !== "balanced")] : [...styles];
    const assignments = ordered.map((style, i) => ({ style, candidate: search.candidates[i % search.candidates.length]! }));

    const restyled = await settledValues(
      assignments.map(async ({ style, candidate }) => {
        if (style === "balanced") return { candidate, style };
        const c = await restyleLoop(deps.routing, candidate, request.start, targetM, style, baseProfile, search.toleranceUsed, deps.signal);
        // Drifted too far from the target: fall back to the balanced geometry.
        if (c.distanceError > Math.max(0.15, search.toleranceUsed * 1.5)) return { candidate, style: "balanced" as RouteStyle };
        return { candidate: c, style };
      }),
    );
    for (const { candidate, style } of restyled.values) drafts.push(toDraft(candidate, style, request));
  } else {
    if (!request.end) throw new AppError("INVALID_REQUEST", "Un point d'arrivée est requis.");
    const targetM = request.distanceKm ? request.distanceKm * 1000 : undefined;
    const results = await settledValues(
      styles.map(async (style) => {
        const c = await routePointToPoint(deps.routing, {
          start: request.start,
          end: request.end!,
          targetM,
          tolerance: request.distanceTolerance ?? 0.05,
          seed: request.seed!,
          profile: { ...baseProfile, style },
          signal: deps.signal,
        });
        return { style, c };
      }),
    );
    if (results.values.length === 0) {
      const first = results.errors[0];
      throw first instanceof AppError ? first : new AppError("NO_ROUTE");
    }
    for (const { style, c } of results.values) {
      const coords = [
        { ...request.start },
        ...c.waypoints.slice(1, -1),
        { ...request.end },
      ];
      drafts.push({ raw: c.raw, style, waypoints: makeWaypoints(coords, "point_to_point") });
    }
  }

  if (drafts.length === 0) throw new AppError("NO_ROUTE");

  const routes = await mapLimit(drafts, 3, async (draft) => finaliseRoute(draft.raw, draft.style, draft.waypoints, request, deps));
  dedupe(routes);
  routes.sort((a, b) => b.score.total - a.score.total);
  addComparativeInsights(routes);

  if (!routes.some((r) => r.stats.hasElevation)) notes.push("Altitude indisponible : le dénivelé n'a pas pu être calculé.");
  return { routes, notes, provider: deps.routing.id };
}

/** Recalculates a route through explicit waypoints (manual editing). */
export async function recalculateRoute(
  params: { request: RouteRequest; style: RouteStyle; waypoints: RouteWaypoint[]; name?: string; id?: string },
  deps: GeneratorDependencies,
): Promise<RouteResult> {
  const request = normaliseRequest(params.request, { requireDistance: false });
  const raw = await deps.routing.calculateRoute({
    waypoints: params.waypoints,
    profile: { activity: request.activity, style: params.style, preferences: request.preferences ?? {} },
    signal: deps.signal,
  });
  const route = await finaliseRoute(raw, params.style, params.waypoints, request, deps, { name: params.name, id: params.id });
  return route;
}

// ---------------------------------------------------------------------------

function toDraft(candidate: LoopCandidate, style: RouteStyle, request: RouteRequest) {
  const coords = candidate.waypoints.map((w, i) => (i === 0 || i === candidate.waypoints.length - 1 ? { ...w, name: request.start.name } : w));
  return { raw: candidate.raw, style, waypoints: makeWaypoints(coords, "loop") };
}

async function finaliseRoute(
  raw: RawRoute,
  style: RouteStyle,
  waypoints: RouteWaypoint[],
  request: RouteRequest,
  deps: GeneratorDependencies,
  extra: { name?: string; id?: string } = {},
): Promise<RouteResult> {
  const profile: RoutingProfileOptions = { activity: request.activity, style, preferences: request.preferences ?? {} };

  const [segments, enriched] = await Promise.all([
    resolveSegments(raw, profile, deps),
    enrichWithElevation(toRoutePoints(raw.coordinates), deps.elevation, {
      maxSamples: deps.elevationSamples ?? 300,
      signal: deps.signal,
    }),
  ]);

  const points: RoutePoint[] = enriched.points;
  const result = buildRouteResult({ request, style, raw, points, segments, waypoints, provider: deps.routing.id, name: extra.name, id: extra.id });
  if (!extra.name) result.name = `${result.name} · ${STYLE_LABELS[style]}`;
  return result;
}

async function resolveSegments(raw: RawRoute, profile: RoutingProfileOptions, deps: GeneratorDependencies): Promise<RouteSegment[]> {
  if (raw.segments && raw.segments.length > 0) return raw.segments;
  if (!deps.routing.getRouteDetails) return [];
  try {
    return await deps.routing.getRouteDetails(raw, profile, deps.signal);
  } catch {
    return [];
  }
}

/** Fills defaults, validates realism, derives distance from duration, etc. */
export function normaliseRequest(input: RouteRequest, options: { requireDistance?: boolean } = {}): RouteRequest {
  const profile = getActivityProfile(input.activity);
  const request: RouteRequest = { ...input, preferences: { ...(input.preferences ?? {}) } };

  if (request.distanceKm === undefined && request.durationMinutes !== undefined) {
    // Rough conversion: cruising speed with a 15 % margin for stops and climbs.
    request.distanceKm = Math.round(((profile.flatSpeedKmh * request.durationMinutes) / 60) * 0.85 * 10) / 10;
  }
  if (request.mode === "loop" && request.distanceKm === undefined && options.requireDistance !== false) {
    throw new AppError("INVALID_REQUEST", "Une distance est requise pour une boucle.");
  }
  // Distance realism only matters when we have to invent a route; recalculating
  // an existing (possibly imported) geometry must always be possible.
  if (request.distanceKm !== undefined && options.requireDistance !== false) {
    if (request.distanceKm < profile.minDistanceKm || request.distanceKm > profile.maxDistanceKm) {
      throw new AppError(
        "DISTANCE_UNREALISTIC",
        `Pour cette activité, choisissez une distance entre ${profile.minDistanceKm} et ${profile.maxDistanceKm} km.`,
      );
    }
  }
  if (request.elevationTargetM !== undefined && request.distanceKm && !request.preferences!.elevationMode) {
    const perKm = request.elevationTargetM / request.distanceKm;
    if (perKm >= 18) request.preferences!.elevationMode = "maximize";
    else if (perKm <= 6) request.preferences!.elevationMode = "minimize";
  }
  if (request.elevationMaxM !== undefined && request.distanceKm && !request.preferences!.elevationMode) {
    if (request.elevationMaxM / request.distanceKm <= 8) request.preferences!.elevationMode = "minimize";
  }
  if (request.seed === undefined) {
    request.seed = hashString(`${request.start.lat.toFixed(4)},${request.start.lng.toFixed(4)},${request.activity},${request.distanceKm ?? ""}`) % 100_000;
  }
  return request;
}

/** Removes near-identical variants (same geometry after restyling). */
function dedupe(routes: RouteResult[]): void {
  for (let i = routes.length - 1; i > 0; i--) {
    const a = routes[i]!;
    for (let j = 0; j < i; j++) {
      const b = routes[j]!;
      if (Math.abs(a.stats.distanceM - b.stats.distanceM) < 30 && a.points.length === b.points.length) {
        routes.splice(i, 1);
        break;
      }
    }
  }
}
