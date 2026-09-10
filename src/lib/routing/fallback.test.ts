import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { CachedElevationProvider, ChainedElevationProvider } from "@/lib/elevation/fallback";
import { MockElevationProvider } from "@/lib/elevation/mock";
import type { ElevationProvider } from "@/lib/elevation/provider";
import { FallbackGeocodingProvider } from "@/lib/geocoding/fallback";
import { MockGeocodingProvider } from "@/lib/geocoding/mock";
import type { GeocodingProvider } from "@/lib/geocoding/provider";
import { LruTtlCache } from "@/lib/server/cache";
import { createLogger, MemorySink } from "@/lib/server/logger";
import { FallbackRoutingProvider } from "./fallback";
import { buildInstructions, countTurns, graphhopperSignType, orsStepType, osrmManeuverType, valhallaManeuverType } from "./instructions";
import { MockRoutingProvider } from "./mock";
import type { CalculateRouteInput, RawRoute, RoutingProvider } from "./provider";

const input: CalculateRouteInput = { waypoints: [{ lat: 45.9, lng: 6.13 }, { lat: 45.95, lng: 6.2 }], profile: { activity: "gravel", style: "balanced", preferences: {} } };

function failing(code: "PROVIDER_TIMEOUT" | "PROVIDER_UNAVAILABLE" | "NO_ROUTE" | "NOT_ROUTABLE"): RoutingProvider {
  return {
    id: `failing-${code}`,
    capabilities: { nativeLoop: false, elevation: false, segments: false, matrix: false },
    calculateRoute: async () => {
      throw new AppError(code);
    },
  };
}

describe("FallbackRoutingProvider", () => {
  it("uses the fallback when the primary is unavailable and logs it", async () => {
    const sink = new MemorySink();
    const p = new FallbackRoutingProvider(failing("PROVIDER_TIMEOUT"), new MockRoutingProvider(), createLogger({ sink, level: "debug" }));
    const route = await p.calculateRoute(input);
    expect(route.coordinates.length).toBeGreaterThan(2);
    expect(p.lastUsed).toBe("mock");
    expect(sink.records.some((r) => r.level === "warn" && /fallback/.test(r.message))).toBe(true);
  });
  it("never falls back on request-level failures (no route, unroutable)", async () => {
    await expect(new FallbackRoutingProvider(failing("NO_ROUTE"), new MockRoutingProvider()).calculateRoute(input)).rejects.toMatchObject({ code: "NO_ROUTE" });
    await expect(new FallbackRoutingProvider(failing("NOT_ROUTABLE"), new MockRoutingProvider()).calculateRoute(input)).rejects.toMatchObject({ code: "NOT_ROUTABLE" });
  });
  it("propagates the fallback's error when both fail", async () => {
    await expect(new FallbackRoutingProvider(failing("PROVIDER_UNAVAILABLE"), failing("PROVIDER_TIMEOUT")).calculateRoute(input)).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
  });
});

describe("FallbackGeocodingProvider / ChainedElevationProvider / CachedElevationProvider", () => {
  const brokenGeo: GeocodingProvider = {
    id: "broken",
    search: async () => {
      throw new AppError("PROVIDER_UNAVAILABLE");
    },
    reverse: async () => {
      throw new AppError("PROVIDER_TIMEOUT");
    },
  };
  it("geocoding falls back to the secondary service", async () => {
    const p = new FallbackGeocodingProvider(brokenGeo, new MockGeocodingProvider());
    expect((await p.search("Annecy"))[0]!.name).toBe("Annecy");
    expect(p.lastUsed).toBe("mock");
    expect(await p.reverse({ lat: 45.9, lng: 6.13 })).not.toBeNull();
  });
  it("elevation chain tries providers in order and the cache avoids repeated lookups", async () => {
    let calls = 0;
    const broken: ElevationProvider = {
      id: "broken",
      batchSize: 10,
      lookup: async () => {
        throw new AppError("PROVIDER_UNAVAILABLE");
      },
    };
    const counting: ElevationProvider = {
      id: "counting",
      batchSize: 100,
      lookup: async (pts) => {
        calls++;
        return new MockElevationProvider().lookup(pts);
      },
    };
    const chain = new ChainedElevationProvider([broken, counting]);
    expect(chain.batchSize).toBe(10);
    const cached = new CachedElevationProvider(chain, new LruTtlCache<number>(100, 60_000));
    const pts = [{ lat: 45.9, lng: 6.13 }, { lat: 45.91, lng: 6.14 }];
    const first = await cached.lookup(pts);
    const second = await cached.lookup(pts);
    expect(first).toEqual(second);
    expect(chain.lastUsed).toBe("counting");
    expect(calls).toBe(1);
  });
});

describe("instruction normalisation", () => {
  it("maps engine codes to the internal vocabulary", () => {
    expect(valhallaManeuverType(1)).toBe("depart");
    expect(valhallaManeuverType(10)).toBe("turn_right");
    expect(valhallaManeuverType(15)).toBe("turn_left");
    expect(valhallaManeuverType(26)).toBe("roundabout");
    expect(graphhopperSignType(-2)).toBe("turn_left");
    expect(graphhopperSignType(4)).toBe("arrive");
    expect(graphhopperSignType(6)).toBe("roundabout");
    expect(orsStepType(11)).toBe("depart");
    expect(orsStepType(1)).toBe("turn_right");
    expect(osrmManeuverType("turn", "sharp left")).toBe("turn_sharp_left");
    expect(osrmManeuverType("arrive", undefined)).toBe("arrive");
    expect(osrmManeuverType("continue", "uturn")).toBe("u_turn");
  });
  it("attaches coordinates and counts real turns", () => {
    const coords = [{ lat: 45, lng: 6 }, { lat: 45.001, lng: 6 }, { lat: 45.002, lng: 6.001 }];
    const instructions = buildInstructions(coords, [
      { distanceM: 100, type: "depart", pointIndex: 0 },
      { distanceM: 120, type: "turn_right", pointIndex: 1, streetName: "Rue A" },
      { distanceM: 0, type: "arrive", pointIndex: 99 },
    ]);
    expect(instructions).toHaveLength(3);
    expect(instructions[1]!.coordinates).toEqual({ lat: 45.001, lng: 6 });
    expect(instructions[2]!.coordinates).toEqual(coords[2]);
    expect(countTurns(instructions)).toBe(1);
  });
  it("mock routes carry no instructions but a RawRoute may", () => {
    const raw: RawRoute = { coordinates: [{ lat: 45, lng: 6 }, { lat: 45.01, lng: 6 }], distanceM: 1100, instructions: [] };
    expect(raw.instructions).toEqual([]);
  });
});
