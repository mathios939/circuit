import "server-only";
import { getServerEnv } from "@/lib/server/env";
import { MockElevationProvider } from "./mock";
import { OpenMeteoElevationProvider } from "./open-meteo";
import { OpenTopoDataElevationProvider } from "./opentopodata";
import type { ElevationProvider } from "./provider";
import { ValhallaElevationProvider } from "./valhalla";

export type { ElevationProvider } from "./provider";

let cached: ElevationProvider | undefined;

export function getElevationProvider(): ElevationProvider {
  if (cached) return cached;
  const env = getServerEnv();
  switch (env.elevation.provider) {
    case "open-meteo":
      cached = new OpenMeteoElevationProvider(env.elevation.openMeteoUrl);
      break;
    case "opentopodata":
      cached = new OpenTopoDataElevationProvider(env.elevation.openTopoDataUrl);
      break;
    case "valhalla":
      cached = new ValhallaElevationProvider(env.routing.valhallaUrl.replace(/\/$/, ""));
      break;
    case "mock":
      cached = new MockElevationProvider();
      break;
  }
  return cached!;
}
