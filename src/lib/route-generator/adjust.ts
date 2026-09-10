import type { RouteAdjustment, RouteRequest, RouteResult } from "@/lib/types";
import { getActivityProfile } from "@/lib/activities/profiles";

export const ADJUSTMENT_LABELS: Record<RouteAdjustment, string> = {
  distance_plus: "+5 km",
  distance_minus: "−5 km",
  easier: "Plus facile",
  harder: "Plus difficile",
  more_nature: "Plus de nature",
  more_rolling: "Plus roulant",
  less_elevation: "Moins de dénivelé",
  more_elevation: "Plus de dénivelé",
  more_quiet: "Plus calme",
};

/**
 * Derives a new request from an existing route and a quick adjustment.
 *
 * The seed — hence the loop direction and silhouette — is preserved, and the
 * style of the current proposal is kept, so that the regenerated route keeps
 * the general structure of the original one instead of being a random new
 * loop. Only the constraint the user changed moves.
 */
export function adjustRequest(route: RouteResult, adjustment: RouteAdjustment): RouteRequest {
  const base = route.request;
  if (!base) throw new Error("Route without request cannot be adjusted");
  const profile = getActivityProfile(base.activity);
  const currentKm = route.stats.distanceM / 1000;
  const prefs = { ...(base.preferences ?? {}) };
  const request: RouteRequest = { ...base, preferences: prefs, styles: [route.style] };
  const clampKm = (km: number) => Math.min(profile.maxDistanceKm, Math.max(profile.minDistanceKm, roundKm(km)));
  const ascent = route.stats.hasElevation ? route.stats.ascentM : undefined;

  switch (adjustment) {
    case "distance_plus":
      request.distanceKm = clampKm(currentKm + 5);
      break;
    case "distance_minus":
      request.distanceKm = clampKm(currentKm - 5);
      break;
    case "easier":
      // Shorter, flatter, on the simplest ways.
      request.distanceKm = clampKm(currentKm * 0.85);
      prefs.elevationMode = "minimize";
      request.elevationTargetM = undefined;
      request.elevationMaxM = ascent !== undefined ? Math.round(ascent * 0.7) : undefined;
      request.styles = ["fast"];
      break;
    case "harder":
      request.distanceKm = clampKm(currentKm * 1.15);
      prefs.elevationMode = "maximize";
      request.elevationMaxM = undefined;
      request.styles = ["adventure"];
      break;
    case "less_elevation":
      request.distanceKm ??= clampKm(currentKm);
      prefs.elevationMode = "minimize";
      request.elevationMaxM = ascent !== undefined ? Math.max(0, Math.round(ascent - 200)) : undefined;
      request.elevationTargetM = undefined;
      break;
    case "more_elevation":
      request.distanceKm ??= clampKm(currentKm);
      prefs.elevationMode = "maximize";
      request.elevationMaxM = undefined;
      request.elevationTargetM = ascent !== undefined ? Math.round(ascent + 200) : undefined;
      break;
    case "more_nature":
      prefs.preferNature = true;
      prefs.preferTrails = base.activity !== "road_cycling";
      request.styles = ["adventure"];
      request.distanceKm ??= clampKm(currentKm);
      break;
    case "more_rolling":
      prefs.surface = "paved";
      prefs.preferTrails = false;
      prefs.preferSingletracks = false;
      prefs.preferNature = false;
      request.styles = ["fast"];
      request.distanceKm ??= clampKm(currentKm);
      break;
    case "more_quiet":
      prefs.preferQuietRoads = true;
      prefs.avoidBusyRoads = true;
      request.distanceKm ??= clampKm(currentKm);
      break;
  }
  return request;
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}
