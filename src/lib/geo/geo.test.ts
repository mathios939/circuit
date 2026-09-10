import { describe, expect, it } from "vitest";
import { bearing, destinationPoint, haversineDistance, isValidLatLng, pathLength } from "./distance";
import { decodePolyline, encodePolyline } from "./polyline";
import { computeBBox, pointAtDistance, samplePath, simplifyPath, toRoutePoints } from "./path";

const paris = { lat: 48.8566, lng: 2.3522 };
const lyon = { lat: 45.764, lng: 4.8357 };
const annecy = { lat: 45.8992, lng: 6.1294 };

describe("haversineDistance", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistance(paris, paris)).toBe(0);
  });
  it("computes Paris → Lyon within 1 % of the reference (≈ 392 km)", () => {
    const d = haversineDistance(paris, lyon);
    expect(d).toBeGreaterThan(388_000);
    expect(d).toBeLessThan(396_000);
  });
  it("is symmetric", () => {
    expect(haversineDistance(paris, annecy)).toBeCloseTo(haversineDistance(annecy, paris), 6);
  });
  it("does not use a naive euclidean approximation (longitude shrinks with latitude)", () => {
    const equator = haversineDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    const north = haversineDistance({ lat: 60, lng: 0 }, { lat: 60, lng: 1 });
    expect(north / equator).toBeCloseTo(0.5, 1);
  });
});

describe("bearing / destinationPoint", () => {
  it("round-trips: destination at bearing/distance is at that distance and bearing", () => {
    const dest = destinationPoint(annecy, 45, 10_000);
    expect(haversineDistance(annecy, dest)).toBeCloseTo(10_000, -1);
    expect(bearing(annecy, dest)).toBeCloseTo(45, 0);
  });
  it("normalises longitude across the antimeridian", () => {
    const dest = destinationPoint({ lat: 0, lng: 179.9 }, 90, 50_000);
    expect(dest.lng).toBeLessThan(0);
    expect(dest.lng).toBeGreaterThan(-180);
  });
});

describe("pathLength / toRoutePoints", () => {
  it("accumulates distances", () => {
    const pts = toRoutePoints([paris, lyon, annecy]);
    expect(pts[0]!.dist).toBe(0);
    expect(pts[2]!.dist).toBeCloseTo(pathLength([paris, lyon, annecy]), 3);
  });
  it("keeps elevation when present", () => {
    const pts = toRoutePoints([{ ...paris, ele: 35 }, { ...lyon }]);
    expect(pts[0]!.ele).toBe(35);
    expect(pts[1]!.ele).toBeUndefined();
  });
});

describe("polyline", () => {
  it("encodes the Google reference example (precision 5)", () => {
    const pts = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    expect(encodePolyline(pts, 5)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    const decoded = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
    expect(decoded).toHaveLength(3);
    expect(decoded[2]!.lat).toBeCloseTo(43.252, 5);
    expect(decoded[2]!.lng).toBeCloseTo(-126.453, 5);
  });
  it("round-trips at precision 6", () => {
    const pts = [annecy, { lat: 45.9, lng: 6.13 }, { lat: 45.91, lng: 6.15 }];
    const decoded = decodePolyline(encodePolyline(pts, 6), 6);
    decoded.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(pts[i]!.lat, 5);
      expect(p.lng).toBeCloseTo(pts[i]!.lng, 5);
    });
  });
});

describe("path helpers", () => {
  const pts = toRoutePoints([
    { lat: 45.0, lng: 6.0, ele: 100 },
    { lat: 45.01, lng: 6.0, ele: 200 },
    { lat: 45.02, lng: 6.0, ele: 100 },
  ]);
  it("interpolates position and elevation at a distance", () => {
    const total = pts[2]!.dist;
    const mid = pointAtDistance(pts, total / 2)!;
    expect(mid.lat).toBeCloseTo(45.01, 3);
    expect(mid.ele).toBeCloseTo(200, 0);
    const quarter = pointAtDistance(pts, total / 4)!;
    expect(quarter.ele).toBeCloseTo(150, 0);
  });
  it("clamps beyond the ends", () => {
    expect(pointAtDistance(pts, -10)).toBe(pts[0]);
    expect(pointAtDistance(pts, 1e9)).toBe(pts[2]);
  });
  it("samples with a cap on the number of points and always includes the end", () => {
    const samples = samplePath(pts, 10, 50);
    expect(samples.length).toBeLessThanOrEqual(51);
    expect(samples[samples.length - 1]!.dist).toBeCloseTo(pts[2]!.dist, 6);
  });
  it("simplifies collinear points and keeps corners", () => {
    const line = toRoutePoints([
      { lat: 45, lng: 6 },
      { lat: 45.001, lng: 6 },
      { lat: 45.002, lng: 6 },
      { lat: 45.002, lng: 6.01 },
    ]);
    const simplified = simplifyPath(line, 5);
    expect(simplified).toHaveLength(3);
  });
  it("computes bounding boxes", () => {
    expect(computeBBox([paris, lyon])).toEqual([2.3522, 45.764, 4.8357, 48.8566]);
  });
});

describe("isValidLatLng", () => {
  it("accepts valid coordinates and rejects invalid ones", () => {
    expect(isValidLatLng({ lat: 45, lng: 6 })).toBe(true);
    expect(isValidLatLng({ lat: 91, lng: 6 })).toBe(false);
    expect(isValidLatLng({ lat: 45, lng: 181 })).toBe(false);
    expect(isValidLatLng({ lat: NaN, lng: 6 })).toBe(false);
    expect(isValidLatLng({ lat: "45", lng: 6 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
  });
});
