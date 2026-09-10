import { describe, expect, it } from "vitest";
import { MockElevationProvider } from "@/lib/elevation/mock";
import { MockRoutingProvider } from "@/lib/routing/mock";
import type { RouteRequest } from "@/lib/types";
import { AppError } from "@/lib/errors";
import { haversineDistance } from "@/lib/geo";
import { adjustRequest } from "./adjust";
import { loopViaPoints, radiusForDistance } from "./candidates";
import { generateRoutes, normaliseRequest, recalculateRoute } from "./index";
import { searchLoops } from "./loop";
import { computeOverlapRatio } from "./overlap";

const deps = { routing: new MockRoutingProvider(), elevation: new MockElevationProvider(), concurrency: 4, elevationSamples: 120 };
const annecy = { lat: 45.8992, lng: 6.1294, name: "Annecy" };
const profile = { activity: "road_cycling" as const, style: "balanced" as const, preferences: {} };

describe("loop candidates geometry", () => {
  it("places via points at the requested radius", () => {
    const radiusM = 5000;
    const vias = loopViaPoints(annecy, { bearing: 90, radiusM, viaCount: 3, clockwise: true });
    expect(vias).toHaveLength(3);
    // Every via point lies on a circle centred 5 km east of the start: the far point is ~10 km away.
    const far = vias[1]!;
    expect(haversineDistance(annecy, far)).toBeCloseTo(radiusM * 2, -2);
  });
  it("derives a plausible radius from the target distance", () => {
    const r = radiusForDistance(40_000, 3);
    expect(r).toBeGreaterThan(4000);
    expect(r).toBeLessThan(7000);
  });
});

describe("computeOverlapRatio", () => {
  it("is ~0 for a simple loop and high for an out-and-back", () => {
    const loop = Array.from({ length: 200 }, (_, i) => {
      const a = (i / 200) * Math.PI * 2;
      return { lat: 45 + 0.02 * Math.sin(a), lng: 6 + 0.03 * Math.cos(a) };
    });
    expect(computeOverlapRatio(loop)).toBeLessThan(0.1);
    const out = Array.from({ length: 100 }, (_, i) => ({ lat: 45 + i * 0.0005, lng: 6 }));
    const back = [...out].reverse();
    expect(computeOverlapRatio([...out, ...back])).toBeGreaterThan(0.4);
  });
});

describe("searchLoops (mock engine)", () => {
  it("finds loops within the tolerance of the target distance", async () => {
    const result = await searchLoops(deps.routing, { start: annecy, targetM: 40_000, seed: 42, profile, tolerance: 0.05, maxTolerance: 0.1 });
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    for (const c of result.candidates) {
      expect(c.distanceError).toBeLessThanOrEqual(result.toleranceUsed + 1e-9);
      expect(c.waypoints[0]).toEqual(annecy);
      expect(c.waypoints[c.waypoints.length - 1]).toEqual(annecy);
      expect(c.overlapRatio).toBeLessThan(0.45);
    }
    expect(result.routingCalls).toBeLessThan(20);
  });

  it("produces different loops for different seeds", async () => {
    const a = await searchLoops(deps.routing, { start: annecy, targetM: 20_000, seed: 1, profile });
    const b = await searchLoops(deps.routing, { start: annecy, targetM: 20_000, seed: 2, profile });
    expect(a.candidates[0]!.shape.bearing).not.toBeCloseTo(b.candidates[0]!.shape.bearing, 0);
  });

  it("reports unroutable starts", async () => {
    await expect(searchLoops(deps.routing, { start: { lat: 30, lng: -40 }, targetM: 20_000, seed: 1, profile })).rejects.toMatchObject({ code: "NOT_ROUTABLE" });
  });
});

describe("generateRoutes", () => {
  it("returns up to three scored variants for a loop, best first, with elevation and GPX-ready points", async () => {
    const request: RouteRequest = { mode: "loop", activity: "road_cycling", start: annecy, distanceKm: 50, seed: 7 };
    const result = await generateRoutes(request, deps);
    expect(result.routes.length).toBeGreaterThanOrEqual(1);
    expect(result.routes.length).toBeLessThanOrEqual(3);
    expect(result.provider).toBe("mock");
    const styles = new Set(result.routes.map((r) => r.style));
    expect(styles.size).toBe(result.routes.length);
    for (let i = 1; i < result.routes.length; i++) {
      expect(result.routes[i - 1]!.score.total).toBeGreaterThanOrEqual(result.routes[i]!.score.total);
    }
    const best = result.routes[0]!;
    expect(Math.abs(best.stats.distanceM - 50_000) / 50_000).toBeLessThan(0.12);
    expect(best.stats.hasElevation).toBe(true);
    expect(best.stats.ascentM).toBeGreaterThan(0);
    expect(best.points.length).toBeGreaterThan(50);
    expect(best.points[best.points.length - 1]!.dist).toBeCloseTo(best.stats.distanceM, -1);
    expect(best.waypoints[0]!.kind).toBe("start");
    expect(best.insights.length).toBeGreaterThan(0);
    expect(best.dna.nature).toBeGreaterThanOrEqual(0);
    expect(best.name).toContain("Annecy");
    expect(best.request?.seed).toBe(7);
  });

  it("routes from A to B and honours a distance target with a detour", async () => {
    const end = { lat: 45.95, lng: 6.2, name: "B" };
    const direct = await generateRoutes({ mode: "point_to_point", activity: "running", start: annecy, end, styles: ["balanced"] }, deps);
    expect(direct.routes).toHaveLength(1);
    expect(direct.routes[0]!.waypoints[direct.routes[0]!.waypoints.length - 1]!.kind).toBe("end");
    const directKm = direct.routes[0]!.stats.distanceM / 1000;
    const longer = await generateRoutes({ mode: "point_to_point", activity: "running", start: annecy, end, distanceKm: Math.round(directKm * 2), styles: ["balanced"] }, deps);
    expect(longer.routes[0]!.stats.distanceM).toBeGreaterThan(direct.routes[0]!.stats.distanceM * 1.5);
  });

  it("rejects unrealistic distances with a readable error", async () => {
    await expect(generateRoutes({ mode: "loop", activity: "walking", start: annecy, distanceKm: 300 }, deps)).rejects.toMatchObject({ code: "DISTANCE_UNREALISTIC" });
  });

  it("converts a duration into a distance", () => {
    const r = normaliseRequest({ mode: "loop", activity: "running", start: annecy, durationMinutes: 60 });
    expect(r.distanceKm).toBeGreaterThan(7);
    expect(r.distanceKm).toBeLessThan(10);
  });

  it("derives an elevation mode from the elevation target", () => {
    expect(normaliseRequest({ mode: "loop", activity: "mtb", start: annecy, distanceKm: 30, elevationTargetM: 1000 }).preferences?.elevationMode).toBe("maximize");
    expect(normaliseRequest({ mode: "loop", activity: "mtb", start: annecy, distanceKm: 30, elevationTargetM: 100 }).preferences?.elevationMode).toBe("minimize");
  });
});

describe("recalculateRoute / adjustRequest", () => {
  it("recomputes a route through edited waypoints", async () => {
    const request: RouteRequest = { mode: "loop", activity: "gravel", start: annecy, distanceKm: 20, seed: 3 };
    const { routes } = await generateRoutes(request, deps);
    const route = routes[0]!;
    const moved = route.waypoints.map((w, i) => (w.kind === "via" && i === 1 ? { ...w, lat: w.lat + 0.02 } : w));
    const updated = await recalculateRoute({ request, style: route.style, waypoints: moved, name: route.name }, deps);
    expect(updated.name).toBe(route.name);
    expect(updated.stats.distanceM).not.toBe(route.stats.distanceM);
    expect(updated.waypoints).toHaveLength(route.waypoints.length);
  });

  it("builds adjusted requests that keep the seed", async () => {
    const request: RouteRequest = { mode: "loop", activity: "mtb", start: annecy, distanceKm: 30, seed: 11 };
    const { routes } = await generateRoutes(request, deps);
    const route = routes[0]!;
    const plus = adjustRequest(route, "distance_plus");
    expect(plus.distanceKm).toBeCloseTo(route.stats.distanceM / 1000 + 5, 0);
    expect(plus.seed).toBe(11);
    expect(plus.styles).toEqual([route.style]);
    const nature = adjustRequest(route, "more_nature");
    expect(nature.preferences?.preferNature).toBe(true);
    expect(nature.styles).toEqual(["adventure"]);
    const ele = adjustRequest(route, "elevation_plus");
    expect(ele.elevationTargetM).toBe(route.stats.ascentM + 200);
    expect(ele.preferences?.elevationMode).toBe("maximize");
  });

  it("surfaces routing errors as AppError", async () => {
    await expect(
      recalculateRoute(
        { request: { mode: "point_to_point", activity: "running", start: annecy, end: { lat: 30, lng: -40, name: "Ocean" } }, style: "balanced", waypoints: [{ id: "a", kind: "start", ...annecy }, { id: "b", kind: "end", lat: 30, lng: -40 }] },
        deps,
      ),
    ).rejects.toBeInstanceOf(AppError);
  });
});
