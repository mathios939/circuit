import type { ActivityProfile, RouteDNA, RouteStatistics } from "@/lib/types";
import { clamp } from "@/lib/utils/format";

/**
 * "Route DNA" — five 0..100 indicators summarising the character of a route.
 * They are estimations derived from way types, surfaces and elevation; when
 * the underlying data is partial the `estimated` flag is raised so the UI can
 * say so.
 */
export function computeRouteDNA(stats: RouteStatistics, profile: ActivityProfile): RouteDNA {
  const w = stats.ways;
  const s = stats.surfaces;
  const km = Math.max(0.1, stats.distanceM / 1000);
  const coverage = stats.surfaceCoverage;

  const natureRaw = w.path + w.track + w.cycleway * 0.5 + w.footway * 0.3 + s.trail * 0.3 + s.gravel * 0.2;
  const calmRaw = 1 - w.major_road * 3 - w.road * 0.8 + w.residential * 0.1 + (w.path + w.track + w.cycleway) * 0.4;

  const distanceLoad = km / profile.difficulty.longDistanceKm;
  const ascentLoad = stats.hasElevation ? stats.ascentM / profile.difficulty.hillyAscentM : 0.35;
  const difficultyRaw = distanceLoad * 0.5 + ascentLoad * 0.6;

  const technicalRaw = w.path * 1.1 + w.track * 0.5 + s.trail * 0.5 + (stats.maxGradientPct !== undefined && stats.maxGradientPct > 12 ? 0.2 : 0);

  // Panorama proxy: relief (gain per km + max altitude) and natural surroundings.
  const reliefPerKm = stats.hasElevation ? stats.ascentM / km : 10;
  const altitude = stats.maxEleM ?? 300;
  const panoramaRaw = clamp(reliefPerKm / 40, 0, 0.6) + clamp((altitude - 200) / 2500, 0, 0.3) + natureRaw * 0.3;

  const blend = (raw: number, fallback: number) => Math.round(clamp(coverage * raw + (1 - coverage) * fallback, 0, 1) * 100);

  return {
    nature: blend(natureRaw, 0.5),
    calm: blend(calmRaw, 0.5),
    difficulty: Math.round(clamp(difficultyRaw, 0, 1) * 100),
    technical: blend(technicalRaw, profile.locomotion === "pedestrian" ? 0.3 : 0.2),
    panorama: Math.round(clamp(panoramaRaw, 0, 1) * 100),
    estimated: coverage < 0.8 || !stats.hasElevation,
  };
}
