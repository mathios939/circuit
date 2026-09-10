import { describe, expect, it } from "vitest";
import { getActivityProfile } from "@/lib/activities/profiles";
import { destinationPoint } from "@/lib/geo";
import type { LatLng, RouteSegment } from "@/lib/types";
import { assessRouteQuality, computeOutAndBackRatio, countUTurns } from "./quality";

const start = { lat: 45.9, lng: 6.13 };
const road = getActivityProfile("road_cycling");

/** Rounded loop of ~`km` kilometres (circle perimeter) with `n` points. */
function circleLoop(km: number, n = 300): LatLng[] {
  const r = (km * 1000) / (2 * Math.PI);
  const centre = destinationPoint(start, 90, r);
  const pts: LatLng[] = [];
  for (let i = 0; i <= n; i++) {
    const angle = 270 + (i / n) * 360;
    pts.push(destinationPoint(centre, angle % 360, r));
  }
  pts[0] = start;
  pts[n] = start;
  return pts;
}

function outAndBack(km: number, n = 150): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i <= n; i++) out.push(destinationPoint(start, 45, ((km * 500) / n) * i));
  return [...out, ...[...out].reverse().slice(1)];
}

describe("assessRouteQuality", () => {
  it("accepts a clean loop of the right length", () => {
    const coords = circleLoop(20);
    const report = assessRouteQuality({ coordinates: coords, distanceM: 20_000, targetM: 20_000, start, waypoints: [start, { lat: 45.93, lng: 6.16 }, { lat: 45.9, lng: 6.2 }, start], isLoop: true, profile: road });
    expect(report.geometryValid).toBe(true);
    expect(report.rejected).toBe(false);
    expect(report.distanceAccuracy).toBe(1);
    expect(report.outAndBackRatio).toBeLessThan(0.1);
    expect(report.uTurnCount).toBe(0);
    expect(report.qualityScore).toBeGreaterThan(80);
    expect(report.maxDistanceFromStartM).toBeGreaterThan(5000);
  });

  it("rejects out-and-back geometries", () => {
    const coords = outAndBack(20);
    const report = assessRouteQuality({ coordinates: coords, distanceM: 20_000, targetM: 20_000, start, waypoints: [start, { lat: 45.95, lng: 6.2 }, start], isLoop: true, profile: road });
    expect(report.outAndBackRatio).toBeGreaterThan(0.4);
    expect(report.rejected).toBe(true);
    expect(report.reasons.some((r) => /aller-retour/i.test(r))).toBe(true);
  });

  it("rejects loops outside the distance tolerance", () => {
    const report = assessRouteQuality({ coordinates: circleLoop(20), distanceM: 20_000, targetM: 25_000, start, waypoints: [start, { lat: 45.93, lng: 6.16 }, { lat: 45.9, lng: 6.2 }, start], isLoop: true, profile: road, maxDistanceError: 0.1 });
    expect(report.distanceAccuracy).toBeCloseTo(0.8, 2);
    expect(report.rejected).toBe(true);
    expect(report.reasons.some((r) => /Distance/.test(r))).toBe(true);
  });

  it("flags broken geometries (jumps, too short, inconsistent length)", () => {
    const jump = [...circleLoop(10, 50)];
    jump[25] = { lat: 47, lng: 8 };
    expect(assessRouteQuality({ coordinates: jump, distanceM: 10_000, start, waypoints: [start, { lat: 45.93, lng: 6.16 }, { lat: 45.9, lng: 6.2 }, start], isLoop: true, profile: road }).geometryValid).toBe(false);
    expect(assessRouteQuality({ coordinates: [start, start], distanceM: 50, start, waypoints: [start, start], isLoop: true, profile: road }).geometryValid).toBe(false);
    const inconsistent = assessRouteQuality({ coordinates: circleLoop(10), distanceM: 40_000, start, waypoints: [start, { lat: 45.93, lng: 6.16 }, { lat: 45.9, lng: 6.2 }, start], isLoop: true, profile: road });
    expect(inconsistent.geometryValid).toBe(false);
    expect(inconsistent.qualityScore).toBe(0);
  });

  it("penalises ways unsuited to the activity", () => {
    const coords = circleLoop(20);
    const segments: RouteSegment[] = [{ startIndex: 0, endIndex: coords.length - 1, lengthM: 20_000, surface: "trail", way: "path" }];
    const forRoadBike = assessRouteQuality({ coordinates: coords, distanceM: 20_000, targetM: 20_000, start, waypoints: [start, { lat: 45.93, lng: 6.16 }, { lat: 45.9, lng: 6.2 }, start], isLoop: true, profile: road, segments });
    const forMtb = assessRouteQuality({ coordinates: coords, distanceM: 20_000, targetM: 20_000, start, waypoints: [start, { lat: 45.93, lng: 6.16 }, { lat: 45.9, lng: 6.2 }, start], isLoop: true, profile: getActivityProfile("mtb"), segments });
    expect(forRoadBike.activityCompatibility).toBeLessThan(0.2);
    expect(forRoadBike.rejected).toBe(true);
    expect(forMtb.activityCompatibility).toBeGreaterThan(0.8);
    expect(forMtb.rejected).toBe(false);
  });
});

describe("computeOutAndBackRatio / countUTurns", () => {
  it("measures reversed passages and sharp reversals", () => {
    expect(computeOutAndBackRatio(circleLoop(10))).toBeLessThan(0.05);
    expect(computeOutAndBackRatio(outAndBack(10))).toBeGreaterThan(0.45);
    expect(countUTurns(circleLoop(10))).toBe(0);
    expect(countUTurns(outAndBack(10))).toBe(1);
  });
});
