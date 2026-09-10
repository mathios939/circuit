import "server-only";
import { AppError } from "@/lib/errors";
import { getServerEnv } from "@/lib/server/env";
import { GraphHopperRoutingProvider } from "./graphhopper";
import { MockRoutingProvider } from "./mock";
import { OpenRouteServiceRoutingProvider } from "./openrouteservice";
import { OsrmRoutingProvider } from "./osrm";
import type { RoutingProvider } from "./provider";
import { ValhallaRoutingProvider } from "./valhalla";

export type { RoutingProvider, RawRoute, RoutingProfileOptions, CalculateRouteInput, CalculateLoopInput } from "./provider";

let cached: RoutingProvider | undefined;

/** Builds the routing provider selected by the environment (memoised per process). */
export function getRoutingProvider(): RoutingProvider {
  if (cached) return cached;
  const env = getServerEnv().routing;
  switch (env.provider) {
    case "valhalla":
      cached = new ValhallaRoutingProvider({ baseUrl: env.valhallaUrl.replace(/\/$/, ""), timeoutMs: env.timeoutMs });
      break;
    case "graphhopper":
      if (!env.graphhopperKey) throw new AppError("NOT_CONFIGURED", undefined, { details: "GRAPHHOPPER_API_KEY manquante" });
      cached = new GraphHopperRoutingProvider({ baseUrl: env.graphhopperUrl.replace(/\/$/, ""), apiKey: env.graphhopperKey, timeoutMs: env.timeoutMs });
      break;
    case "openrouteservice":
      if (!env.orsKey) throw new AppError("NOT_CONFIGURED", undefined, { details: "OPENROUTESERVICE_API_KEY manquante" });
      cached = new OpenRouteServiceRoutingProvider({ baseUrl: env.orsUrl.replace(/\/$/, ""), apiKey: env.orsKey, timeoutMs: env.timeoutMs });
      break;
    case "osrm":
      if (!env.osrmUrl) throw new AppError("NOT_CONFIGURED", undefined, { details: "ROUTING_OSRM_URL manquante" });
      cached = new OsrmRoutingProvider({ baseUrl: env.osrmUrl.replace(/\/$/, ""), timeoutMs: env.timeoutMs });
      break;
    case "mock":
      cached = new MockRoutingProvider();
      break;
  }
  return cached!;
}
