import { describe, expect, it } from "vitest";
import { calculateRequestSchema, geocodeQuerySchema, routeRequestSchema } from "./schemas";

const start = { lat: 45.9, lng: 6.13, name: "Annecy" };

describe("routeRequestSchema", () => {
  it("accepts a valid loop request", () => {
    const r = routeRequestSchema.safeParse({ mode: "loop", activity: "mtb", start, distanceKm: 35 });
    expect(r.success).toBe(true);
  });

  it("requires a distance (or duration) for loops", () => {
    expect(routeRequestSchema.safeParse({ mode: "loop", activity: "mtb", start }).success).toBe(false);
    expect(routeRequestSchema.safeParse({ mode: "loop", activity: "mtb", start, durationMinutes: 90 }).success).toBe(true);
  });

  it("requires an end for point-to-point", () => {
    expect(routeRequestSchema.safeParse({ mode: "point_to_point", activity: "running", start }).success).toBe(false);
    expect(routeRequestSchema.safeParse({ mode: "point_to_point", activity: "running", start, end: { ...start, name: "B" } }).success).toBe(true);
  });

  it("rejects invalid coordinates, activities and unknown fields", () => {
    expect(routeRequestSchema.safeParse({ mode: "loop", activity: "mtb", start: { lat: 95, lng: 6, name: "x" }, distanceKm: 10 }).success).toBe(false);
    expect(routeRequestSchema.safeParse({ mode: "loop", activity: "car", start, distanceKm: 10 }).success).toBe(false);
    expect(routeRequestSchema.safeParse({ mode: "loop", activity: "mtb", start, distanceKm: 10, evil: true }).success).toBe(false);
    expect(routeRequestSchema.safeParse({ mode: "loop", activity: "mtb", start, distanceKm: -5 }).success).toBe(false);
    expect(routeRequestSchema.safeParse({ mode: "loop", activity: "mtb", start, distanceKm: 10_000 }).success).toBe(false);
  });

  it("validates preferences and avoid areas", () => {
    const ok = routeRequestSchema.safeParse({ mode: "loop", activity: "gravel", start, distanceKm: 40, preferences: { avoidBusyRoads: true, avoidAreas: [[6, 45, 6.1, 45.1]] } });
    expect(ok.success).toBe(true);
    const bad = routeRequestSchema.safeParse({ mode: "loop", activity: "gravel", start, distanceKm: 40, preferences: { avoidAreas: [[600, 45, 6.1, 45.1]] } });
    expect(bad.success).toBe(false);
  });
});

describe("calculateRequestSchema", () => {
  it("requires at least two waypoints and caps their number", () => {
    expect(calculateRequestSchema.safeParse({ activity: "mtb", waypoints: [start] }).success).toBe(false);
    expect(calculateRequestSchema.safeParse({ activity: "mtb", waypoints: [start, start] }).success).toBe(true);
    expect(calculateRequestSchema.safeParse({ activity: "mtb", waypoints: Array(40).fill(start) }).success).toBe(false);
  });
});

describe("geocodeQuerySchema", () => {
  it("coerces and bounds numeric params", () => {
    const r = geocodeQuerySchema.safeParse({ q: "Annecy", limit: "5", lat: "45.9", lng: "6.1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(5);
    expect(geocodeQuerySchema.safeParse({ q: "A" }).success).toBe(false);
    expect(geocodeQuerySchema.safeParse({ q: "Annecy", limit: "50" }).success).toBe(false);
  });
});
