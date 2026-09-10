/**
 * Centralised, validated access to server-side environment variables.
 * Nothing in this module may be imported from client components.
 */
import "server-only";

const int = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const str = (value: string | undefined, fallback: string): string => {
  const v = value?.trim();
  return v && v.length > 0 ? v : fallback;
};

export type RoutingProviderId = "valhalla" | "graphhopper" | "openrouteservice" | "osrm" | "mock";
export type GeocodingProviderId = "photon" | "nominatim" | "mock";
export type ElevationProviderId = "open-meteo" | "opentopodata" | "valhalla" | "mock";

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const v = value?.trim() as T | undefined;
  return v && allowed.includes(v) ? v : fallback;
}

export function getServerEnv() {
  const e = process.env;
  return {
    routing: {
      provider: oneOf<RoutingProviderId>(e.ROUTING_PROVIDER, ["valhalla", "graphhopper", "openrouteservice", "osrm", "mock"], "valhalla"),
      valhallaUrl: str(e.ROUTING_VALHALLA_URL, "https://valhalla1.openstreetmap.de"),
      graphhopperKey: e.GRAPHHOPPER_API_KEY?.trim() || undefined,
      graphhopperUrl: str(e.GRAPHHOPPER_URL, "https://graphhopper.com/api/1"),
      orsKey: e.OPENROUTESERVICE_API_KEY?.trim() || undefined,
      orsUrl: str(e.OPENROUTESERVICE_URL, "https://api.openrouteservice.org"),
      osrmUrl: e.ROUTING_OSRM_URL?.trim() || undefined,
      timeoutMs: int(e.ROUTING_TIMEOUT_MS, 20_000),
      concurrency: int(e.ROUTING_CONCURRENCY, 3),
    },
    geocoding: {
      provider: oneOf<GeocodingProviderId>(e.GEOCODING_PROVIDER, ["photon", "nominatim", "mock"], "photon"),
      photonUrl: str(e.GEOCODING_PHOTON_URL, "https://photon.komoot.io"),
      nominatimUrl: str(e.GEOCODING_NOMINATIM_URL, "https://nominatim.openstreetmap.org"),
      userAgent: str(e.GEOCODING_USER_AGENT, "circuit-app/0.1 (https://github.com/mathios939/circuit)"),
    },
    elevation: {
      provider: oneOf<ElevationProviderId>(e.ELEVATION_PROVIDER, ["open-meteo", "opentopodata", "valhalla", "mock"], "open-meteo"),
      openMeteoUrl: str(e.ELEVATION_OPEN_METEO_URL, "https://api.open-meteo.com/v1/elevation"),
      openTopoDataUrl: str(e.ELEVATION_OPENTOPODATA_URL, "https://api.opentopodata.org/v1/srtm30m"),
      samplePoints: int(e.ELEVATION_SAMPLE_POINTS, 300),
    },
    limits: {
      rateLimitPerMinute: int(e.RATE_LIMIT_PER_MINUTE, 60),
      gpxMaxFileBytes: int(e.GPX_MAX_FILE_BYTES, 10 * 1024 * 1024),
    },
    nl: {
      parser: oneOf(e.NL_PARSER, ["rules"] as const, "rules"),
    },
  };
}

export type ServerEnv = ReturnType<typeof getServerEnv>;
