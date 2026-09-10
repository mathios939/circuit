import type {
  GenerationProgress,
  GenerationStage,
  RouteGenerationResult,
  RoutePoint,
  RouteQualityReport,
  RouteRequest,
  RouteResult,
  RouteSegment,
  RouteStyle,
  RouteWaypoint,
} from "@/lib/types";
import { ROUTE_STYLES } from "@/lib/types";
import { AppError } from "@/lib/errors";
import { getActivityProfile, getStyleLabels } from "@/lib/activities/profiles";
import { toRoutePoints } from "@/lib/geo";
import { enrichWithElevation } from "@/lib/elevation/enrich";
import type { ElevationProvider } from "@/lib/elevation/provider";
import type { RawRoute, RoutingProfileOptions, RoutingProvider } from "@/lib/routing/provider";
import { addComparativeInsights } from "@/lib/scoring";
import { hashString } from "@/lib/utils/id";
import { mapLimit, settledValues } from "@/lib/utils/concurrency";
import { buildRouteResult, makeWaypoints } from "./build";
import { ROUTE_ENGINE } from "./config";
import { restyleLoop, searchLoops, type LoopCandidate } from "./loop";
import { routePointToPoint } from "./point-to-point";
import { assessRouteQuality } from "./quality";
import { routeSimilarity } from "./similarity";

export { adjustRequest, ADJUSTMENT_LABELS } from "./adjust";
export { buildRouteResult } from "./build";
export { assessRouteQuality } from "./quality";
export { routeSimilarity } from "./similarity";
export { ROUTE_ENGINE } from "./config";

export interface GeneratorDependencies {
  routing: RoutingProvider;
  elevation: ElevationProvider;
  /** Max simultaneous routing calls. */
  concurrency?: number;
  /** Max elevation samples per route. */
  elevationSamples?: number;
  /** Number of initial loop candidates (default 12). */
  candidateCount?: number;
  /** Max refinement passes per candidate (default 2). */
  maxIterations?: number;
  /** Routing-call budget for one generation (default 40). */
  maxRoutingCalls?: number;
  signal?: AbortSignal;
  /** Progress reporting (streamed to the client). */
  onProgress?(progress: GenerationProgress): void;
}

/** Two proposals sharing more ground than this are not shown together. */
export const MAX_VARIANT_SIMILARITY = ROUTE_ENGINE.similarity.maxBetweenVariants;

interface Draft {
  raw: RawRoute;
  style: RouteStyle;
  waypoints: RouteWaypoint[];
  quality: RouteQualityReport;
  debug: { strategy?: string; bearing?: number; iterations?: number; candidateScore?: number; distanceError?: number };
}

/**
 * Entry point of the route engine: turns a RouteRequest into up to three
 * fully described proposals (fast / balanced / adventure), best first.
 */
export async function generateRoutes(input: RouteRequest, deps: GeneratorDependencies): Promise<RouteGenerationResult> {
  const startedAt = performance.now();
  const timings: RouteGenerationResult["timings"] = {};
  const stageStart: Partial<Record<GenerationStage, number>> = {};
  const enter = (stage: GenerationStage, message: string, detail?: string) => {
    stageStart[stage] = performance.now();
    deps.onProgress?.({ stage, message, detail });
  };
  const leave = (stage: GenerationStage) => {
    const s = stageStart[stage];
    if (s !== undefined) timings[stage] = Math.round((timings[stage] ?? 0) + performance.now() - s);
  };

  const request = normaliseRequest(input);
  const styles = request.styles && request.styles.length > 0 ? request.styles : [...ROUTE_STYLES];
  const notes: string[] = [];
  const activityProfile = getActivityProfile(request.activity);
  const STYLE_LABELS = getStyleLabels(request.activity);
  let distanceMismatch: RouteGenerationResult["distanceMismatch"];
  const baseProfile: RoutingProfileOptions = { activity: request.activity, style: "balanced", preferences: request.preferences ?? {} };
  let routingCalls = 0;
  let candidatesEvaluated = 0;

  enter("candidates", "Création des variantes");
  const drafts: Draft[] = [];

  if (request.mode === "loop") {
    const targetM = request.distanceKm! * 1000;
    const tolerance = request.distanceTolerance ?? ROUTE_ENGINE.distance.tolerance;
    let announcedRouting = false;
    const search = await searchLoops(deps.routing, {
      start: request.start,
      targetM,
      tolerance,
      maxTolerance: Math.max(ROUTE_ENGINE.distance.maxTolerance, tolerance * 2),
      seed: request.seed!,
      profile: baseProfile,
      activityProfile,
      candidateCount: deps.candidateCount,
      maxIterations: deps.maxIterations,
      maxRoutingCalls: deps.maxRoutingCalls,
      concurrency: deps.concurrency,
      signal: deps.signal,
      keep: styles.length + ROUTE_ENGINE.candidates.spareKept,
      maxSimilarity: MAX_VARIANT_SIMILARITY,
      onProgress: ({ routingCalls: calls, evaluated }) => {
        if (!announcedRouting) {
          leave("candidates");
          enter("routing", "Calcul des itinéraires");
          announcedRouting = true;
        }
        deps.onProgress?.({ stage: "routing", message: "Calcul des itinéraires", detail: `${evaluated} candidat${evaluated > 1 ? "s" : ""} évalué${evaluated > 1 ? "s" : ""} · ${calls} appels` });
      },
    });
    if (!announcedRouting) {
      leave("candidates");
      enter("routing", "Calcul des itinéraires");
    }
    notes.push(...search.notes);
    routingCalls += search.routingCalls;
    candidatesEvaluated += search.evaluated.length;
    if (search.nearMiss) {
      const best = search.candidates[0]!;
      distanceMismatch = { requestedKm: request.distanceKm!, bestKm: Math.round(best.raw.distanceM / 100) / 10 };
    }

    // The best candidate keeps the balanced costing it was computed with (when
    // requested); the others are re-routed with the remaining styles.
    const ordered: RouteStyle[] = styles.includes("balanced") ? ["balanced", ...styles.filter((s) => s !== "balanced")] : [...styles];
    const pool = [...search.candidates];
    const used = new Set<LoopCandidate>();
    const takeCandidate = (): LoopCandidate | undefined => pool.find((c) => !used.has(c));

    for (const style of ordered) {
      const candidate = takeCandidate() ?? search.candidates[0];
      if (!candidate) break;
      used.add(candidate);
      // Near misses are presented as they are: no restyling that would drift the distance further.
      if (style === "balanced" || search.nearMiss) {
        drafts.push(loopDraft(candidate, search.nearMiss ? "balanced" : style, request));
        continue;
      }
      try {
        const restyled = await restyleLoop(deps.routing, candidate, request.start, targetM, style, baseProfile, activityProfile, search.toleranceUsed, deps.signal);
        routingCalls += restyled.routingCalls;
        candidatesEvaluated += 1;
        const c = restyled.candidate;
        // Restyled route unusable: keep the balanced geometry, honestly labelled.
        if (c.quality.rejected || c.distanceError > Math.max(ROUTE_ENGINE.distance.maxTolerance, search.toleranceUsed)) {
          drafts.push(loopDraft(candidate, "balanced", request));
          notes.push(`La variante « ${STYLE_LABELS[style]} » n'a pas pu être construite dans la tolérance de distance.`);
        } else {
          drafts.push(loopDraft(c, style, request));
        }
      } catch (e) {
        if (e instanceof AppError && (e.code === "PROVIDER_TIMEOUT" || e.code === "PROVIDER_UNAVAILABLE")) {
          drafts.push(loopDraft(candidate, "balanced", request));
          notes.push(`La variante « ${STYLE_LABELS[style]} » n'a pas pu être calculée (service indisponible).`);
        } else {
          drafts.push(loopDraft(candidate, "balanced", request));
        }
      }
    }
    leave("routing");
  } else {
    if (!request.end) throw new AppError("INVALID_REQUEST", "Un point d'arrivée est requis.");
    leave("candidates");
    enter("routing", "Calcul des itinéraires");
    const targetM = request.distanceKm ? request.distanceKm * 1000 : undefined;
    const results = await settledValues(
      styles.map(async (style) => {
        const c = await routePointToPoint(deps.routing, {
          start: request.start,
          end: request.end!,
          targetM,
          tolerance: request.distanceTolerance ?? ROUTE_ENGINE.distance.tolerance,
          seed: request.seed!,
          profile: { ...baseProfile, style },
          signal: deps.signal,
          maxIterations: deps.maxIterations !== undefined ? deps.maxIterations + 1 : undefined,
        });
        return { style, c };
      }),
    );
    for (const { style, c } of results.values) {
      routingCalls += c.routingCalls;
      candidatesEvaluated += c.iterations;
      const quality = assessRouteQuality({
        coordinates: c.raw.coordinates,
        distanceM: c.raw.distanceM,
        targetM,
        start: request.start,
        waypoints: c.waypoints,
        isLoop: false,
        profile: activityProfile,
        segments: c.raw.segments,
        maxDistanceError: Math.max(ROUTE_ENGINE.distance.maxTolerance, (request.distanceTolerance ?? ROUTE_ENGINE.distance.tolerance) * 2),
      });
      if (!quality.geometryValid) continue;
      if (targetM && quality.rejected && quality.reasons.some((r) => r.startsWith("Distance"))) {
        const bestKm = Math.round(c.raw.distanceM / 100) / 10;
        if (!distanceMismatch || Math.abs(bestKm - request.distanceKm!) < Math.abs(distanceMismatch.bestKm - request.distanceKm!)) {
          distanceMismatch = { requestedKm: request.distanceKm!, bestKm };
        }
      }
      const coords = [{ ...request.start }, ...c.waypoints.slice(1, -1), { ...request.end }];
      drafts.push({
        raw: c.raw,
        style,
        waypoints: makeWaypoints(coords, "point_to_point"),
        quality,
        debug: { iterations: c.iterations, distanceError: c.distanceError, candidateScore: quality.qualityScore },
      });
    }
    if (drafts.length === 0) {
      const first = results.errors[0];
      throw first instanceof AppError ? first : new AppError("NO_ROUTE");
    }
    leave("routing");
  }

  if (drafts.length === 0) throw new AppError("NO_ROUTE");

  enter("elevation", "Analyse de l'altitude");
  const routes = await mapLimit(drafts, 3, async (draft) => finaliseRoute(draft.raw, draft.style, draft.waypoints, request, deps, { quality: draft.quality, debug: draft.debug }));
  leave("elevation");

  enter("scoring", "Sélection des meilleurs parcours");
  dedupe(routes);
  routes.sort((a, b) => b.score.total - a.score.total);
  annotateSimilarity(routes);
  addComparativeInsights(routes);
  leave("scoring");

  if (!routes.some((r) => r.stats.hasElevation)) notes.push("Altitude indisponible : le dénivelé n'a pas pu être calculé.");
  timings.total = Math.round(performance.now() - startedAt);
  deps.onProgress?.({ stage: "done", message: "Terminé" });
  return { routes, notes: [...new Set(notes)], provider: deps.routing.id, timings, routingCalls, candidatesEvaluated, distanceMismatch };
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
  const first = params.waypoints[0]!;
  const last = params.waypoints[params.waypoints.length - 1]!;
  const isLoop = Math.abs(first.lat - last.lat) < 1e-5 && Math.abs(first.lng - last.lng) < 1e-5;
  const quality = assessRouteQuality({
    coordinates: raw.coordinates,
    distanceM: raw.distanceM,
    start: first,
    waypoints: params.waypoints,
    isLoop,
    profile: getActivityProfile(request.activity),
    segments: raw.segments,
  });
  return finaliseRoute(raw, params.style, params.waypoints, request, deps, { name: params.name, id: params.id, quality });
}

// ---------------------------------------------------------------------------

function loopDraft(candidate: LoopCandidate, style: RouteStyle, request: RouteRequest): Draft {
  const coords = candidate.waypoints.map((w, i) => (i === 0 || i === candidate.waypoints.length - 1 ? { ...w, name: request.start.name } : w));
  return {
    raw: candidate.raw,
    style,
    waypoints: makeWaypoints(coords, "loop"),
    quality: candidate.quality,
    debug: {
      strategy: candidate.shape.radiusM > 0 ? candidate.shape.strategy : "native_round_trip",
      bearing: Math.round(candidate.shape.bearing),
      iterations: candidate.iterations,
      candidateScore: Math.round(candidate.score),
      distanceError: Math.round(candidate.distanceError * 1000) / 1000,
    },
  };
}

async function finaliseRoute(
  raw: RawRoute,
  style: RouteStyle,
  waypoints: RouteWaypoint[],
  request: RouteRequest,
  deps: GeneratorDependencies,
  extra: { name?: string; id?: string; quality?: RouteQualityReport; debug?: Draft["debug"] } = {},
): Promise<RouteResult> {
  const profile: RoutingProfileOptions = { activity: request.activity, style, preferences: request.preferences ?? {} };
  const timings: NonNullable<RouteResult["debug"]>["timings"] = {};

  const detailsStart = performance.now();
  const elevationStart = performance.now();
  const [segments, enriched] = await Promise.all([
    resolveSegments(raw, profile, deps).then((s) => {
      timings.details = Math.round(performance.now() - detailsStart);
      return s;
    }),
    enrichWithElevation(toRoutePoints(raw.coordinates), deps.elevation, { maxSamples: deps.elevationSamples ?? 300, signal: deps.signal }).then((e) => {
      timings.elevation = Math.round(performance.now() - elevationStart);
      return e;
    }),
  ]);

  const points: RoutePoint[] = enriched.points;
  const scoringStart = performance.now();
  const result = buildRouteResult({
    request,
    style,
    raw,
    points,
    segments,
    waypoints,
    provider: deps.routing.id,
    name: extra.name,
    id: extra.id,
    quality: extra.quality,
    debug: { ...(extra.debug ?? {}), timings },
  });
  timings.scoring = Math.round(performance.now() - scoringStart);
  if (!extra.name) result.name = `${result.name} · ${getStyleLabels(request.activity)[style]}`;
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

/** Records, for each proposal, how similar it is to the best other one (shown as "variety"). */
function annotateSimilarity(routes: RouteResult[]): void {
  for (const r of routes) {
    if (!r.quality) continue;
    let best = 0;
    for (const other of routes) {
      if (other === r) continue;
      best = Math.max(best, routeSimilarity(r.points, other.points, ROUTE_ENGINE.similarity.cellM));
    }
    r.quality.similarityToBest = routes.length > 1 ? Math.round(best * 1000) / 1000 : undefined;
  }
}

/** Removes proposals that are geometrically the same route (similarity ≥ MAX_VARIANT_SIMILARITY). */
function dedupe(routes: RouteResult[]): void {
  routes.sort((a, b) => b.score.total - a.score.total);
  for (let i = routes.length - 1; i > 0; i--) {
    const a = routes[i]!;
    for (let j = 0; j < i; j++) {
      const b = routes[j]!;
      if (routeSimilarity(a.points, b.points) >= MAX_VARIANT_SIMILARITY) {
        routes.splice(i, 1);
        break;
      }
    }
  }
}
