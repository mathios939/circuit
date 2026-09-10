import { describe, expect, it } from "vitest";
import { getActivityProfile } from "@/lib/activities/profiles";
import type { RouteRequest, RouteStatistics } from "@/lib/types";
import { emptyWayBreakdown } from "@/lib/stats/statistics";
import { computeRouteDNA } from "./dna";
import { buildInsights } from "./insights";
import { DEFAULT_SCORERS, distanceFitScorer, overlapScorer, safetyScorer, scoreRoute, type Scorer } from "./scorers";

const request: RouteRequest = {
  mode: "loop",
  activity: "road_cycling",
  start: { lat: 45.9, lng: 6.13, name: "Annecy" },
  distanceKm: 50,
};

function stats(overrides: Partial<RouteStatistics> = {}): RouteStatistics {
  return {
    distanceM: 50_000,
    ascentM: 500,
    descentM: 500,
    minEleM: 400,
    maxEleM: 700,
    durationS: 7200,
    hasElevation: true,
    difficulty: "moderate",
    surfaces: { paved: 0.9, gravel: 0.05, trail: 0.05, unknown: 0 },
    ways: { ...emptyWayBreakdown(), other: 0, road: 0.5, residential: 0.3, cycleway: 0.1, track: 0.1 },
    surfaceCoverage: 1,
    turnCount: 60,
    overlapRatio: 0.05,
    ...overrides,
  };
}

const ctx = (s: RouteStatistics, req: RouteRequest = request) => ({ request: req, stats: s, profile: getActivityProfile(req.activity), style: "balanced" as const });

describe("scorers", () => {
  it("rewards distance fit", () => {
    expect(distanceFitScorer.score(ctx(stats({ distanceM: 50_000 }))).value).toBe(1);
    expect(distanceFitScorer.score(ctx(stats({ distanceM: 52_500 }))).value).toBeCloseTo(0.75, 2);
    expect(distanceFitScorer.score(ctx(stats({ distanceM: 65_000 }))).value).toBe(0);
  });

  it("penalises overlapping loops", () => {
    expect(overlapScorer.score(ctx(stats({ overlapRatio: 0 }))).value).toBe(1);
    expect(overlapScorer.score(ctx(stats({ overlapRatio: 0.5 }))).value).toBe(0);
  });

  it("penalises major roads", () => {
    const quiet = safetyScorer.score(ctx(stats())).value;
    const busy = safetyScorer.score(ctx(stats({ ways: { ...emptyWayBreakdown(), other: 0, major_road: 0.3, road: 0.7 } }))).value;
    expect(busy).toBeLessThan(quiet);
  });

  it("produces a weighted 0..100 total and only applicable components", () => {
    const score = scoreRoute(ctx(stats()));
    expect(score.total).toBeGreaterThan(50);
    expect(score.total).toBeLessThanOrEqual(100);
    expect(score.components.every((c) => c.value >= 0 && c.value <= 1 && c.weight > 0)).toBe(true);
    // No elevation constraint in the request: the elevation scorer is not applied.
    expect(score.components.find((c) => c.id === "elevation")).toBeUndefined();
  });

  it("is extensible: a custom scorer list changes the result", () => {
    const always0: Scorer = { id: "zero", label: "Zero", weight: () => 100, score: () => ({ value: 0 }) };
    expect(scoreRoute(ctx(stats()), [...DEFAULT_SCORERS, always0]).total).toBeLessThan(10);
  });

  it("prefers the surface suited to the activity", () => {
    const trails = stats({ surfaces: { paved: 0.1, gravel: 0.2, trail: 0.7, unknown: 0 } });
    const road = scoreRoute(ctx(trails, request)).components.find((c) => c.id === "surface")!.value;
    const mtb = scoreRoute(ctx(trails, { ...request, activity: "mtb" })).components.find((c) => c.id === "surface")!.value;
    expect(mtb).toBeGreaterThan(road);
  });
});

describe("computeRouteDNA", () => {
  it("returns 0..100 indicators and flags estimates when data is partial", () => {
    const full = computeRouteDNA(stats(), getActivityProfile("road_cycling"));
    for (const v of [full.nature, full.calm, full.difficulty, full.technical, full.panorama]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(full.estimated).toBe(false);
    const partial = computeRouteDNA(stats({ surfaceCoverage: 0.2, hasElevation: false }), getActivityProfile("road_cycling"));
    expect(partial.estimated).toBe(true);
  });

  it("scores nature higher on paths than on roads", () => {
    const roads = computeRouteDNA(stats(), getActivityProfile("mtb"));
    const paths = computeRouteDNA(stats({ ways: { ...emptyWayBreakdown(), other: 0, path: 0.8, track: 0.2 }, surfaces: { paved: 0, gravel: 0.2, trail: 0.8, unknown: 0 } }), getActivityProfile("mtb"));
    expect(paths.nature).toBeGreaterThan(roads.nature);
    expect(paths.technical).toBeGreaterThan(roads.technical);
  });
});

describe("buildInsights", () => {
  it("explains distance fit and warns road cyclists about unpaved sections", () => {
    const insights = buildInsights(request, stats({ surfaces: { paved: 0.8, gravel: 0.15, trail: 0.05, unknown: 0 } }), getActivityProfile("road_cycling"));
    expect(insights.some((i) => /Distance très proche/.test(i.message))).toBe(true);
    expect(insights.some((i) => i.tone === "warning" && /non goudronn/.test(i.message))).toBe(true);
  });

  it("mentions missing elevation", () => {
    const insights = buildInsights(request, stats({ hasElevation: false }), getActivityProfile("road_cycling"));
    expect(insights.some((i) => /Altitude indisponible/.test(i.message))).toBe(true);
  });
});
