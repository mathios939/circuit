import { describe, expect, it } from "vitest";
import { toRoutePoints } from "@/lib/geo";
import { getActivityProfile } from "@/lib/activities/profiles";
import type { RouteSegment } from "@/lib/types";
import { accumulateWithHysteresis, computeElevationGain, computeMaxGradient, filterElevationSeries, smoothElevation } from "./elevation-gain";
import { estimateDurationSeconds } from "./duration";
import { estimateDifficulty } from "./difficulty";
import { computeBreakdowns, computeRouteStatistics } from "./statistics";

/** Straight north-bound line with the given elevations every 100 m. */
const line = (eles: (number | undefined)[]) =>
  toRoutePoints(eles.map((ele, i) => ({ lat: 45 + i * 0.0009, lng: 6, ele })));

describe("computeElevationGain", () => {
  it("ignores small oscillations (hysteresis) — reference example 100, 101, 100.8, 101.2, 105, 110", () => {
    const series = [100, 101, 100.8, 101.2, 105, 110];
    const filtered = accumulateWithHysteresis(series, 4);
    expect(filtered.ascent).toBeCloseTo(10, 5);
    expect(filtered.descent).toBe(0);
    const raw = accumulateWithHysteresis(series, 0);
    expect(raw.ascent).toBeGreaterThan(10); // every wiggle counted
  });

  it("counts ascent and descent on a noisy climb and reports the raw gain for comparison", () => {
    const noisy: number[] = [];
    for (let i = 0; i < 200; i++) noisy.push(100 + i * 0.5 + (i % 2 === 0 ? 1.5 : -1.5)); // +100 m with ±1.5 m jitter
    const gain = computeElevationGain(line(noisy));
    expect(gain.ascentM).toBeGreaterThanOrEqual(95);
    expect(gain.ascentM).toBeLessThanOrEqual(105);
    expect(gain.ascentRawM).toBeGreaterThan(gain.ascentM * 2); // raw jitter inflates the gain
    expect(gain.hasElevation).toBe(true);
  });

  it("removes isolated DEM spikes with the moving median", () => {
    const series = [100, 100, 100, 160, 100, 100, 100, 100];
    const filtered = filterElevationSeries(series);
    expect(Math.max(...filtered)).toBeLessThan(110);
    const gain = computeElevationGain(line(series));
    expect(gain.ascentM).toBe(0);
  });

  it("counts real climbs and descents", () => {
    const pts = line([100, 100, 100, 100, 100, 150, 150, 150, 150, 150, 120, 120, 120, 120, 120]);
    const gain = computeElevationGain(pts, 4);
    expect(gain.ascentM).toBeGreaterThanOrEqual(48);
    expect(gain.ascentM).toBeLessThanOrEqual(50);
    expect(gain.descentM).toBeGreaterThanOrEqual(28);
    expect(gain.descentM).toBeLessThanOrEqual(30);
    expect(gain.minEleM).toBe(100);
    expect(gain.maxEleM).toBe(150);
  });

  it("reports no elevation when data is missing", () => {
    const gain = computeElevationGain(line([undefined, undefined, undefined]));
    expect(gain.hasElevation).toBe(false);
    expect(gain.ascentM).toBe(0);
  });

  it("computes the steepest 100 m gradient", () => {
    const pts = line([100, 100, 110, 130, 130]);
    const grad = computeMaxGradient(pts, 100)!;
    expect(grad).toBeGreaterThan(15);
    expect(grad).toBeLessThan(25);
  });

  it("smooths route points (median + mean) and keeps short series untouched", () => {
    expect(smoothElevation(line([100, 200, 100]))[1]!.ele).toBe(200);
    const smoothed = smoothElevation(line([100, 100, 100, 200, 100, 100, 100]));
    expect(smoothed[3]!.ele).toBeLessThan(110);
  });
});

describe("estimateDurationSeconds", () => {
  const road = getActivityProfile("road_cycling");
  const hiking = getActivityProfile("hiking");

  it("uses different speeds per activity", () => {
    const input = { distanceM: 20_000, ascentM: 0, descentM: 0 };
    expect(estimateDurationSeconds(road, input)).toBeLessThan(estimateDurationSeconds(hiking, input) / 3);
  });

  it("adds time for climbing", () => {
    const flat = estimateDurationSeconds(hiking, { distanceM: 10_000, ascentM: 0, descentM: 0 });
    const hilly = estimateDurationSeconds(hiking, { distanceM: 10_000, ascentM: 600, descentM: 600 });
    expect(hilly - flat).toBeGreaterThan(3000); // ≈ +1 h per 600 m (Naismith)
  });

  it("slows down on rough surfaces for road bikes", () => {
    const paved = estimateDurationSeconds(road, { distanceM: 30_000, ascentM: 0, descentM: 0, surfaces: { paved: 1, gravel: 0, trail: 0, unknown: 0 } });
    const trail = estimateDurationSeconds(road, { distanceM: 30_000, ascentM: 0, descentM: 0, surfaces: { paved: 0, gravel: 0, trail: 1, unknown: 0 } });
    expect(trail).toBeGreaterThan(paved * 1.5);
  });

  it("returns 0 for empty routes", () => {
    expect(estimateDurationSeconds(road, { distanceM: 0, ascentM: 0, descentM: 0 })).toBe(0);
  });
});

describe("estimateDifficulty", () => {
  const road = getActivityProfile("road_cycling");
  it("grades from easy to expert", () => {
    expect(estimateDifficulty(road, { distanceM: 20_000, ascentM: 100 })).toBe("easy");
    expect(estimateDifficulty(road, { distanceM: 80_000, ascentM: 900 })).toBe("moderate");
    expect(estimateDifficulty(road, { distanceM: 150_000, ascentM: 2000 })).toBe("hard");
    expect(estimateDifficulty(road, { distanceM: 250_000, ascentM: 5000 })).toBe("expert");
  });
});

describe("computeBreakdowns / computeRouteStatistics", () => {
  const pts = line([100, 110, 120, 130, 140, 150]);
  const total = pts[pts.length - 1]!.dist;
  const segments: RouteSegment[] = [
    { startIndex: 0, endIndex: 3, lengthM: total * 0.6, surface: "paved", way: "road" },
    { startIndex: 3, endIndex: 5, lengthM: total * 0.2, surface: "gravel", way: "track" },
  ];

  it("computes surface / way shares and marks the uncovered remainder as unknown", () => {
    const { surfaces, ways, surfaceCoverage } = computeBreakdowns(segments, total);
    expect(surfaces.paved).toBeCloseTo(0.6, 3);
    expect(surfaces.gravel).toBeCloseTo(0.2, 3);
    expect(surfaces.unknown).toBeCloseTo(0.2, 3);
    expect(ways.road).toBeCloseTo(0.6, 3);
    expect(surfaceCoverage).toBeCloseTo(0.8, 3);
  });

  it("handles missing segments", () => {
    const { surfaces, surfaceCoverage } = computeBreakdowns([], total);
    expect(surfaces.unknown).toBe(1);
    expect(surfaceCoverage).toBe(0);
  });

  it("assembles full statistics", () => {
    const stats = computeRouteStatistics(pts, segments, { activity: "gravel", mode: "point_to_point", turnCount: 4 });
    expect(stats.distanceM).toBe(Math.round(total));
    expect(stats.ascentM).toBeGreaterThanOrEqual(40);
    expect(stats.ascentM).toBeLessThanOrEqual(50);
    expect(stats.ascentRawM).toBe(50);
    expect(stats.hasElevation).toBe(true);
    expect(stats.durationS).toBeGreaterThan(0);
    expect(stats.difficulty).toBe("easy");
    expect(stats.turnCount).toBe(4);
    expect(stats.overlapRatio).toBe(0);
  });
});
