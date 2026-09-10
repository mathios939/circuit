import type { RouteAdjustment, RouteRequest, RouteResult } from "@/lib/types";
import { getActivityProfile } from "@/lib/activities/profiles";

export const ADJUSTMENT_LABELS: Record<RouteAdjustment, string> = {
  distance_plus: "+5 km",
  distance_minus: "-5 km",
  elevation_plus: "+200 m D+",
  elevation_minus: "-200 m D+",
  more_nature: "Plus nature",
  more_rolling: "Plus roulant",
  more_quiet: "Plus calme",
  more_technical: "Plus technique",
};

/**
 * Derives a new request from an existing route and a quick adjustment. The
 * seed (hence the loop direction) is preserved so that the regenerated route
 * keeps the general character of the original one.
 */
export function adjustRequest(route: RouteResult, adjustment: RouteAdjustment): RouteRequest {
  const base = route.request;
  if (!base) throw new Error("Route without request cannot be adjusted");
  const profile = getActivityProfile(base.activity);
  const currentKm = route.stats.distanceM / 1000;
  const prefs = { ...(base.preferences ?? {}) };
  const request: RouteRequest = { ...base, preferences: prefs, styles: [route.style] };

  switch (adjustment) {
    case "distance_plus":
      request.distanceKm = Math.min(profile.maxDistanceKm, roundKm(currentKm + 5));
      break;
    case "distance_minus":
      request.distanceKm = Math.max(profile.minDistanceKm, roundKm(currentKm - 5));
      break;
    case "elevation_plus":
      request.elevationTargetM = Math.round((route.stats.ascentM || 0) + 200);
      request.elevationMaxM = undefined;
      prefs.elevationMode = "maximize";
      request.distanceKm ??= roundKm(currentKm);
      request.seed = (base.seed ?? 0) + 1;
      break;
    case "elevation_minus":
      request.elevationTargetM = Math.max(0, Math.round((route.stats.ascentM || 0) - 200));
      prefs.elevationMode = "minimize";
      request.distanceKm ??= roundKm(currentKm);
      request.seed = (base.seed ?? 0) + 1;
      break;
    case "more_nature":
      prefs.preferNature = true;
      prefs.preferTrails = profile.locomotion === "pedestrian" || base.activity !== "road_cycling";
      request.styles = ["adventure"];
      request.distanceKm ??= roundKm(currentKm);
      break;
    case "more_rolling":
      prefs.surface = "paved";
      prefs.preferTrails = false;
      prefs.preferSingletracks = false;
      prefs.preferNature = false;
      request.styles = ["fast"];
      request.distanceKm ??= roundKm(currentKm);
      break;
    case "more_quiet":
      prefs.preferQuietRoads = true;
      prefs.avoidBusyRoads = true;
      request.distanceKm ??= roundKm(currentKm);
      break;
    case "more_technical":
      prefs.preferTrails = true;
      prefs.preferSingletracks = true;
      prefs.surface = "unpaved";
      request.styles = ["adventure"];
      request.distanceKm ??= roundKm(currentKm);
      break;
  }
  return request;
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}
