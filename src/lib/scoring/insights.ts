import type { ActivityProfile, RouteInsight, RouteRequest, RouteResult, RouteStatistics } from "@/lib/types";
import { formatElevation } from "@/lib/utils/format";

/**
 * Produces human-readable explanations of why a route is proposed, plus
 * warnings the user should know about (unpaved sections, big roads, ...).
 */
export function buildInsights(request: RouteRequest, stats: RouteStatistics, profile: ActivityProfile): RouteInsight[] {
  const out: RouteInsight[] = [];

  if (request.distanceKm) {
    const error = Math.abs(stats.distanceM / 1000 - request.distanceKm) / request.distanceKm;
    if (error <= 0.03) out.push({ tone: "positive", message: "Distance très proche de votre objectif." });
    else if (error <= 0.08) out.push({ tone: "neutral", message: "Distance proche de votre objectif." });
    else out.push({ tone: "warning", message: `Distance éloignée de l'objectif (${Math.round(error * 100)} % d'écart).` });
  }

  if (stats.overlapRatio > 0.25) {
    out.push({ tone: "warning", message: `Environ ${Math.round(stats.overlapRatio * 100)} % du tracé est parcouru deux fois.` });
  }

  if (stats.surfaceCoverage > 0.3) {
    const unpaved = stats.surfaces.gravel + stats.surfaces.trail;
    if (profile.locomotion === "bicycle" && stats.ways.cycleway > 0.25) {
      out.push({ tone: "positive", message: "Ce parcours contient beaucoup de voies cyclables." });
    }
    if (profile.id === "road_cycling" && unpaved > 0.05) {
      out.push({ tone: "warning", message: `Attention : environ ${Math.round(unpaved * 100)} % du parcours pourrait être non goudronné.` });
    } else if (unpaved > 0.3 && (profile.id === "gravel" || profile.id === "mtb" || profile.id === "trail_running" || profile.id === "hiking")) {
      out.push({ tone: "positive", message: `${Math.round(unpaved * 100)} % de pistes et chemins : idéal pour ${activityLabel(profile)}.` });
    }
    if (stats.ways.major_road > 0.1) {
      out.push({ tone: "warning", message: `${Math.round(stats.ways.major_road * 100)} % du parcours emprunte de grands axes.` });
    } else if (stats.ways.major_road < 0.02 && stats.ways.road < 0.3) {
      out.push({ tone: "positive", message: "Parcours principalement sur voies calmes." });
    }
    if (stats.ways.path + stats.ways.track > 0.5) {
      out.push({ tone: "positive", message: "Parcours majoritairement en pleine nature." });
    }
  } else {
    out.push({ tone: "neutral", message: "Revêtement non renseigné par le moteur de routing : les estimations de surface sont approximatives." });
  }

  if (stats.hasElevation) {
    if (request.elevationTargetM !== undefined) {
      const diff = stats.ascentM - request.elevationTargetM;
      if (Math.abs(diff) <= request.elevationTargetM * 0.15) out.push({ tone: "positive", message: "Dénivelé conforme à votre objectif." });
      else out.push({ tone: "neutral", message: `Dénivelé ${diff > 0 ? "supérieur" : "inférieur"} à l'objectif de ${formatElevation(Math.abs(diff))}.` });
    }
    if (request.elevationMaxM !== undefined && stats.ascentM > request.elevationMaxM) {
      out.push({ tone: "warning", message: `Dépasse le dénivelé maximal souhaité (${formatElevation(stats.ascentM, "+")}).` });
    }
    if (stats.maxGradientPct !== undefined && stats.maxGradientPct >= 12) {
      out.push({ tone: "warning", message: `Passage raide : jusqu'à ${stats.maxGradientPct.toFixed(0)} % de pente.` });
    }
  } else {
    out.push({ tone: "neutral", message: "Altitude indisponible pour ce parcours : dénivelé et difficulté sont estimés." });
  }

  return out.slice(0, 6);
}

/** Adds comparative insights between the variants of one generation. */
export function addComparativeInsights(routes: RouteResult[]): void {
  if (routes.length < 2) return;
  const best = routes[0]!;
  for (const r of routes) {
    if (r === best) continue;
    if (r.stats.hasElevation && best.stats.hasElevation) {
      const diff = r.stats.ascentM - best.stats.ascentM;
      if (Math.abs(diff) >= 150) {
        r.insights.unshift({
          tone: "neutral",
          message: `Cette variante possède ${formatElevation(Math.abs(diff))} de dénivelé ${diff > 0 ? "supplémentaire" : "en moins"} par rapport à la meilleure proposition.`,
        });
      }
    }
    if (r.stats.surfaceCoverage > 0.3 && best.stats.surfaceCoverage > 0.3 && best.stats.ways.major_road + best.stats.ways.road > r.stats.ways.major_road + r.stats.ways.road + 0.15) {
      best.insights.push({ tone: "neutral", message: "Variante plus calme disponible." });
    }
  }
}

function activityLabel(profile: ActivityProfile): string {
  switch (profile.id) {
    case "gravel":
      return "le gravel";
    case "mtb":
      return "le VTT";
    case "trail_running":
      return "le trail";
    case "hiking":
      return "la randonnée";
    default:
      return "cette activité";
  }
}
