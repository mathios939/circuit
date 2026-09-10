import { describe, expect, it } from "vitest";
import { MockElevationProvider } from "@/lib/elevation/mock";
import { MockRoutingProvider } from "@/lib/routing/mock";
import type { CalculateRouteInput, RawRoute, RoutingProvider } from "@/lib/routing/provider";
import { ACTIVITY_SLUGS, getActivityProfile, getStyleLabels } from "@/lib/activities/profiles";
import { destinationPoint } from "@/lib/geo";
import { USER_HINTS, USER_MESSAGES, type AppErrorCode } from "@/lib/errors";
import { buildScoreSummary, scoreRoute } from "@/lib/scoring/scorers";
import { dnaDimensionsFor } from "@/lib/scoring/dna";
import { emptyWayBreakdown } from "@/lib/stats/statistics";
import type { LatLng, RouteStatistics } from "@/lib/types";
import { formatDurationApprox } from "@/lib/utils/format";
import { ROUTE_ENGINE } from "./config";
import { generateRoutes } from "./index";
import { computeWaypointQuality } from "./quality";

const annecy = { lat: 45.8992, lng: 6.1294, name: "Annecy" };

/**
 * Routing engine whose loops always come out at a fixed length, whatever the
 * requested shape: the distance can never converge, so the generator has to
 * fall back on an honest "near miss" instead of failing or lying.
 */
class FixedLengthRouting implements RoutingProvider {
  readonly id = "mock";
  readonly capabilities = { nativeLoop: false, elevation: false, segments: true, matrix: false };
  constructor(private readonly km: number) {}
  async calculateRoute(input: CalculateRouteInput): Promise<RawRoute> {
    const start = input.waypoints[0]!;
    const bearingKey = input.waypoints[1] ? Math.round(((Math.atan2(input.waypoints[1].lng - start.lng, input.waypoints[1].lat - start.lat) * 180) / Math.PI + 360) % 360) : 0;
    const r = (this.km * 1000) / (2 * Math.PI);
    const centre = destinationPoint(start, bearingKey, r);
    const coordinates: LatLng[] = [];
    const n = 240;
    for (let i = 0; i <= n; i++) coordinates.push(destinationPoint(centre, (bearingKey + 180 + (i / n) * 360) % 360, r));
    coordinates[0] = start;
    coordinates[n] = start;
    const distanceM = this.km * 1000;
    return { coordinates, distanceM, durationS: distanceM / 5, segments: [{ startIndex: 0, endIndex: n, lengthM: distanceM, surface: "paved", way: "residential" }] };
  }
}

describe("distance honesty (near miss)", () => {
  it("reports the closest loop with an explicit mismatch when nothing fits ±10 %", async () => {
    const result = await generateRoutes({ mode: "loop", activity: "road_cycling", start: annecy, distanceKm: 50, seed: 3 }, { routing: new FixedLengthRouting(58), elevation: new MockElevationProvider(), candidateCount: 6, maxIterations: 1 });
    expect(result.distanceMismatch).toEqual({ requestedKm: 50, bestKm: 58 });
    expect(result.routes.length).toBeGreaterThanOrEqual(1);
    for (const r of result.routes) {
      expect(r.stats.distanceM).toBeCloseTo(58_000, -2);
      // Near misses are presented as balanced, never restyled into a fake "fast" or "adventure".
      expect(r.style).toBe("balanced");
    }
  });

  it("refuses loops beyond the near-miss tolerance instead of presenting them", async () => {
    await expect(
      generateRoutes({ mode: "loop", activity: "road_cycling", start: annecy, distanceKm: 50, seed: 3 }, { routing: new FixedLengthRouting(75), elevation: new MockElevationProvider(), candidateCount: 6, maxIterations: 1 }),
    ).rejects.toMatchObject({ code: "NO_ROUTE" });
  });

  it("does not flag a mismatch on a normal generation", async () => {
    const result = await generateRoutes({ mode: "loop", activity: "road_cycling", start: annecy, distanceKm: 50, seed: 1 }, { routing: new MockRoutingProvider(), elevation: new MockElevationProvider(), concurrency: 4, elevationSamples: 100 });
    expect(result.distanceMismatch).toBeUndefined();
    for (const r of result.routes) expect(Math.abs(r.stats.distanceM - 50_000) / 50_000).toBeLessThanOrEqual(ROUTE_ENGINE.distance.maxTolerance);
  });
});

describe("waypoint quality", () => {
  it("is perfect for well-spread vias and degrades when two vias collapse", () => {
    const a = destinationPoint(annecy, 0, 4000);
    const b = destinationPoint(annecy, 120, 4000);
    const c = destinationPoint(annecy, 240, 4000);
    expect(computeWaypointQuality([annecy, a, b, c, annecy], 30_000, true)).toBe(1);
    const tooClose = destinationPoint(a, 90, 300);
    const q = computeWaypointQuality([annecy, a, tooClose, c, annecy], 30_000, true);
    expect(q).toBeGreaterThan(0);
    expect(q).toBeLessThan(0.2);
    expect(computeWaypointQuality([annecy, a], 10_000, false)).toBe(1);
  });
});

describe("score summary and DNA dimensions", () => {
  const stats = (overrides: Partial<RouteStatistics> = {}): RouteStatistics => ({
    distanceM: 50_000,
    ascentM: 500,
    descentM: 500,
    durationS: 7200,
    hasElevation: true,
    difficulty: "moderate",
    surfaces: { paved: 0.9, gravel: 0.05, trail: 0.05, unknown: 0 },
    ways: { ...emptyWayBreakdown(), other: 0, road: 0.5, residential: 0.3, cycleway: 0.1, track: 0.1 },
    surfaceCoverage: 1,
    overlapRatio: 0.05,
    ...overrides,
  });
  const request = { mode: "loop" as const, activity: "road_cycling" as const, start: annecy, distanceKm: 50 };
  const ctx = (s: RouteStatistics) => ({ request, stats: s, profile: getActivityProfile("road_cycling"), style: "balanced" as const });

  it("exposes the five headline sub-scores in 0..100", () => {
    const score = scoreRoute(ctx(stats()));
    for (const key of ["distance", "nature", "calm", "difficulty", "variety"] as const) {
      expect(score.summary[key]).toBeGreaterThanOrEqual(0);
      expect(score.summary[key]).toBeLessThanOrEqual(100);
    }
    expect(score.summary.distance).toBe(100);
    const busy = buildScoreSummary(ctx(stats({ ways: { ...emptyWayBreakdown(), other: 0, major_road: 0.4, road: 0.6 } })), score.components);
    expect(busy.calm).toBeLessThan(score.summary.calm);
    expect(busy.nature).toBeLessThan(score.summary.nature);
    const unknown = buildScoreSummary(ctx(stats({ surfaceCoverage: 0.1 })), score.components);
    expect(unknown.nature).toBe(50);
    expect(unknown.calm).toBe(50);
    const repeated = buildScoreSummary(ctx(stats({ overlapRatio: 0.45 })), score.components);
    expect(repeated.variety).toBeLessThan(score.summary.variety);
  });

  it("shows Technique only for off-road activities and always Variété", () => {
    expect(dnaDimensionsFor("mtb").map((r) => r.key)).toContain("technical");
    expect(dnaDimensionsFor("trail_running").map((r) => r.key)).toContain("technical");
    expect(dnaDimensionsFor("hiking").map((r) => r.key)).toContain("technical");
    expect(dnaDimensionsFor("road_cycling").map((r) => r.key)).not.toContain("technical");
    expect(dnaDimensionsFor("running").map((r) => r.key)).not.toContain("technical");
    for (const activity of ["road_cycling", "gravel", "mtb", "running", "trail_running", "hiking", "walking"] as const) {
      expect(dnaDimensionsFor(activity).map((r) => r.key)).toContain("variety");
    }
  });
});

describe("activity-adapted labels and formats", () => {
  it("names the proposals per activity family", () => {
    expect(Object.values(getStyleLabels("trail_running"))).toEqual(["Accessible", "Équilibré", "Sportif"]);
    expect(Object.values(getStyleLabels("hiking"))).toEqual(["Accessible", "Équilibré", "Sportif"]);
    expect(Object.values(getStyleLabels("road_cycling"))).toEqual(["Rapide", "Équilibrée", "Aventure"]);
    expect(ACTIVITY_SLUGS.road_cycling).toBe("velo-route");
  });
  it("rounds durations to an honest approximation", () => {
    expect(formatDurationApprox(2 * 3600 + 13 * 60)).toBe("≈ 2 h 15");
    expect(formatDurationApprox(3600)).toBe("≈ 1 h");
    expect(formatDurationApprox(47 * 60)).toBe("≈ 45 min");
    expect(formatDurationApprox(-1)).toBe("–");
  });
  it("has a readable message and a hint for every error code", () => {
    const codes = Object.keys(USER_MESSAGES) as AppErrorCode[];
    for (const code of codes) {
      expect(USER_MESSAGES[code].length).toBeGreaterThan(20);
      expect(USER_HINTS[code]?.length ?? 0).toBeGreaterThan(20);
      expect(USER_MESSAGES[code]).not.toMatch(/stack|undefined|null/i);
    }
  });
});
