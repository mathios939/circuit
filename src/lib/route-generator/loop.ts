import type { ActivityProfile, LatLng, RouteQualityReport, RouteStyle } from "@/lib/types";
import { AppError } from "@/lib/errors";
import { createLimiter, settledValues } from "@/lib/utils/concurrency";
import { seededRandom } from "@/lib/utils/id";
import type { RawRoute, RoutingProfileOptions, RoutingProvider } from "@/lib/routing/provider";
import { initialShapes, loopViaPoints, type LoopShape, type LoopStrategy } from "./candidates";
import { assessRouteQuality } from "./quality";
import { routeSimilarity } from "./similarity";

export interface LoopCandidate {
  raw: RawRoute;
  /** Waypoints (start, vias, start) that produced the route. */
  waypoints: LatLng[];
  shape: LoopShape;
  /** |distance − target| / target */
  distanceError: number;
  quality: RouteQualityReport;
  iterations: number;
  /** Preliminary ranking value (higher is better). */
  score: number;
}

export interface LoopSearchOptions {
  start: LatLng;
  targetM: number;
  /** Tolerance ratio inside which a loop is accepted (default 0.05). */
  tolerance?: number;
  /** Widened tolerance used only when nothing fits the strict one (default 0.10). */
  maxTolerance?: number;
  seed: number;
  profile: RoutingProfileOptions;
  activityProfile: ActivityProfile;
  /** Number of initial candidates (bearings × strategies), default 12. */
  candidateCount?: number;
  /** Max refinement passes per candidate (default 2). */
  maxIterations?: number;
  /** How many candidates to keep (default 3). */
  keep?: number;
  /** Upper bound of routing calls for the whole search. */
  maxRoutingCalls?: number;
  concurrency?: number;
  signal?: AbortSignal;
  /** Similarity above which two kept loops are considered duplicates (default 0.85). */
  maxSimilarity?: number;
  /** Callback fired after each routing call (progress reporting). */
  onProgress?(info: { routingCalls: number; evaluated: number }): void;
}

export interface LoopSearchResult {
  candidates: LoopCandidate[];
  /** Every candidate evaluated (for diagnostics), best first. */
  evaluated: LoopCandidate[];
  /** Tolerance actually used to accept the candidates. */
  toleranceUsed: number;
  notes: string[];
  routingCalls: number;
}

/**
 * Searches for loops of approximately `targetM` metres starting and ending at
 * `start`:
 *
 * 1. `candidateCount` shapes are spread around the start, mixing directions
 *    and silhouettes (radial, biased, directional…);
 * 2. each shape is routed through the engine and its *real* distance is
 *    compared with the target;
 * 3. the scale of the most promising shapes is refined (damped secant
 *    update) for at most `maxIterations` passes, within a routing-call budget;
 * 4. every routed loop goes through the quality gate (distance, out-and-back,
 *    repetitions, U-turns, folded geometry, activity compatibility);
 * 5. accepted loops are ranked and the best ones are kept, discarding those
 *    sharing more than `maxSimilarity` of their ground with a better one.
 *
 * The strict tolerance (±5 %) is widened once (to ±10 %) only when nothing
 * fits; beyond that the search fails explicitly instead of returning a loop
 * of the wrong length.
 */
export async function searchLoops(provider: RoutingProvider, options: LoopSearchOptions): Promise<LoopSearchResult> {
  const {
    start,
    targetM,
    seed,
    profile,
    activityProfile,
    signal,
    tolerance = 0.05,
    maxTolerance = 0.1,
    candidateCount = 12,
    maxIterations = 2,
    keep = 3,
    maxRoutingCalls = 40,
    concurrency = 3,
    maxSimilarity = 0.85,
    onProgress,
  } = options;

  const limit = createLimiter(concurrency);
  const rnd = seededRandom(seed);
  let routingCalls = 0;
  const evaluated: LoopCandidate[] = [];
  const notes: string[] = [];

  const routeShape = async (shape: LoopShape, iterations: number): Promise<LoopCandidate> => {
    const vias = loopViaPoints(start, shape);
    const waypoints = [start, ...vias, start];
    routingCalls++;
    const raw = await limit(() => provider.calculateRoute({ waypoints, profile, signal }));
    const candidate = assess(raw, waypoints, shape, iterations, targetM, start, activityProfile, maxTolerance);
    evaluated.push(candidate);
    onProgress?.({ routingCalls, evaluated: evaluated.length });
    return candidate;
  };

  // --- Phase 1: one route per initial shape --------------------------------
  const shapes = initialShapes(start, targetM, candidateCount, rnd);
  const firstPass = await settledValues(shapes.map((shape) => routeShape(shape, 1)));

  // Native round trips (GraphHopper / openrouteservice) enrich the pool.
  if (provider.calculateLoop && routingCalls < maxRoutingCalls) {
    const native = await settledValues(
      [0, 1].map(async (k) => {
        routingCalls++;
        const raw = await limit(() => provider.calculateLoop!({ start, distanceM: targetM, seed: seed + k, profile, signal }));
        const shape: LoopShape = { strategy: "radial_triangle", bearing: 0, radiusM: 0, clockwise: true, vias: [] };
        const c = assess(raw, [start, start], shape, 1, targetM, start, activityProfile, maxTolerance);
        evaluated.push(c);
        return c;
      }),
    );
    firstPass.values.push(...native.values);
  }

  if (firstPass.values.length === 0) {
    const first = firstPass.errors[0];
    if (first instanceof AppError && first.code !== "NO_ROUTE") throw first;
    throw new AppError("NO_ROUTE");
  }

  // --- Phase 2: refine the scale of the most promising candidates ----------
  const pool = new Map<string, LoopCandidate>();
  const keyOf = (c: LoopCandidate) => `${c.shape.strategy}:${Math.round(c.shape.bearing)}:${c.shape.clockwise}`;
  for (const c of firstPass.values) pool.set(keyOf(c), c);

  for (let pass = 1; pass <= maxIterations; pass++) {
    const fitting = [...pool.values()].filter((c) => c.distanceError <= tolerance && !c.quality.rejected);
    if (fitting.length >= keep + 1) break;
    const toRefine = [...pool.values()]
      .filter((c) => c.shape.radiusM > 0 && c.distanceError > tolerance && c.quality.geometryValid && c.quality.outAndBackRatio < 0.5)
      .sort((a, b) => a.distanceError - b.distanceError)
      .slice(0, Math.max(keep + 2, 5));
    if (toRefine.length === 0) break;
    const budget = maxRoutingCalls - routingCalls;
    if (budget <= 0) {
      notes.push("Budget d'appels de routing atteint avant convergence complète.");
      break;
    }
    const refined = await settledValues(
      toRefine.slice(0, budget).map((c) => {
        const ratio = targetM / Math.max(1, c.raw.distanceM);
        // Damped update: road networks do not scale linearly with the radius.
        const radiusM = c.shape.radiusM * Math.pow(ratio, 0.85);
        return routeShape({ ...c.shape, radiusM }, pass + 1);
      }),
    );
    for (const r of refined.values) {
      const key = keyOf(r);
      const previous = pool.get(key);
      if (!previous || r.distanceError < previous.distanceError || (previous.quality.rejected && !r.quality.rejected)) pool.set(key, r);
    }
  }

  // --- Phase 3: quality gate + selection ------------------------------------
  const all = [...pool.values()];
  let toleranceUsed = tolerance;
  let accepted = all.filter((c) => !c.quality.rejected && c.distanceError <= tolerance);
  if (accepted.length === 0) {
    toleranceUsed = maxTolerance;
    accepted = all.filter((c) => !c.quality.rejected && c.distanceError <= maxTolerance);
    if (accepted.length > 0) notes.push(`Tolérance de distance élargie à ±${Math.round(maxTolerance * 100)} % pour trouver des boucles.`);
  }
  if (accepted.length === 0) {
    const reasons = summariseReasons(all);
    throw new AppError("NO_ROUTE", "Aucune boucle satisfaisante n'a été trouvée pour cette distance depuis ce point. Essayez une autre distance ou un autre départ.", {
      details: `no loop within ±${Math.round(maxTolerance * 100)} % after ${routingCalls} routing calls; ${reasons}`,
    });
  }

  accepted.sort((a, b) => b.score - a.score);
  const selected: LoopCandidate[] = [];
  for (const c of accepted) {
    if (selected.length >= keep) break;
    const duplicate = selected.some((s) => routeSimilarity(s.raw.coordinates, c.raw.coordinates) >= maxSimilarity);
    if (!duplicate) selected.push(c);
  }
  if (selected.length < Math.min(keep, accepted.length)) notes.push("Certaines boucles trop semblables ont été écartées.");

  evaluated.sort((a, b) => b.score - a.score);
  return { candidates: selected, evaluated, toleranceUsed, notes, routingCalls };
}

/**
 * Re-routes the same loop geometry with another style's costing, refining
 * the scale once if the distance drifted out of tolerance.
 */
export async function restyleLoop(
  provider: RoutingProvider,
  candidate: LoopCandidate,
  start: LatLng,
  targetM: number,
  style: RouteStyle,
  base: RoutingProfileOptions,
  activityProfile: ActivityProfile,
  tolerance: number,
  signal?: AbortSignal,
): Promise<{ candidate: LoopCandidate; routingCalls: number }> {
  const profile: RoutingProfileOptions = { ...base, style };
  let routingCalls = 0;
  const route = async (shape: LoopShape): Promise<LoopCandidate> => {
    const waypoints = shape.radiusM > 0 ? [start, ...loopViaPoints(start, shape), start] : candidate.waypoints;
    routingCalls++;
    const raw = await provider.calculateRoute({ waypoints, profile, signal });
    return assess(raw, waypoints, shape, candidate.iterations + 1, targetM, start, activityProfile, Math.max(tolerance, 0.1));
  };
  let result = await route(candidate.shape);
  if (result.distanceError > tolerance && candidate.shape.radiusM > 0) {
    const ratio = targetM / Math.max(1, result.raw.distanceM);
    const refined = await route({ ...candidate.shape, radiusM: candidate.shape.radiusM * Math.pow(ratio, 0.85) });
    if (refined.distanceError < result.distanceError) result = refined;
  }
  return { candidate: result, routingCalls };
}

function assess(
  raw: RawRoute,
  waypoints: LatLng[],
  shape: LoopShape,
  iterations: number,
  targetM: number,
  start: LatLng,
  activityProfile: ActivityProfile,
  maxDistanceError: number,
): LoopCandidate {
  const distanceError = Math.abs(raw.distanceM - targetM) / targetM;
  const quality = assessRouteQuality({
    coordinates: raw.coordinates,
    distanceM: raw.distanceM,
    targetM,
    start,
    waypointCount: waypoints.length,
    isLoop: true,
    profile: activityProfile,
    segments: raw.segments,
    maxDistanceError,
  });
  // Preliminary ranking: quality score, with a strong preference for exact distance.
  const score = quality.qualityScore * 0.7 + (1 - Math.min(1, distanceError * 8)) * 30;
  return { raw, waypoints, shape, distanceError, quality, iterations, score };
}

function summariseReasons(candidates: LoopCandidate[]): string {
  const counts = new Map<string, number>();
  for (const c of candidates) for (const r of c.quality.reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].map(([r, n]) => `${r} ×${n}`).join(", ") || "no candidates";
}

export type { LoopStrategy };
