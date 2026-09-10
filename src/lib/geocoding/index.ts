import "server-only";
import { AppError, isAppError } from "@/lib/errors";
import { getServerEnv, type GeocodingProviderId } from "@/lib/server/env";
import { getRootLogger } from "@/lib/server/logger";
import { FallbackGeocodingProvider } from "./fallback";
import { MockGeocodingProvider } from "./mock";
import { NominatimGeocodingProvider } from "./nominatim";
import { PhotonGeocodingProvider } from "./photon";
import type { GeocodingProvider } from "./provider";

export type { GeocodingProvider, GeocodeResult, GeocodeOptions } from "./provider";

const instances = new Map<GeocodingProviderId, GeocodingProvider>();

export function createGeocodingProvider(id: GeocodingProviderId): GeocodingProvider {
  const cached = instances.get(id);
  if (cached) return cached;
  const env = getServerEnv().geocoding;
  let provider: GeocodingProvider;
  switch (id) {
    case "photon":
      provider = new PhotonGeocodingProvider(env.photonUrl, env.userAgent);
      break;
    case "nominatim":
      provider = new NominatimGeocodingProvider(env.nominatimUrl, env.userAgent, 8_000, env.nominatimEmail);
      break;
    case "mock":
      provider = new MockGeocodingProvider();
      break;
  }
  instances.set(id, provider);
  return provider;
}

let composed: GeocodingProvider | undefined;

/** Primary geocoder wrapped with its fallback (Photon ⇄ Nominatim by default). */
export function getGeocodingProvider(): GeocodingProvider {
  if (composed) return composed;
  const env = getServerEnv().geocoding;
  const primary = createGeocodingProvider(env.provider);
  composed = env.fallback ? new FallbackGeocodingProvider(primary, createGeocodingProvider(env.fallback), getRootLogger()) : primary;
  return composed;
}

/**
 * Service failures carry a routing-oriented default message; for the place
 * search the user needs to know that it is the *search* that is down and
 * that the map is an alternative.
 */
export function geocodingError(e: unknown): unknown {
  if (!isAppError(e)) return e;
  if (e.code === "PROVIDER_UNAVAILABLE" || e.code === "PROVIDER_TIMEOUT" || e.code === "RATE_LIMITED") {
    return new AppError(e.code, "La recherche de lieux est momentanément indisponible. Réessayez dans quelques instants ou placez le point directement sur la carte.", { status: e.status, details: e.details, cause: e });
  }
  return e;
}
