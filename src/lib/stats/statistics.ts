import type {
  ActivityType,
  RouteMode,
  RoutePoint,
  RouteSegment,
  RouteStatistics,
  SurfaceBreakdown,
  WayBreakdown,
} from "@/lib/types";
import { SURFACE_TYPES, WAY_TYPES } from "@/lib/types";
import { getActivityProfile } from "@/lib/activities/profiles";
import { computeOverlapRatio } from "@/lib/route-generator/overlap";
import { computeElevationGain } from "./elevation-gain";
import { estimateDurationSeconds } from "./duration";
import { estimateDifficulty } from "./difficulty";

export function emptySurfaceBreakdown(): SurfaceBreakdown {
  return { paved: 0, gravel: 0, trail: 0, unknown: 1 };
}

export function emptyWayBreakdown(): WayBreakdown {
  const out = {} as WayBreakdown;
  for (const w of WAY_TYPES) out[w] = 0;
  out.other = 1;
  return out;
}

/** Aggregates segment attributes into distance shares. */
export function computeBreakdowns(
  segments: readonly RouteSegment[],
  totalM: number,
): { surfaces: SurfaceBreakdown; ways: WayBreakdown; surfaceCoverage: number } {
  if (segments.length === 0 || totalM <= 0) {
    return { surfaces: emptySurfaceBreakdown(), ways: emptyWayBreakdown(), surfaceCoverage: 0 };
  }
  const surfaces = { paved: 0, gravel: 0, trail: 0, unknown: 0 } as SurfaceBreakdown;
  const ways = {} as WayBreakdown;
  for (const w of WAY_TYPES) ways[w] = 0;

  let covered = 0;
  for (const s of segments) {
    surfaces[s.surface] += s.lengthM;
    ways[s.way] += s.lengthM;
    covered += s.lengthM;
  }
  // Segments may not cover the whole route (partial data): treat the remainder as unknown.
  const remainder = Math.max(0, totalM - covered);
  surfaces.unknown += remainder;
  ways.other += remainder;
  const denom = Math.max(totalM, covered);

  for (const k of SURFACE_TYPES) surfaces[k] = surfaces[k] / denom;
  for (const k of WAY_TYPES) ways[k] = ways[k] / denom;
  const surfaceCoverage = 1 - surfaces.unknown;
  return { surfaces, ways, surfaceCoverage };
}

export interface ComputeStatisticsOptions {
  activity: ActivityType;
  mode: RouteMode;
  turnCount?: number;
}

/** Computes every derived statistic of a route from its geometry and segments. */
export function computeRouteStatistics(
  points: readonly RoutePoint[],
  segments: readonly RouteSegment[],
  options: ComputeStatisticsOptions,
): RouteStatistics {
  const profile = getActivityProfile(options.activity);
  const distanceM = points.length > 0 ? points[points.length - 1]!.dist : 0;
  const gain = computeElevationGain(points);
  const { surfaces, ways, surfaceCoverage } = computeBreakdowns(segments, distanceM);
  const overlapRatio = computeOverlapRatio(points);

  const durationS = estimateDurationSeconds(profile, {
    distanceM,
    ascentM: gain.ascentM,
    descentM: gain.descentM,
    surfaces,
  });

  const difficulty = estimateDifficulty(profile, {
    distanceM,
    ascentM: gain.ascentM,
    trailShare: surfaces.trail,
    maxGradientPct: gain.maxGradientPct,
  });

  return {
    distanceM: Math.round(distanceM),
    ascentM: gain.ascentM,
    descentM: gain.descentM,
    ascentRawM: gain.hasElevation ? gain.ascentRawM : undefined,
    minEleM: gain.minEleM,
    maxEleM: gain.maxEleM,
    maxGradientPct: gain.maxGradientPct,
    durationS,
    hasElevation: gain.hasElevation,
    difficulty,
    surfaces,
    ways,
    surfaceCoverage,
    turnCount: options.turnCount,
    overlapRatio,
  };
}
