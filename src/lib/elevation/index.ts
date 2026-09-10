import "server-only";
import { getServerEnv, type ElevationProviderId } from "@/lib/server/env";
import { getGlobalCache } from "@/lib/server/cache";
import { getRootLogger } from "@/lib/server/logger";
import { CachedElevationProvider, ChainedElevationProvider } from "./fallback";
import { MockElevationProvider } from "./mock";
import { OpenMeteoElevationProvider } from "./open-meteo";
import { OpenTopoDataElevationProvider } from "./opentopodata";
import type { ElevationProvider } from "./provider";
import { ValhallaElevationProvider } from "./valhalla";

export type { ElevationProvider } from "./provider";

const instances = new Map<ElevationProviderId, ElevationProvider>();

export function createElevationProvider(id: ElevationProviderId): ElevationProvider {
  const cached = instances.get(id);
  if (cached) return cached;
  const env = getServerEnv();
  let provider: ElevationProvider;
  switch (id) {
    case "open-meteo":
      provider = new OpenMeteoElevationProvider(env.elevation.openMeteoUrl);
      break;
    case "opentopodata":
      provider = new OpenTopoDataElevationProvider(env.elevation.openTopoDataUrl);
      break;
    case "valhalla":
      provider = new ValhallaElevationProvider(env.routing.valhallaUrl);
      break;
    case "mock":
      provider = new MockElevationProvider();
      break;
  }
  instances.set(id, provider);
  return provider;
}

let composed: ElevationProvider | undefined;

/**
 * Elevation chain: primary → fallbacks, wrapped in a per-coordinate cache
 * (7 days TTL, 50 000 entries). The final fallback — a route without
 * altitude — is handled by enrichWithElevation.
 */
export function getElevationProvider(): ElevationProvider {
  if (composed) return composed;
  const env = getServerEnv().elevation;
  const chain = [env.provider, ...env.fallback].map(createElevationProvider);
  const inner = chain.length > 1 ? new ChainedElevationProvider(chain, getRootLogger()) : chain[0]!;
  composed = new CachedElevationProvider(inner, getGlobalCache<number>("elevation", 50_000, 7 * 24 * 60 * 60 * 1000));
  return composed;
}
