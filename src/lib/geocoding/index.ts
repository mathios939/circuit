import "server-only";
import { getServerEnv } from "@/lib/server/env";
import { MockGeocodingProvider } from "./mock";
import { NominatimGeocodingProvider } from "./nominatim";
import { PhotonGeocodingProvider } from "./photon";
import type { GeocodingProvider } from "./provider";

export type { GeocodingProvider, GeocodeResult, GeocodeOptions } from "./provider";

let cached: GeocodingProvider | undefined;

export function getGeocodingProvider(): GeocodingProvider {
  if (cached) return cached;
  const env = getServerEnv().geocoding;
  switch (env.provider) {
    case "photon":
      cached = new PhotonGeocodingProvider(env.photonUrl.replace(/\/$/, ""), env.userAgent);
      break;
    case "nominatim":
      cached = new NominatimGeocodingProvider(env.nominatimUrl.replace(/\/$/, ""), env.userAgent);
      break;
    case "mock":
      cached = new MockGeocodingProvider();
      break;
  }
  return cached!;
}
