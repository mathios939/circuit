import type { ActivityType, RouteRequest, RouteResult } from "@/lib/types";
import { parseGpx } from "@/lib/gpx/parse";
import { buildRouteResult } from "@/lib/route-generator/build";
import { waypointsFromTrack, sameSpot } from "@/lib/editor/waypoints";

/**
 * Turns a GPX file (already read as text) into a RouteResult that the UI can
 * display, analyse and edit. Everything runs in the browser: the file never
 * leaves the user's machine.
 */
export function importGpxText(xml: string, activity: ActivityType, maxBytes: number): RouteResult {
  const parsed = parseGpx(xml, { maxBytes });
  const first = parsed.points[0]!;
  const last = parsed.points[parsed.points.length - 1]!;
  const isLoop = sameSpot(first, last, 150);
  const name = parsed.name ?? "Parcours importé";

  const request: RouteRequest = {
    mode: isLoop ? "loop" : "point_to_point",
    activity,
    start: { lat: first.lat, lng: first.lng, name: "Départ" },
    end: isLoop ? undefined : { lat: last.lat, lng: last.lng, name: "Arrivée" },
    distanceKm: Math.round((last.dist / 1000) * 10) / 10,
  };

  const waypoints = waypointsFromTrack({ points: parsed.points }, 4, "Départ", "Arrivée");
  return buildRouteResult({
    request,
    style: "balanced",
    raw: { coordinates: parsed.points, distanceM: last.dist },
    points: parsed.points,
    segments: [],
    waypoints,
    provider: "gpx-import",
    name,
  });
}
