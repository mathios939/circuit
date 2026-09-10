import type { LatLng, RouteResult, RouteWaypoint } from "@/lib/types";
import { nearestPointIndex, pointAtDistance } from "@/lib/geo";
import { snapWaypointIndices } from "@/lib/routing/snap";
import { shortId } from "@/lib/utils/id";

/**
 * Pure waypoint-editing operations. They return the new waypoint list; the
 * caller is responsible for recalculating the route through it.
 */

/** Inserts a via waypoint at `position`, between the two waypoints surrounding the closest route vertex. */
export function insertWaypoint(route: RouteResult, position: LatLng): RouteWaypoint[] {
  const { index } = nearestPointIndex(route.points, position);
  const indices = snapWaypointIndices(route.points, route.waypoints);
  let insertAt = route.waypoints.length - 1;
  for (let i = 1; i < indices.length; i++) {
    if (index <= indices[i]!) {
      insertAt = i;
      break;
    }
  }
  const wp: RouteWaypoint = { id: shortId(6), kind: "via", lat: position.lat, lng: position.lng };
  return [...route.waypoints.slice(0, insertAt), wp, ...route.waypoints.slice(insertAt)];
}

export function removeWaypoint(waypoints: readonly RouteWaypoint[], id: string): RouteWaypoint[] {
  const target = waypoints.find((w) => w.id === id);
  if (!target || target.kind !== "via") return [...waypoints];
  return waypoints.filter((w) => w.id !== id);
}

export function moveWaypoint(waypoints: readonly RouteWaypoint[], id: string, position: LatLng): RouteWaypoint[] {
  const isLoop = waypoints.length > 1 && sameSpot(waypoints[0]!, waypoints[waypoints.length - 1]!);
  return waypoints.map((w, i) => {
    if (w.id === id) return { ...w, lat: position.lat, lng: position.lng, name: w.kind === "via" ? undefined : w.name };
    // Keep loop closed when the start is moved.
    if (isLoop && (i === 0 || i === waypoints.length - 1) && (waypoints[0]!.id === id || waypoints[waypoints.length - 1]!.id === id)) {
      return { ...w, lat: position.lat, lng: position.lng };
    }
    return w;
  });
}

export function reverseWaypoints(waypoints: readonly RouteWaypoint[]): RouteWaypoint[] {
  const reversed = [...waypoints].reverse();
  return reversed.map((w, i) => ({
    ...w,
    kind: i === 0 ? "start" : i === reversed.length - 1 ? (w.kind === "via" ? "via" : "end") : "via",
  }));
}

export function setStart(waypoints: readonly RouteWaypoint[], position: LatLng & { name?: string }): RouteWaypoint[] {
  return moveWaypoint(waypoints, waypoints[0]!.id, position).map((w, i) => (i === 0 ? { ...w, name: position.name } : w));
}

export function setEnd(waypoints: readonly RouteWaypoint[], position: LatLng & { name?: string }): RouteWaypoint[] {
  const last = waypoints.length - 1;
  return waypoints.map((w, i) => (i === last ? { ...w, kind: "end", lat: position.lat, lng: position.lng, name: position.name } : w));
}

/**
 * Cuts the route between two positions: every via waypoint between them is
 * removed and the two cut points become waypoints, so the recalculated route
 * takes the direct way between them (a shortcut).
 */
export function cutBetween(route: RouteResult, a: LatLng, b: LatLng): RouteWaypoint[] {
  const ia = nearestPointIndex(route.points, a).index;
  const ib = nearestPointIndex(route.points, b).index;
  const [from, to] = ia <= ib ? [ia, ib] : [ib, ia];
  const indices = snapWaypointIndices(route.points, route.waypoints);
  const kept: RouteWaypoint[] = [];
  let inserted = false;
  for (let i = 0; i < route.waypoints.length; i++) {
    const idx = indices[i]!;
    const w = route.waypoints[i]!;
    const isEndpoint = i === 0 || i === route.waypoints.length - 1;
    // Via points inside the cut disappear.
    if (!isEndpoint && idx > from && idx < to) continue;
    // The cut points are inserted right before the first waypoint located after the cut.
    if (!inserted && idx >= to && i > 0) {
      kept.push(viaAt(route, from), viaAt(route, to));
      inserted = true;
    }
    kept.push(w);
  }
  return kept;
}

function viaAt(route: RouteResult, index: number): RouteWaypoint {
  const p = route.points[index]!;
  return { id: shortId(6), kind: "via", lat: p.lat, lng: p.lng };
}

/** Evenly spaced via points describing an imported track, so that it can be edited. */
export function waypointsFromTrack(route: { points: RouteResult["points"] }, viaCount = 4, startName = "Départ", endName = "Arrivée"): RouteWaypoint[] {
  const pts = route.points;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const isLoop = sameSpot(first, last, 150);
  const total = last.dist;
  const out: RouteWaypoint[] = [{ id: shortId(6), kind: "start", lat: first.lat, lng: first.lng, name: startName }];
  for (let i = 1; i <= viaCount; i++) {
    const p = pointAtDistance(pts, (total * i) / (viaCount + 1));
    if (p) out.push({ id: shortId(6), kind: "via", lat: p.lat, lng: p.lng });
  }
  out.push(isLoop ? { id: shortId(6), kind: "via", lat: first.lat, lng: first.lng, name: startName } : { id: shortId(6), kind: "end", lat: last.lat, lng: last.lng, name: endName });
  return out;
}

export function sameSpot(a: LatLng, b: LatLng, toleranceM = 5): boolean {
  const dLat = Math.abs(a.lat - b.lat) * 111_320;
  const dLng = Math.abs(a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) <= toleranceM;
}
