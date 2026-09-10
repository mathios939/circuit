import type { LatLng, RouteStyle } from "@/lib/types";
import { AppError } from "@/lib/errors";
import { createLimiter, settledValues } from "@/lib/utils/concurrency";
import { seededRandom } from "@/lib/utils/id";
import type { RawRoute, RoutingProfileOptions, RoutingProvider } from "@/lib/routing/provider";
import { computeOverlapRatio } from "./overlap";
import { loopViaPoints, radiusForDistance, spreadBearings, type LoopShape } from "./candidates";

export interface LoopCandidate {
  raw: RawRoute;
  /** Waypoints (start, vias, start) that produced the route. */
  waypoints: LatLng[];
  shape: LoopShape;
  /** |distance − target| / target */
  distanceError: number;
  overlapRatio: number;
  iterations: number;
}

export interface LoopSearchOptions {
  start: LatLng;
  targetM: number;
  /** Initial tolerance ratio (default 0.05) and maximum after widening (default 0.10). */
  tolerance?: number;
  maxTolerance?: number;
  seed: number;
  profile: RoutingProfileOptions;
  /** Number of directions explored (default 5). */
  directions?: number;
  /** Max refinement iterations per candidate (default 2). */
  maxIterations?: number;
  /** How many candidates to keep (default 3). */
  keep?: number;
  concurrency?: number;
  signal?: AbortSignal;
  /** Overlap ratio above which a loop is rejected (out-and-back). */
  maxOverlap?: number;
}

export interface LoopSearchResult {
  candidates: LoopCandidate[];
  /** Tolerance actually used to accept the candidates. */
  toleranceUsed: number;
  notes: string[];
  routingCalls: number;
}

/**
 * Searches for loops of approximately `targetM` metres starting and ending at
 * `start`:
 *
 * 1. spread N directions around the start (seeded),
 * 2. route through via points placed on a circle for each direction,
 * 3. compare the real distance with the target and rescale the radius,
 * 4. keep candidates inside the tolerance (widened progressively to
 *    `maxTolerance` when nothing fits), reject out-and-back loops,
 * 5. return the best ones, ranked by distance fit and diversity.
 *
 * When the engine supports native round trips, they are used as the initial
 * candidates and refined the same way.
 */
export async function searchLoops(provider: RoutingProvider, options: LoopSearchOptions): Promise<LoopSearchResult> {
  const {
    start,
    targetM,
    seed,
    profile,
    signal,
    tolerance = 0.05,
    maxTolerance = 0.1,
    directions = 5,
    maxIterations = 2,
    keep = 3,
    concurrency = 3,
    maxOverlap = 0.45,
  } = options;

  const limit = createLimiter(concurrency);
  const rnd = seededRandom(seed);
  const bearings = spreadBearings(directions, rnd() * 360);
  let routingCalls = 0;
  const notes: string[] = [];

  const routeShape = async (shape: LoopShape, iterations: number): Promise<LoopCandidate> => {
    const vias = loopViaPoints(start, shape);
    const waypoints = [start, ...vias, start];
    routingCalls++;
    const raw = await limit(() => provider.calculateRoute({ waypoints, profile, signal }));
    return {
      raw,
      waypoints,
      shape,
      distanceError: Math.abs(raw.distanceM - targetM) / targetM,
      overlapRatio: computeOverlapRatio(raw.coordinates),
      iterations,
    };
  };

  // --- Phase 1: one route per direction -----------------------------------
  const initial = bearings.map((bearing, i) => {
    const viaCount: 2 | 3 = i % 2 === 0 ? 3 : 2;
    const shape: LoopShape = { bearing, radiusM: radiusForDistance(targetM, viaCount), viaCount, clockwise: rnd() < 0.5 };
    return routeShape(shape, 1);
  });

  let nativeCandidates: LoopCandidate[] = [];
  if (provider.calculateLoop) {
    const native = [0, 1, 2].map(async (k) => {
      routingCalls++;
      const raw = await limit(() => provider.calculateLoop!({ start, distanceM: targetM, seed: seed + k, profile, signal }));
      return {
        raw,
        waypoints: [start, start],
        shape: { bearing: 0, radiusM: 0, viaCount: 2 as const, clockwise: true },
        distanceError: Math.abs(raw.distanceM - targetM) / targetM,
        overlapRatio: computeOverlapRatio(raw.coordinates),
        iterations: 1,
      } satisfies LoopCandidate;
    });
    nativeCandidates = (await settledValues(native)).values;
  }

  const { values: firstPass, errors } = await settledValues(initial);
  if (firstPass.length === 0 && nativeCandidates.length === 0) {
    const first = errors[0];
    if (first instanceof AppError && first.code !== "NO_ROUTE") throw first;
    throw new AppError("NO_ROUTE");
  }

  // --- Phase 2: refine the radius of the most promising candidates ---------
  let pool = [...firstPass];
  for (let iteration = 2; iteration <= maxIterations + 1; iteration++) {
    const fitting = pool.filter((c) => c.distanceError <= tolerance && c.overlapRatio <= maxOverlap);
    if (fitting.length >= keep) break;
    const toRefine = pool
      .filter((c) => c.distanceError > tolerance)
      .sort((a, b) => a.distanceError - b.distanceError)
      .slice(0, Math.max(keep + 1, 4));
    if (toRefine.length === 0) break;
    const refined = await settledValues(
      toRefine.map((c) => {
        const ratio = targetM / Math.max(1, c.raw.distanceM);
        // Damped update: road networks do not scale linearly with the radius.
        const radiusM = c.shape.radiusM * Math.pow(ratio, 0.85);
        return routeShape({ ...c.shape, radiusM }, iteration);
      }),
    );
    // Keep the better version of every refined candidate.
    for (const r of refined.values) {
      const idx = pool.findIndex((c) => c.shape.bearing === r.shape.bearing);
      if (idx === -1) pool.push(r);
      else if (r.distanceError < pool[idx]!.distanceError) pool[idx] = r;
    }
  }
  pool = [...pool, ...nativeCandidates];

  // --- Phase 3: select ------------------------------------------------------
  let toleranceUsed = tolerance;
  let accepted = pool.filter((c) => c.distanceError <= toleranceUsed && c.overlapRatio <= maxOverlap);
  while (accepted.length === 0 && toleranceUsed < maxTolerance) {
    toleranceUsed = Math.min(maxTolerance, toleranceUsed + 0.025);
    accepted = pool.filter((c) => c.distanceError <= toleranceUsed && c.overlapRatio <= maxOverlap);
  }
  if (accepted.length === 0) {
    // Last resort: accept the closest loops even beyond the tolerance, but say so.
    accepted = pool.filter((c) => c.overlapRatio <= maxOverlap + 0.15).sort((a, b) => a.distanceError - b.distanceError).slice(0, keep);
    if (accepted.length === 0) throw new AppError("NO_ROUTE");
    toleranceUsed = Math.max(...accepted.map((c) => c.distanceError));
    notes.push("Aucune boucle ne respecte la tolérance de distance : les plus proches sont proposées.");
  } else if (toleranceUsed > tolerance) {
    notes.push(`Tolérance de distance élargie à ±${Math.round(toleranceUsed * 100)} % pour trouver des boucles.`);
  }

  accepted.sort((a, b) => preliminaryScore(b) - preliminaryScore(a));
  return { candidates: accepted.slice(0, keep), toleranceUsed, notes, routingCalls };
}

/** Quick ranking before the full scoring pass: distance fit and diversity. */
function preliminaryScore(c: LoopCandidate): number {
  return (1 - Math.min(1, c.distanceError * 5)) * 0.6 + (1 - Math.min(1, c.overlapRatio * 2)) * 0.4;
}

/**
 * Re-routes the same loop geometry with another style's costing, refining
 * the radius once if the distance drifted out of tolerance.
 */
export async function restyleLoop(
  provider: RoutingProvider,
  candidate: LoopCandidate,
  start: LatLng,
  targetM: number,
  style: RouteStyle,
  base: RoutingProfileOptions,
  tolerance: number,
  signal?: AbortSignal,
): Promise<LoopCandidate> {
  const profile: RoutingProfileOptions = { ...base, style };
  const route = async (shape: LoopShape): Promise<LoopCandidate> => {
    const waypoints = shape.radiusM > 0 ? [start, ...loopViaPoints(start, shape), start] : candidate.waypoints;
    const raw = await provider.calculateRoute({ waypoints, profile, signal });
    return {
      raw,
      waypoints,
      shape,
      distanceError: Math.abs(raw.distanceM - targetM) / targetM,
      overlapRatio: computeOverlapRatio(raw.coordinates),
      iterations: candidate.iterations + 1,
    };
  };
  let result = await route(candidate.shape);
  if (result.distanceError > tolerance && candidate.shape.radiusM > 0) {
    const ratio = targetM / Math.max(1, result.raw.distanceM);
    const refined = await route({ ...candidate.shape, radiusM: candidate.shape.radiusM * Math.pow(ratio, 0.85) });
    if (refined.distanceError < result.distanceError) result = refined;
  }
  return result;
}
