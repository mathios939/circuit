import { describe, expect, it } from "vitest";
import { normaliseSurface, normaliseWay } from "./attributes";
import { buildRoutingIntent } from "./intent";
import { MockRoutingProvider } from "./mock";
import { segmentsFromIntervals, snapWaypointIndices } from "./snap";
import { buildValhallaCosting } from "./valhalla";

describe("attribute normalisation", () => {
  it("maps engine surface names to coarse types", () => {
    expect(normaliseSurface("asphalt")).toBe("paved");
    expect(normaliseSurface("paved_smooth")).toBe("paved");
    expect(normaliseSurface("compacted")).toBe("gravel");
    expect(normaliseSurface("fine_gravel")).toBe("gravel");
    expect(normaliseSurface("dirt")).toBe("trail");
    expect(normaliseSurface("path")).toBe("trail");
    expect(normaliseSurface(undefined)).toBe("unknown");
    expect(normaliseSurface("whatever")).toBe("unknown");
  });
  it("maps road classes and uses to way types", () => {
    expect(normaliseWay("motorway")).toBe("major_road");
    expect(normaliseWay("primary")).toBe("major_road");
    expect(normaliseWay("tertiary")).toBe("road");
    expect(normaliseWay("residential")).toBe("residential");
    expect(normaliseWay("service_other", "cycleway")).toBe("cycleway");
    expect(normaliseWay("unclassified", "track")).toBe("track");
    expect(normaliseWay("path")).toBe("path");
    expect(normaliseWay("residential", "ferry")).toBe("ferry");
    expect(normaliseWay(undefined)).toBe("other");
  });
});

describe("buildRoutingIntent", () => {
  it("keeps road bikes away from trails whatever the preferences", () => {
    const intent = buildRoutingIntent({ activity: "road_cycling", style: "adventure", preferences: { preferTrails: true, surface: "unpaved" } });
    expect(intent.useTrails).toBeLessThanOrEqual(0.1);
    expect(intent.useUnpaved).toBeLessThanOrEqual(0.15);
    expect(intent.locomotion).toBe("bicycle");
  });
  it("makes styles differ", () => {
    const fast = buildRoutingIntent({ activity: "gravel", style: "fast", preferences: {} });
    const adventure = buildRoutingIntent({ activity: "gravel", style: "adventure", preferences: {} });
    expect(fast.useRoads).toBeGreaterThan(adventure.useRoads);
    expect(adventure.useTrails).toBeGreaterThan(fast.useTrails);
    expect(fast.shortest).toBe(true);
  });
  it("applies preferences", () => {
    const intent = buildRoutingIntent({ activity: "hiking", style: "balanced", preferences: { avoidBusyRoads: true, elevationMode: "minimize", avoidFerries: false } });
    expect(intent.avoidMajorRoads).toBe(true);
    expect(intent.useHills).toBeLessThan(0.1);
    expect(intent.avoidFerries).toBe(false);
    expect(intent.locomotion).toBe("pedestrian");
    expect(intent.maxHikingDifficulty).toBeGreaterThan(1);
  });
});

describe("buildValhallaCosting", () => {
  it("builds bicycle costing with the right options and exclusion polygons", () => {
    const costing = buildValhallaCosting({ activity: "mtb", style: "balanced", preferences: { avoidAreas: [[6, 45, 6.1, 45.1]] } });
    expect(costing.costing).toBe("bicycle");
    const opts = costing.costing_options.bicycle!;
    expect(opts.bicycle_type).toBe("Mountain");
    expect(opts.use_roads).toBeLessThan(0.3);
    expect(opts.use_ferry).toBe(0);
    expect(costing.exclude_polygons).toHaveLength(1);
    expect(costing.exclude_polygons![0]).toHaveLength(5);
  });
  it("builds pedestrian costing", () => {
    const costing = buildValhallaCosting({ activity: "running", style: "fast", preferences: {} });
    expect(costing.costing).toBe("pedestrian");
    expect(costing.costing_options.pedestrian!.walking_speed).toBeGreaterThan(8);
    expect(costing.exclude_polygons).toBeUndefined();
  });
});

describe("snap helpers", () => {
  const coords = Array.from({ length: 11 }, (_, i) => ({ lat: 45 + i * 0.001, lng: 6 }));
  it("finds monotonic waypoint indices", () => {
    const idx = snapWaypointIndices(coords, [coords[0]!, { lat: 45.0052, lng: 6.0001 }, coords[10]!]);
    expect(idx).toEqual([0, 5, 10]);
  });
  it("builds segments from interval details", () => {
    const segments = segmentsFromIntervals(
      coords,
      [
        [0, 5, "asphalt"],
        [5, 10, "gravel"],
      ],
      [[0, 10, "residential"]],
      normaliseSurface,
      (v) => normaliseWay(v),
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]!.surface).toBe("paved");
    expect(segments[1]!.surface).toBe("gravel");
    expect(segments[0]!.way).toBe("residential");
    expect(segments[0]!.lengthM + segments[1]!.lengthM).toBeCloseTo(1112, -1);
  });
});

describe("MockRoutingProvider", () => {
  const provider = new MockRoutingProvider();
  it("is deterministic and produces realistic detours", async () => {
    const input = { waypoints: [{ lat: 45.9, lng: 6.13 }, { lat: 45.95, lng: 6.2 }], profile: { activity: "gravel" as const, style: "balanced" as const, preferences: {} } };
    const a = await provider.calculateRoute(input);
    const b = await provider.calculateRoute(input);
    expect(a.distanceM).toBe(b.distanceM);
    expect(a.distanceM).toBeGreaterThan(7500);
    expect(a.segments!.length).toBeGreaterThan(0);
  });
  it("rejects points in the ocean box", async () => {
    await expect(
      provider.calculateRoute({ waypoints: [{ lat: 30, lng: -40 }, { lat: 31, lng: -40 }], profile: { activity: "gravel", style: "balanced", preferences: {} } }),
    ).rejects.toMatchObject({ code: "NOT_ROUTABLE" });
  });
});
