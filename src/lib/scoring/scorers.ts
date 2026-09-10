import type { ActivityProfile, RouteRequest, RouteScore, RouteScoreSummary, RouteStatistics, RouteStyle, ScoreComponent } from "@/lib/types";
import { clamp } from "@/lib/utils/format";

export interface ScoringContext {
  request: RouteRequest;
  stats: RouteStatistics;
  profile: ActivityProfile;
  style: RouteStyle;
}

export interface ScorerResult {
  value: number;
  detail?: string;
}

/**
 * A scorer evaluates one quality dimension of a route on a 0..1 scale.
 * Weights may depend on the context (style, activity) so that the "fast"
 * variant values efficiency where "adventure" values nature.
 */
export interface Scorer {
  id: string;
  label: string;
  weight(ctx: ScoringContext): number;
  score(ctx: ScoringContext): ScorerResult;
}

const knownSurfaceShare = (s: RouteStatistics) => s.surfaces.paved + s.surfaces.gravel + s.surfaces.trail;

export const distanceFitScorer: Scorer = {
  id: "distance",
  label: "Respect de la distance",
  weight: () => 3,
  score: ({ request, stats }) => {
    if (!request.distanceKm) return { value: 1, detail: "Pas de distance cible" };
    const target = request.distanceKm * 1000;
    const error = Math.abs(stats.distanceM - target) / target;
    // 0 % error → 1, 5 % → 0.75, 10 % → 0.5, ≥ 20 % → 0
    return { value: clamp(1 - error * 5, 0, 1), detail: `${(error * 100).toFixed(1)} % d'écart` };
  },
};

export const overlapScorer: Scorer = {
  id: "overlap",
  label: "Diversité du tracé",
  weight: ({ request }) => (request.mode === "loop" ? 2 : 0.5),
  score: ({ stats }) => {
    // 0 % overlap → 1, 25 % → 0.5, ≥ 50 % → 0
    return { value: clamp(1 - stats.overlapRatio * 2, 0, 1), detail: `${Math.round(stats.overlapRatio * 100)} % de tracé en double` };
  },
};

export const elevationFitScorer: Scorer = {
  id: "elevation",
  label: "Dénivelé",
  weight: ({ request, stats }) => (stats.hasElevation && (request.elevationTargetM || request.elevationMaxM || request.preferences?.elevationMode) ? 2 : 0),
  score: ({ request, stats }) => {
    if (!stats.hasElevation) return { value: 0.5, detail: "Altitude indisponible" };
    const mode = request.preferences?.elevationMode;
    const perKm = stats.ascentM / Math.max(0.1, stats.distanceM / 1000);
    if (request.elevationMaxM !== undefined && stats.ascentM > request.elevationMaxM) {
      const over = (stats.ascentM - request.elevationMaxM) / request.elevationMaxM;
      return { value: clamp(0.5 - over, 0, 0.5), detail: `Dépasse le D+ maximal de ${Math.round(over * 100)} %` };
    }
    if (request.elevationTargetM !== undefined) {
      const error = Math.abs(stats.ascentM - request.elevationTargetM) / Math.max(50, request.elevationTargetM);
      return { value: clamp(1 - error * 2, 0, 1), detail: `${Math.round(error * 100)} % d'écart sur le D+` };
    }
    if (mode === "minimize") return { value: clamp(1 - perKm / 25, 0, 1), detail: `${perKm.toFixed(0)} m/km` };
    if (mode === "maximize") return { value: clamp(perKm / 30, 0, 1), detail: `${perKm.toFixed(0)} m/km` };
    return { value: 0.7 };
  },
};

export const surfaceScorer: Scorer = {
  id: "surface",
  label: "Compatibilité du revêtement",
  weight: ({ stats }) => (stats.surfaceCoverage > 0.3 ? 2 : 0),
  score: ({ stats, profile, request }) => {
    const known = knownSurfaceShare(stats);
    if (known === 0) return { value: 0.5, detail: "Revêtement inconnu" };
    let affinity = profile.surfaceAffinity;
    if (request.preferences?.surface === "paved") affinity = { ...affinity, paved: 1, gravel: 0.2, trail: 0.05 };
    if (request.preferences?.surface === "unpaved") affinity = { ...affinity, paved: 0.3, gravel: 1, trail: 0.9 };
    const value = (stats.surfaces.paved * affinity.paved + stats.surfaces.gravel * affinity.gravel + stats.surfaces.trail * affinity.trail) / known;
    return { value: clamp(value, 0, 1), detail: `${Math.round(stats.surfaces.paved * 100)} % asphalte` };
  },
};

export const safetyScorer: Scorer = {
  id: "safety",
  label: "Sécurité estimée",
  weight: ({ stats, request }) => (stats.surfaceCoverage > 0.3 ? (request.preferences?.avoidBusyRoads || request.preferences?.avoidMajorRoads ? 3 : 1.5) : 0),
  score: ({ stats }) => {
    const major = stats.ways.major_road;
    const road = stats.ways.road;
    // Major roads weigh heavily, secondary roads lightly.
    return { value: clamp(1 - major * 4 - road * 0.4, 0, 1), detail: `${Math.round(major * 100)} % de grands axes` };
  },
};

export const natureScorer: Scorer = {
  id: "nature",
  label: "Environnement naturel",
  weight: ({ stats, style, request }) => {
    if (stats.surfaceCoverage <= 0.3) return 0;
    if (request.preferences?.preferNature || request.preferences?.scenic) return 3;
    return style === "adventure" ? 2 : style === "balanced" ? 1 : 0.3;
  },
  score: ({ stats }) => {
    const w = stats.ways;
    const value = w.path + w.track + w.cycleway * 0.6 + w.footway * 0.4 + w.residential * 0.15;
    return { value: clamp(value, 0, 1), detail: `${Math.round((w.path + w.track) * 100)} % de chemins` };
  },
};

export const cyclewayScorer: Scorer = {
  id: "cycleways",
  label: "Pistes cyclables",
  weight: ({ profile, request, stats }) =>
    profile.locomotion === "bicycle" && stats.surfaceCoverage > 0.3 ? (request.preferences?.preferCycleways ? 2.5 : 0.8) : 0,
  score: ({ stats }) => ({ value: clamp(stats.ways.cycleway * 3, 0, 1), detail: `${Math.round(stats.ways.cycleway * 100)} % de voies cyclables` }),
};

export const activityFitScorer: Scorer = {
  id: "activity",
  label: "Adapté à l'activité",
  weight: ({ stats }) => (stats.surfaceCoverage > 0.3 ? 2 : 0),
  score: ({ stats, profile }) => {
    let value = 0;
    let total = 0;
    for (const [way, share] of Object.entries(stats.ways)) {
      if (way === "other") continue;
      value += share * (profile.wayAffinity[way as keyof typeof profile.wayAffinity] ?? 0.5);
      total += share;
    }
    return { value: total > 0 ? clamp(value / total, 0, 1) : 0.5 };
  },
};

export const turnDensityScorer: Scorer = {
  id: "turns",
  label: "Fluidité",
  weight: ({ stats, style }) => (stats.turnCount === undefined ? 0 : style === "fast" ? 1.5 : 0.5),
  score: ({ stats }) => {
    const perKm = (stats.turnCount ?? 0) / Math.max(0.5, stats.distanceM / 1000);
    // ≤ 2 turns/km → 1, 8 turns/km → 0
    return { value: clamp(1 - (perKm - 2) / 6, 0, 1), detail: `${perKm.toFixed(1)} changements de direction / km` };
  },
};

export const DEFAULT_SCORERS: readonly Scorer[] = [
  distanceFitScorer,
  overlapScorer,
  elevationFitScorer,
  surfaceScorer,
  safetyScorer,
  natureScorer,
  cyclewayScorer,
  activityFitScorer,
  turnDensityScorer,
];

/** Weighted average of every applicable scorer, on a 0..100 scale. */
export function scoreRoute(ctx: ScoringContext, scorers: readonly Scorer[] = DEFAULT_SCORERS): RouteScore {
  const components: ScoreComponent[] = [];
  let weighted = 0;
  let totalWeight = 0;
  for (const scorer of scorers) {
    const weight = scorer.weight(ctx);
    if (weight <= 0) continue;
    const { value, detail } = scorer.score(ctx);
    components.push({ id: scorer.id, label: scorer.label, value, weight, detail });
    weighted += value * weight;
    totalWeight += weight;
  }
  const total = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0;
  return { total, components, summary: buildScoreSummary(ctx, components) };
}

/**
 * Five headline sub-scores shown next to the "Score Circuit". They are
 * estimations: nature and calm derive from OSM way types when the engine
 * reports them (neutral 50 otherwise), difficulty from distance and gain
 * relative to the activity, variety from repeated ground and way diversity.
 */
export function buildScoreSummary(ctx: ScoringContext, components: readonly ScoreComponent[]): RouteScoreSummary {
  const { stats, profile } = ctx;
  const pct = (v: number) => Math.round(clamp(v, 0, 1) * 100);
  const component = (id: string) => components.find((c) => c.id === id)?.value;
  const known = stats.surfaceCoverage > 0.3;
  const w = stats.ways;
  const distanceLoad = stats.distanceM / 1000 / profile.difficulty.longDistanceKm;
  const ascentLoad = stats.hasElevation ? stats.ascentM / profile.difficulty.hillyAscentM : 0.35;
  const ways = Object.entries(w)
    .filter(([k, v]) => k !== "other" && v > 0.01)
    .map(([, v]) => v);
  const entropy = ways.reduce((acc, v) => acc - v * Math.log(v), 0) / Math.log(6);
  return {
    distance: pct(component("distance") ?? 1),
    nature: known ? pct(w.path + w.track + w.cycleway * 0.6 + w.footway * 0.4 + w.residential * 0.15) : 50,
    calm: known ? pct(1 - w.major_road * 4 - w.road * 0.5) : 50,
    difficulty: pct(distanceLoad * 0.5 + ascentLoad * 0.6),
    variety: pct((1 - clamp(stats.overlapRatio * 2, 0, 1)) * 0.6 + (known ? clamp(entropy, 0, 1) : 0.5) * 0.4),
  };
}
