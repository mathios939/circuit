import { describe, expect, it } from "vitest";
import { MockElevationProvider } from "@/lib/elevation/mock";
import { MockRoutingProvider } from "@/lib/routing/mock";
import type { GenerationProgress, RouteRequest } from "@/lib/types";
import { AppError } from "@/lib/errors";
import { getActivityProfile } from "@/lib/activities/profiles";
import { haversineDistance } from "@/lib/geo";
import { adjustRequest } from "./adjust";
import { initialShapes, loopViaPoints, radiusForDistance, shapePerimeter, STRATEGY_TEMPLATES } from "./candidates";
import { generateRoutes, MAX_VARIANT_SIMILARITY, normaliseRequest, recalculateRoute } from "./index";
import { searchLoops } from "./loop";
import { computeOverlapRatio } from "./overlap";
import { routeSimilarity } from "./similarity";

const deps = { routing: new MockRoutingProvider(), elevation: new MockElevationProvider(), concurrency: 4, elevationSamples: 120 };
const annecy = { lat: 45.8992, lng: 6.1294, name: "Annecy" };
const profile = { activity: "road_cycling" as const, style: "balanced" as const, preferences: {} };
const activityProfile = getActivityProfile("road_cycling");

describe("loop candidate shapes", () => {
  it("places via points at the requested scale and produces distinct silhouettes", () => {
    const shape = { strategy: "radial_triangle" as const, bearing: 90, radiusM: 5000, clockwise: false, vias: STRATEGY_TEMPLATES.radial_triangle };
    const vias = loopViaPoints(annecy, shape);
    expect(vias).toHaveLength(2);
    expect(haversineDistance(annecy, vias[0]!)).toBeCloseTo(5000, -2);
    const quad = { ...shape, strategy: "directional_loop" as const, vias: STRATEGY_TEMPLATES.directional_loop };
    expect(shapePerimeter(annecy, quad)).not.toBeCloseTo(shapePerimeter(annecy, shape), -2);
  });
  it("derives a scale so that the polygon perimeter × detour ≈ target for every strategy", () => {
    for (const strategy of ["radial_triangle", "radial_quad", "biased_loop", "directional_loop", "wide_loop"] as const) {
      const r = radiusForDistance(annecy, 40_000, strategy);
      const perimeter = shapePerimeter(annecy, { strategy, bearing: 0, radiusM: r, clockwise: false, vias: STRATEGY_TEMPLATES[strategy] });
      expect(perimeter * 1.25).toBeCloseTo(40_000, -2);
    }
  });
  it("mixes bearings and strategies in the initial candidates", () => {
    let seed = 0.1;
    const shapes = initialShapes(annecy, 30_000, 12, () => (seed = (seed * 9301 + 49297) % 233280) / 233280);
    expect(shapes).toHaveLength(12);
    expect(new Set(shapes.map((s) => s.strategy)).size).toBe(5);
    expect(new Set(shapes.map((s) => Math.round(s.bearing))).size).toBe(12);
  });
});

describe("computeOverlapRatio / routeSimilarity", () => {
  const loop = (radiusLat: number, offsetLng = 0) =>
    Array.from({ length: 200 }, (_, i) => {
      const a = (i / 200) * Math.PI * 2;
      return { lat: 45 + radiusLat * Math.sin(a), lng: 6 + offsetLng + radiusLat * 1.4 * Math.cos(a) };
    });
  it("overlap is ~0 for a simple loop and high for an out-and-back", () => {
    expect(computeOverlapRatio(loop(0.02))).toBeLessThan(0.1);
    const out = Array.from({ length: 100 }, (_, i) => ({ lat: 45 + i * 0.0005, lng: 6 }));
    expect(computeOverlapRatio([...out, ...[...out].reverse()])).toBeGreaterThan(0.4);
  });
  it("similarity is 1 for identical / reversed routes, ~0 for disjoint ones, intermediate for partial overlap", () => {
    const a = loop(0.02);
    expect(routeSimilarity(a, a)).toBeGreaterThan(0.95);
    expect(routeSimilarity(a, [...a].reverse())).toBeGreaterThan(0.95);
    expect(routeSimilarity(a, loop(0.02, 0.2))).toBeLessThan(0.05);
    const partial = routeSimilarity(a, loop(0.02, 0.01));
    expect(partial).toBeGreaterThan(0.02);
    expect(partial).toBeLessThan(0.8);
  });
});

describe("searchLoops (mock engine)", () => {
  it("finds loops within the tolerance, all passing the quality gate, with distinct geometries", async () => {
    const result = await searchLoops(deps.routing, { start: annecy, targetM: 40_000, seed: 42, profile, activityProfile, tolerance: 0.05, maxTolerance: 0.1, candidateCount: 12 });
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    for (const c of result.candidates) {
      expect(c.distanceError).toBeLessThanOrEqual(result.toleranceUsed + 1e-9);
      expect(c.quality.rejected).toBe(false);
      expect(c.quality.geometryValid).toBe(true);
      expect(c.waypoints[0]).toEqual(annecy);
      expect(c.waypoints[c.waypoints.length - 1]).toEqual(annecy);
    }
    for (let i = 0; i < result.candidates.length; i++) {
      for (let j = i + 1; j < result.candidates.length; j++) {
        expect(routeSimilarity(result.candidates[i]!.raw.coordinates, result.candidates[j]!.raw.coordinates)).toBeLessThan(MAX_VARIANT_SIMILARITY);
      }
    }
    expect(result.routingCalls).toBeLessThanOrEqual(40);
    expect(result.evaluated.length).toBeGreaterThanOrEqual(12);
  });

  it("respects the routing-call budget", async () => {
    const result = await searchLoops(deps.routing, { start: annecy, targetM: 25_000, seed: 3, profile, activityProfile, candidateCount: 6, maxRoutingCalls: 8 });
    expect(result.routingCalls).toBeLessThanOrEqual(8);
  });

  it("produces different loops for different seeds", async () => {
    const a = await searchLoops(deps.routing, { start: annecy, targetM: 20_000, seed: 1, profile, activityProfile, candidateCount: 6 });
    const b = await searchLoops(deps.routing, { start: annecy, targetM: 20_000, seed: 2, profile, activityProfile, candidateCount: 6 });
    expect(routeSimilarity(a.candidates[0]!.raw.coordinates, b.candidates[0]!.raw.coordinates)).toBeLessThan(0.85);
  });

  it("reports unroutable starts", async () => {
    await expect(searchLoops(deps.routing, { start: { lat: 30, lng: -40 }, targetM: 20_000, seed: 1, profile, activityProfile })).rejects.toMatchObject({ code: "NOT_ROUTABLE" });
  });
});

describe("generateRoutes", () => {
  it("returns up to three scored, distinct variants with elevation, quality reports and progress events", async () => {
    const request: RouteRequest = { mode: "loop", activity: "road_cycling", start: annecy, distanceKm: 50, seed: 7 };
    const stages: GenerationProgress["stage"][] = [];
    const result = await generateRoutes(request, { ...deps, onProgress: (p) => stages.push(p.stage) });
    expect(result.routes.length).toBeGreaterThanOrEqual(2);
    expect(result.routes.length).toBeLessThanOrEqual(3);
    expect(result.provider).toBe("mock");
    expect(result.routingCalls).toBeGreaterThan(0);
    expect(result.candidatesEvaluated).toBeGreaterThanOrEqual(12);
    expect(result.timings.total).toBeGreaterThanOrEqual(0);
    expect(stages[0]).toBe("candidates");
    expect(stages).toContain("routing");
    expect(stages).toContain("elevation");
    expect(stages[stages.length - 1]).toBe("done");

    for (let i = 1; i < result.routes.length; i++) {
      expect(result.routes[i - 1]!.score.total).toBeGreaterThanOrEqual(result.routes[i]!.score.total);
    }
    for (const r of result.routes) {
      expect(Math.abs(r.stats.distanceM - 50_000) / 50_000).toBeLessThanOrEqual(0.1);
      expect(r.quality?.rejected).toBe(false);
      expect(r.debug?.pointCount).toBe(r.points.length);
      expect(r.stats.hasElevation).toBe(true);
    }
    for (let i = 0; i < result.routes.length; i++) {
      for (let j = i + 1; j < result.routes.length; j++) {
        expect(routeSimilarity(result.routes[i]!.points, result.routes[j]!.points)).toBeLessThan(MAX_VARIANT_SIMILARITY);
      }
    }
    const best = result.routes[0]!;
    expect(best.points[best.points.length - 1]!.dist).toBeCloseTo(best.stats.distanceM, -1);
    expect(best.waypoints[0]!.kind).toBe("start");
    expect(best.name).toContain("Annecy");
    expect(best.request?.seed).toBe(7);
  });

  it("routes from A to B and honours a distance target with a detour", async () => {
    const end = { lat: 45.95, lng: 6.2, name: "B" };
    const direct = await generateRoutes({ mode: "point_to_point", activity: "running", start: annecy, end, styles: ["balanced"] }, deps);
    expect(direct.routes).toHaveLength(1);
    expect(direct.routes[0]!.waypoints[direct.routes[0]!.waypoints.length - 1]!.kind).toBe("end");
    expect(direct.routes[0]!.quality?.geometryValid).toBe(true);
    const directKm = direct.routes[0]!.stats.distanceM / 1000;
    const longer = await generateRoutes({ mode: "point_to_point", activity: "running", start: annecy, end, distanceKm: Math.round(directKm * 2), styles: ["balanced"] }, deps);
    expect(longer.routes[0]!.stats.distanceM).toBeGreaterThan(direct.routes[0]!.stats.distanceM * 1.5);
  });

  it("rejects unrealistic distances with a readable error", async () => {
    await expect(generateRoutes({ mode: "loop", activity: "walking", start: annecy, distanceKm: 300 }, deps)).rejects.toMatchObject({ code: "DISTANCE_UNREALISTIC" });
  });

  it("converts a duration into a distance and derives an elevation mode", () => {
    const r = normaliseRequest({ mode: "loop", activity: "running", start: annecy, durationMinutes: 60 });
    expect(r.distanceKm).toBeGreaterThan(7);
    expect(r.distanceKm).toBeLessThan(10);
    expect(normaliseRequest({ mode: "loop", activity: "mtb", start: annecy, distanceKm: 30, elevationTargetM: 1000 }).preferences?.elevationMode).toBe("maximize");
    expect(normaliseRequest({ mode: "loop", activity: "mtb", start: annecy, distanceKm: 30, elevationTargetM: 100 }).preferences?.elevationMode).toBe("minimize");
  });
});

describe("recalculateRoute / adjustRequest", () => {
  it("recomputes a route through edited waypoints and keeps a quality report", async () => {
    const request: RouteRequest = { mode: "loop", activity: "gravel", start: annecy, distanceKm: 20, seed: 3 };
    const { routes } = await generateRoutes(request, deps);
    const route = routes[0]!;
    const moved = route.waypoints.map((w, i) => (w.kind === "via" && i === 1 ? { ...w, lat: w.lat + 0.02 } : w));
    const updated = await recalculateRoute({ request, style: route.style, waypoints: moved, name: route.name }, deps);
    expect(updated.name).toBe(route.name);
    expect(updated.stats.distanceM).not.toBe(route.stats.distanceM);
    expect(updated.waypoints).toHaveLength(route.waypoints.length);
    expect(updated.quality?.geometryValid).toBe(true);
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
    const ele = adjustRequest(route, "more_elevation");
    expect(ele.elevationTargetM).toBe(route.stats.ascentM + 200);
    expect(ele.preferences?.elevationMode).toBe("maximize");
    const easier = adjustRequest(route, "easier");
    expect(easier.distanceKm).toBeLessThan(route.stats.distanceM / 1000);
    expect(easier.elevationMaxM).toBe(Math.round(route.stats.ascentM * 0.7));
    expect(easier.styles).toEqual(["fast"]);
    const quiet = adjustRequest(route, "more_quiet");
    expect(quiet.preferences?.preferQuietRoads).toBe(true);
    expect(quiet.distanceKm).toBeCloseTo(route.stats.distanceM / 1000, 0);
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
