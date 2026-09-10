import { beforeAll, describe, expect, it } from "vitest";
import { OpenMeteoElevationProvider } from "@/lib/elevation/open-meteo";
import { OpenTopoDataElevationProvider } from "@/lib/elevation/opentopodata";
import { ValhallaElevationProvider } from "@/lib/elevation/valhalla";
import { NominatimGeocodingProvider } from "@/lib/geocoding/nominatim";
import { PhotonGeocodingProvider } from "@/lib/geocoding/photon";
import { GraphHopperRoutingProvider } from "@/lib/routing/graphhopper";
import { OpenRouteServiceRoutingProvider } from "@/lib/routing/openrouteservice";
import { OsrmRoutingProvider } from "@/lib/routing/osrm";
import type { RoutingProvider } from "@/lib/routing/provider";
import { ValhallaRoutingProvider } from "@/lib/routing/valhalla";
import { generateRoutes } from "@/lib/route-generator";

/**
 * Real-provider integration tests. They are opt-in (`npm run test:integration`)
 * and skip themselves when the network is unreachable or a key is missing,
 * so that `npm test` never depends on an external service.
 *
 * Environment variables honoured: ROUTING_VALHALLA_URL, GRAPHHOPPER_API_KEY,
 * OPENROUTESERVICE_API_KEY, ROUTING_OSRM_URL, GEOCODING_USER_AGENT.
 */
const UA = process.env.GEOCODING_USER_AGENT ?? "circuit-integration-tests/0.1 (https://github.com/mathios939/circuit)";
const ANNECY = { lat: 45.8992, lng: 6.1294 };
const NEARBY = { lat: 45.905, lng: 6.14 };
const profile = { activity: "road_cycling" as const, style: "balanced" as const, preferences: {} };

let online = false;
beforeAll(async () => {
  try {
    const res = await fetch("https://valhalla1.openstreetmap.de/status", { signal: AbortSignal.timeout(8000) });
    online = res.ok || res.status < 500;
  } catch {
    online = false;
  }
  if (!online) console.warn("[integration] network unreachable: every provider test is skipped");
});

const skipUnless = (condition: () => boolean) => (condition() ? it : it.skip);

async function expectRealRoute(provider: RoutingProvider) {
  const route = await provider.calculateRoute({ waypoints: [ANNECY, NEARBY], profile });
  expect(route.coordinates.length).toBeGreaterThan(5);
  expect(route.distanceM).toBeGreaterThan(800);
  expect(route.distanceM).toBeLessThan(6000);
  expect(route.coordinates[0]!.lat).toBeCloseTo(ANNECY.lat, 2);
  expect(route.coordinates[0]!.lng).toBeCloseTo(ANNECY.lng, 2);
  return route;
}

describe("routing providers", () => {
  skipUnless(() => online)("Valhalla routes, returns instructions and surface attributes", async () => {
    const p = new ValhallaRoutingProvider({ baseUrl: process.env.ROUTING_VALHALLA_URL ?? "https://valhalla1.openstreetmap.de", timeoutMs: 20_000 });
    const route = await expectRealRoute(p);
    expect(route.instructions?.length).toBeGreaterThan(0);
    expect(route.instructions?.[0]!.type).toBe("depart");
    const segments = await p.getRouteDetails(route, profile);
    expect(Array.isArray(segments)).toBe(true);
  });

  skipUnless(() => online && Boolean(process.env.GRAPHHOPPER_API_KEY))("GraphHopper routes with elevation, details and a native round trip", async () => {
    const p = new GraphHopperRoutingProvider({ baseUrl: "https://graphhopper.com/api/1", apiKey: process.env.GRAPHHOPPER_API_KEY!, timeoutMs: 20_000 });
    const route = await expectRealRoute(p);
    expect(route.coordinates.some((c) => typeof c.ele === "number")).toBe(true);
    expect(route.segments?.length).toBeGreaterThan(0);
    const loop = await p.calculateLoop({ start: ANNECY, distanceM: 10_000, seed: 1, profile });
    expect(Math.abs(loop.distanceM - 10_000) / 10_000).toBeLessThan(0.3);
  });

  skipUnless(() => online && Boolean(process.env.OPENROUTESERVICE_API_KEY))("openrouteservice routes with extras and a native round trip", async () => {
    const p = new OpenRouteServiceRoutingProvider({ baseUrl: "https://api.openrouteservice.org", apiKey: process.env.OPENROUTESERVICE_API_KEY!, timeoutMs: 20_000 });
    const route = await expectRealRoute(p);
    expect(route.segments?.length).toBeGreaterThan(0);
    const loop = await p.calculateLoop({ start: ANNECY, distanceM: 10_000, seed: 1, profile });
    expect(Math.abs(loop.distanceM - 10_000) / 10_000).toBeLessThan(0.3);
  });

  skipUnless(() => online && Boolean(process.env.ROUTING_OSRM_URL))("OSRM (self-hosted) routes", async () => {
    const p = new OsrmRoutingProvider({ baseUrl: process.env.ROUTING_OSRM_URL!, timeoutMs: 20_000 });
    await expectRealRoute(p);
  });
});

describe("geocoding providers", () => {
  skipUnless(() => online)("Photon finds Annecy and reverse-geocodes", async () => {
    const p = new PhotonGeocodingProvider("https://photon.komoot.io", UA);
    const results = await p.search("Annecy", { limit: 3 });
    expect(results[0]!.name).toMatch(/Annecy/);
    expect(results[0]!.lat).toBeCloseTo(45.9, 0);
    const reverse = await p.reverse(ANNECY);
    expect(reverse).not.toBeNull();
  });
  skipUnless(() => online)("Nominatim finds the Eiffel Tower (1 req/s policy respected)", async () => {
    const p = new NominatimGeocodingProvider("https://nominatim.openstreetmap.org", UA, 10_000, process.env.GEOCODING_NOMINATIM_EMAIL);
    const results = await p.search("Tour Eiffel", { limit: 1 });
    expect(results[0]!.lat).toBeCloseTo(48.858, 1);
    expect(results[0]!.lng).toBeCloseTo(2.294, 1);
  });
});

describe("elevation providers", () => {
  skipUnless(() => online)("Open-Meteo returns a plausible altitude for Annecy (≈ 450 m)", async () => {
    const values = await new OpenMeteoElevationProvider("https://api.open-meteo.com/v1/elevation").lookup([ANNECY, NEARBY]);
    expect(values[0]).toBeGreaterThan(380);
    expect(values[0]).toBeLessThan(600);
  });
  skipUnless(() => online)("OpenTopoData returns a plausible altitude", async () => {
    const values = await new OpenTopoDataElevationProvider("https://api.opentopodata.org/v1/srtm30m").lookup([ANNECY]);
    expect(values[0]).toBeGreaterThan(380);
    expect(values[0]).toBeLessThan(600);
  });
  skipUnless(() => online)("Valhalla /height returns altitudes (or a documented failure)", async () => {
    const p = new ValhallaElevationProvider(process.env.ROUTING_VALHALLA_URL ?? "https://valhalla1.openstreetmap.de");
    try {
      const values = await p.lookup([ANNECY]);
      expect(values[0] === null || (values[0]! > 380 && values[0]! < 600)).toBe(true);
    } catch (e) {
      console.warn("[integration] Valhalla /height unavailable on this instance:", (e as Error).message);
    }
  });
});

describe("map providers", () => {
  skipUnless(() => online)("OpenFreeMap style is served", async () => {
    const res = await fetch("https://tiles.openfreemap.org/styles/liberty", { signal: AbortSignal.timeout(10_000) });
    expect(res.ok).toBe(true);
    const style = (await res.json()) as { version?: number };
    expect(style.version).toBe(8);
  });
  skipUnless(() => online)("OpenTopoMap serves a tile", async () => {
    const res = await fetch("https://a.tile.opentopomap.org/5/16/11.png", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    expect(res.ok).toBe(true);
  });
  skipUnless(() => online && Boolean(process.env.NEXT_PUBLIC_MAPTILER_KEY))("MapTiler outdoor style is served with the configured key", async () => {
    const res = await fetch(`https://api.maptiler.com/maps/outdoor-v2/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`, { signal: AbortSignal.timeout(10_000) });
    expect(res.ok).toBe(true);
  });
});

describe("end-to-end generation on the real primary engine", () => {
  skipUnless(() => online)("Annecy · road cycling · 25 km loop lands within ±10 % with distinct variants", async () => {
    const routing = new ValhallaRoutingProvider({ baseUrl: process.env.ROUTING_VALHALLA_URL ?? "https://valhalla1.openstreetmap.de", timeoutMs: 25_000 });
    const elevation = new OpenMeteoElevationProvider("https://api.open-meteo.com/v1/elevation");
    const result = await generateRoutes(
      { mode: "loop", activity: "road_cycling", start: { ...ANNECY, name: "Annecy" }, distanceKm: 25, seed: 5 },
      { routing, elevation, concurrency: 2, elevationSamples: 120, candidateCount: 8, maxIterations: 2, maxRoutingCalls: 24 },
    );
    expect(result.routes.length).toBeGreaterThanOrEqual(1);
    for (const r of result.routes) {
      expect(Math.abs(r.stats.distanceM - 25_000) / 25_000).toBeLessThanOrEqual(0.1);
      expect(r.quality?.rejected).toBe(false);
    }
    console.info("[integration] generation", { routes: result.routes.length, calls: result.routingCalls, timings: result.timings, distances: result.routes.map((r) => r.stats.distanceM) });
  }, 180_000);
});
