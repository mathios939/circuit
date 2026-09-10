import { describe, expect, it } from "vitest";
import { toRoutePoints } from "@/lib/geo";
import type { RouteResult, RouteWaypoint } from "@/lib/types";
import { buildRouteResult } from "@/lib/route-generator/build";
import { cutBetween, insertWaypoint, moveWaypoint, removeWaypoint, reverseWaypoints, waypointsFromTrack } from "./waypoints";

/** A straight north-bound route of 20 points with 3 waypoints (start, via at the middle, end). */
function makeRoute(): RouteResult {
  const coords = Array.from({ length: 21 }, (_, i) => ({ lat: 45 + i * 0.001, lng: 6 }));
  const waypoints: RouteWaypoint[] = [
    { id: "s", kind: "start", lat: 45, lng: 6, name: "A" },
    { id: "v", kind: "via", lat: 45.01, lng: 6 },
    { id: "e", kind: "end", lat: 45.02, lng: 6, name: "B" },
  ];
  return buildRouteResult({
    request: { mode: "point_to_point", activity: "running", start: { lat: 45, lng: 6, name: "A" }, end: { lat: 45.02, lng: 6, name: "B" } },
    style: "balanced",
    raw: { coordinates: coords, distanceM: toRoutePoints(coords)[20]!.dist },
    waypoints,
    provider: "test",
  });
}

describe("waypoint editing", () => {
  it("inserts a via waypoint between the surrounding waypoints", () => {
    const route = makeRoute();
    const out = insertWaypoint(route, { lat: 45.005, lng: 6.0005 });
    expect(out).toHaveLength(4);
    expect(out[1]!.kind).toBe("via");
    expect(out[1]!.lat).toBeCloseTo(45.005, 6);
    expect(out[2]!.id).toBe("v");
    const late = insertWaypoint(route, { lat: 45.015, lng: 6 });
    expect(late[2]!.lat).toBeCloseTo(45.015, 6);
    expect(late[3]!.id).toBe("e");
  });

  it("removes only via waypoints", () => {
    const route = makeRoute();
    expect(removeWaypoint(route.waypoints, "v")).toHaveLength(2);
    expect(removeWaypoint(route.waypoints, "s")).toHaveLength(3);
  });

  it("moves a waypoint and keeps loops closed", () => {
    const route = makeRoute();
    const moved = moveWaypoint(route.waypoints, "v", { lat: 45.011, lng: 6.001 });
    expect(moved[1]!.lng).toBe(6.001);
    const loop: RouteWaypoint[] = [
      { id: "s", kind: "start", lat: 45, lng: 6 },
      { id: "v", kind: "via", lat: 45.01, lng: 6 },
      { id: "x", kind: "via", lat: 45, lng: 6 },
    ];
    const movedLoop = moveWaypoint(loop, "s", { lat: 45.1, lng: 6.1 });
    expect(movedLoop[0]!.lat).toBe(45.1);
    expect(movedLoop[2]!.lat).toBe(45.1);
  });

  it("reverses direction and swaps start / end", () => {
    const route = makeRoute();
    const reversed = reverseWaypoints(route.waypoints);
    expect(reversed[0]!.id).toBe("e");
    expect(reversed[0]!.kind).toBe("start");
    expect(reversed[2]!.kind).toBe("end");
  });

  it("cuts a section: vias inside disappear, cut points become vias", () => {
    const route = makeRoute();
    const out = cutBetween(route, { lat: 45.005, lng: 6 }, { lat: 45.015, lng: 6 });
    expect(out.map((w) => w.kind)).toEqual(["start", "via", "via", "end"]);
    expect(out.find((w) => w.id === "v")).toBeUndefined();
    expect(out[1]!.lat).toBeCloseTo(45.005, 3);
    expect(out[2]!.lat).toBeCloseTo(45.015, 3);
  });

  it("derives editable waypoints from an imported track", () => {
    const route = makeRoute();
    const wps = waypointsFromTrack(route, 3);
    expect(wps).toHaveLength(5);
    expect(wps[0]!.kind).toBe("start");
    expect(wps[4]!.kind).toBe("end");
  });
});
