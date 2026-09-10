import { describe, expect, it } from "vitest";
import { MockElevationProvider } from "@/lib/elevation/mock";
import { MockRoutingProvider } from "@/lib/routing/mock";
import type { RouteRequest } from "@/lib/types";
import { generateRoutes, MAX_VARIANT_SIMILARITY, routeSimilarity } from "./index";

/**
 * Representative product scenarios, run against the deterministic mock engine.
 * They check the contract of the generator (distance accuracy, quality gate,
 * distinct variants) rather than real-world geography, which the optional
 * integration tests cover when the network is available.
 */
const deps = { routing: new MockRoutingProvider(), elevation: new MockElevationProvider(), concurrency: 4, elevationSamples: 150 };

const scenarios: { name: string; request: RouteRequest }[] = [
  { name: "Annecy · vélo de route · 50 km · boucle", request: { mode: "loop", activity: "road_cycling", start: { lat: 45.8992, lng: 6.1294, name: "Annecy" }, distanceKm: 50, seed: 1 } },
  { name: "Paris · course à pied · 10 km · boucle", request: { mode: "loop", activity: "running", start: { lat: 48.8566, lng: 2.3522, name: "Paris" }, distanceKm: 10, seed: 2 } },
  { name: "Fontainebleau · VTT · 35 km · boucle", request: { mode: "loop", activity: "mtb", start: { lat: 48.4047, lng: 2.7016, name: "Fontainebleau" }, distanceKm: 35, seed: 3 } },
  { name: "Lyon · gravel · 70 km · boucle", request: { mode: "loop", activity: "gravel", start: { lat: 45.764, lng: 4.8357, name: "Lyon" }, distanceKm: 70, seed: 4 } },
  { name: "Chamonix · randonnée · 25 km · boucle", request: { mode: "loop", activity: "hiking", start: { lat: 45.9237, lng: 6.8694, name: "Chamonix" }, distanceKm: 25, seed: 5 } },
  { name: "Bordeaux · marche · 100 km demandés → refus lisible", request: { mode: "loop", activity: "walking", start: { lat: 44.8378, lng: -0.5792, name: "Bordeaux" }, distanceKm: 100, seed: 6 } },
  {
    name: "Paris → Versailles · vélo de route",
    request: { mode: "point_to_point", activity: "road_cycling", start: { lat: 48.8566, lng: 2.3522, name: "Paris" }, end: { lat: 48.8049, lng: 2.1204, name: "Versailles" }, seed: 7 },
  },
];

describe("product scenarios (mock engine)", () => {
  for (const { name, request } of scenarios) {
    it(name, async () => {
      if (request.distanceKm === 100 && request.activity === "walking") {
        await expect(generateRoutes(request, deps)).rejects.toMatchObject({ code: "DISTANCE_UNREALISTIC" });
        return;
      }
      const result = await generateRoutes(request, deps);
      expect(result.routes.length).toBeGreaterThanOrEqual(request.mode === "loop" ? 2 : 1);
      for (const route of result.routes) {
        expect(route.quality?.rejected).toBe(false);
        expect(route.quality?.geometryValid).toBe(true);
        if (request.mode === "loop") {
          const target = request.distanceKm! * 1000;
          expect(Math.abs(route.stats.distanceM - target) / target).toBeLessThanOrEqual(0.1);
          const first = route.points[0]!;
          const last = route.points[route.points.length - 1]!;
          expect(Math.abs(first.lat - last.lat)).toBeLessThan(1e-4);
          expect(route.quality!.outAndBackRatio).toBeLessThan(0.35);
        } else {
          expect(route.waypoints[route.waypoints.length - 1]!.kind).toBe("end");
        }
        expect(route.stats.durationS).toBeGreaterThan(0);
        expect(route.stats.hasElevation).toBe(true);
        expect(route.insights.length).toBeGreaterThan(0);
      }
      for (let i = 0; i < result.routes.length; i++) {
        for (let j = i + 1; j < result.routes.length; j++) {
          expect(routeSimilarity(result.routes[i]!.points, result.routes[j]!.points)).toBeLessThan(MAX_VARIANT_SIMILARITY);
        }
      }
      // Cost guard: a generation must stay within the default routing budget.
      expect(result.routingCalls).toBeLessThanOrEqual(40 + 6);
    });
  }

  it("strict tolerance: a 50 km request never yields 40 or 62 km", async () => {
    for (const seed of [11, 12, 13, 14]) {
      const result = await generateRoutes({ mode: "loop", activity: "road_cycling", start: { lat: 45.8992, lng: 6.1294, name: "Annecy" }, distanceKm: 50, seed }, deps);
      for (const r of result.routes) {
        expect(r.stats.distanceM).toBeGreaterThanOrEqual(45_000);
        expect(r.stats.distanceM).toBeLessThanOrEqual(55_000);
      }
    }
  });
});
