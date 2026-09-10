import "server-only";
import { AppError, toAppError } from "@/lib/errors";
import { createElevationProvider } from "@/lib/elevation";
import { createGeocodingProvider } from "@/lib/geocoding";
import { getBasemaps } from "@/lib/map/styles";
import { createRoutingProvider } from "@/lib/routing";
import { UpstreamHttpError } from "@/lib/server/http";
import { getServerEnv, type ElevationProviderId, type GeocodingProviderId, type RoutingProviderId } from "./env";

export type ProbeCategory = "routing" | "geocoding" | "elevation" | "maps";

export interface ProbeResult {
  category: ProbeCategory;
  provider: string;
  role: "primary" | "fallback";
  status: "ok" | "error" | "skipped";
  latencyMs?: number;
  httpStatus?: number;
  errorType?: string;
  /** Simplified, key-free message. */
  message?: string;
}

/** Point used by the probes (Annecy, France — well covered by every provider). */
const PROBE_POINT = { lat: 45.8992, lng: 6.1294 };
const PROBE_POINT_2 = { lat: 45.905, lng: 6.14 };
const PROBE_TIMEOUT_MS = 10_000;

/** Runs one probe with timing and error classification. */
async function probe(category: ProbeCategory, provider: string, role: ProbeResult["role"], run: (signal: AbortSignal) => Promise<unknown>): Promise<ProbeResult> {
  const started = performance.now();
  try {
    await run(AbortSignal.timeout(PROBE_TIMEOUT_MS));
    return { category, provider, role, status: "ok", latencyMs: Math.round(performance.now() - started) };
  } catch (e) {
    const latencyMs = Math.round(performance.now() - started);
    if (e instanceof UpstreamHttpError) {
      return { category, provider, role, status: "error", latencyMs, httpStatus: e.status, errorType: "http", message: `Réponse HTTP ${e.status}` };
    }
    const err = toAppError(e);
    return {
      category,
      provider,
      role,
      status: "error",
      latencyMs,
      httpStatus: err.code === "RATE_LIMITED" ? 429 : undefined,
      errorType: err.code,
      message: sanitise(err.details ?? err.message),
    };
  }
}

/** Removes anything that looks like a key from a diagnostic message. */
function sanitise(message: string): string {
  return message.replace(/([?&](?:key|api_key|apikey|token)=)[^&\s]+/gi, "$1[masqué]").slice(0, 200);
}

async function probeRouting(id: RoutingProviderId, role: ProbeResult["role"]): Promise<ProbeResult> {
  return probe("routing", id, role, async (signal) => {
    const p = createRoutingProvider(id);
    const route = await p.calculateRoute({ waypoints: [PROBE_POINT, PROBE_POINT_2], profile: { activity: "road_cycling", style: "balanced", preferences: {} }, signal });
    if (route.coordinates.length < 2) throw new AppError("PROVIDER_UNAVAILABLE", undefined, { details: "réponse sans géométrie" });
  });
}

async function probeGeocoding(id: GeocodingProviderId, role: ProbeResult["role"]): Promise<ProbeResult> {
  return probe("geocoding", id, role, async (signal) => {
    const results = await createGeocodingProvider(id).search("Annecy", { limit: 1, signal });
    if (results.length === 0) throw new AppError("PROVIDER_UNAVAILABLE", undefined, { details: "aucun résultat pour « Annecy »" });
  });
}

async function probeElevation(id: ElevationProviderId, role: ProbeResult["role"]): Promise<ProbeResult> {
  return probe("elevation", id, role, async (signal) => {
    const values = await createElevationProvider(id).lookup([PROBE_POINT], signal);
    if (typeof values[0] !== "number") throw new AppError("PROVIDER_UNAVAILABLE", undefined, { details: "altitude absente" });
  });
}

async function probeMaps(): Promise<ProbeResult[]> {
  const basemaps = getBasemaps();
  return Promise.all(
    basemaps.map((b) =>
      probe("maps", b.label, "primary", async (signal) => {
        // Vector styles: fetch the style document. Raster styles: fetch one tile.
        const url =
          typeof b.style === "string"
            ? b.style
            : (() => {
                const source = Object.values(b.style.sources)[0] as { tiles?: string[] } | undefined;
                return source?.tiles?.[0]?.replace("{z}", "5").replace("{x}", "16").replace("{y}", "11") ?? "";
              })();
        if (!url) throw new AppError("NOT_CONFIGURED", undefined, { details: "style sans URL" });
        const res = await fetch(url, { signal, cache: "no-store", headers: { "User-Agent": getServerEnv().geocoding.userAgent } });
        if (!res.ok) throw new UpstreamHttpError(b.label, res.status, null);
      }),
    ),
  );
}

/** Runs every configured provider probe (primary and fallback), in parallel. */
export async function runDiagnostics(): Promise<ProbeResult[]> {
  const env = getServerEnv();
  const tasks: Promise<ProbeResult | ProbeResult[]>[] = [
    probeRouting(env.routing.provider, "primary"),
    probeGeocoding(env.geocoding.provider, "primary"),
    probeElevation(env.elevation.provider, "primary"),
    probeMaps(),
  ];
  if (env.routing.fallback) tasks.push(probeRouting(env.routing.fallback, "fallback"));
  if (env.geocoding.fallback) tasks.push(probeGeocoding(env.geocoding.fallback, "fallback"));
  for (const id of env.elevation.fallback) tasks.push(probeElevation(id, "fallback"));
  const results = await Promise.all(tasks);
  return results.flat();
}

/** Configuration summary safe to expose (no key, no URL with credentials). */
export function describeConfiguration() {
  const env = getServerEnv();
  return {
    demoMode: env.demoMode,
    routing: { primary: env.routing.provider, fallback: env.routing.fallback ?? null, candidateCount: env.routing.candidateCount, maxIterations: env.routing.maxIterations, maxRoutingCalls: env.routing.maxRoutingCalls, timeoutMs: env.routing.timeoutMs },
    geocoding: { primary: env.geocoding.provider, fallback: env.geocoding.fallback ?? null },
    elevation: { primary: env.elevation.provider, fallback: env.elevation.fallback, samplePoints: env.elevation.samplePoints },
    maps: getBasemaps().map((b) => ({ id: b.id, label: b.label, kind: b.kind })),
    limits: env.limits.perMinute,
    keys: { graphhopper: Boolean(env.routing.graphhopperKey), openrouteservice: Boolean(env.routing.orsKey), maptiler: Boolean(process.env.NEXT_PUBLIC_MAPTILER_KEY) },
  };
}
