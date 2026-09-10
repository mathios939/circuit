import "server-only";
import { AppError } from "@/lib/errors";
import { getServerEnv, type RoutingProviderId } from "@/lib/server/env";
import { getRootLogger } from "@/lib/server/logger";
import { FallbackRoutingProvider } from "./fallback";
import { GraphHopperRoutingProvider } from "./graphhopper";
import { MockRoutingProvider } from "./mock";
import { OpenRouteServiceRoutingProvider } from "./openrouteservice";
import { OsrmRoutingProvider } from "./osrm";
import type { RoutingProvider } from "./provider";
import { ValhallaRoutingProvider } from "./valhalla";

export type { RoutingProvider, RawRoute, RoutingProfileOptions, CalculateRouteInput, CalculateLoopInput } from "./provider";

const instances = new Map<RoutingProviderId, RoutingProvider>();

/** Instantiates one concrete engine from the validated configuration. */
export function createRoutingProvider(id: RoutingProviderId): RoutingProvider {
  const cached = instances.get(id);
  if (cached) return cached;
  const env = getServerEnv().routing;
  let provider: RoutingProvider;
  switch (id) {
    case "valhalla":
      provider = new ValhallaRoutingProvider({ baseUrl: env.valhallaUrl, timeoutMs: env.timeoutMs });
      break;
    case "graphhopper":
      if (!env.graphhopperKey) throw new AppError("NOT_CONFIGURED", undefined, { details: "GRAPHHOPPER_API_KEY manquante" });
      provider = new GraphHopperRoutingProvider({ baseUrl: env.graphhopperUrl, apiKey: env.graphhopperKey, timeoutMs: env.timeoutMs });
      break;
    case "openrouteservice":
      if (!env.orsKey) throw new AppError("NOT_CONFIGURED", undefined, { details: "OPENROUTESERVICE_API_KEY manquante" });
      provider = new OpenRouteServiceRoutingProvider({ baseUrl: env.orsUrl, apiKey: env.orsKey, timeoutMs: env.timeoutMs });
      break;
    case "osrm":
      if (!env.osrmUrl) throw new AppError("NOT_CONFIGURED", undefined, { details: "ROUTING_OSRM_URL manquante" });
      provider = new OsrmRoutingProvider({ baseUrl: env.osrmUrl, timeoutMs: env.timeoutMs, bicycleProfile: env.osrmBicycleProfile, pedestrianProfile: env.osrmPedestrianProfile });
      break;
    case "mock":
      provider = new MockRoutingProvider();
      break;
  }
  instances.set(id, provider);
  return provider;
}

let composed: RoutingProvider | undefined;

/**
 * The routing provider used by the application: the primary engine, wrapped
 * with the configured fallback (used only when the primary is unavailable).
 */
export function getRoutingProvider(): RoutingProvider {
  if (composed) return composed;
  const env = getServerEnv().routing;
  const primary = createRoutingProvider(env.provider);
  composed = env.fallback ? new FallbackRoutingProvider(primary, createRoutingProvider(env.fallback), getRootLogger()) : primary;
  return composed;
}
