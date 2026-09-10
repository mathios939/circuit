/**
 * Centralised, validated access to server-side environment variables.
 * The configuration is parsed once with Zod; an invalid configuration
 * raises a readable NOT_CONFIGURED error listing every problem.
 * Nothing in this module may be imported from client components.
 */
import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";

const ROUTING_IDS = ["valhalla", "graphhopper", "openrouteservice", "osrm", "mock"] as const;
const GEOCODING_IDS = ["photon", "nominatim", "mock"] as const;
const ELEVATION_IDS = ["open-meteo", "opentopodata", "valhalla", "mock"] as const;

export type RoutingProviderId = (typeof ROUTING_IDS)[number];
export type GeocodingProviderId = (typeof GEOCODING_IDS)[number];
export type ElevationProviderId = (typeof ELEVATION_IDS)[number];

const DEFAULT_USER_AGENT = "circuit-app/1.0 (https://github.com/mathios939/circuit)";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const url = z.preprocess(emptyToUndefined, z.string().url().optional());
const intBetween = (min: number, max: number, fallback: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).default(fallback));
const bool = (fallback: boolean) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? ["1", "true", "yes", "on"].includes(v.trim().toLowerCase()) : v === undefined || v === "" ? undefined : v), z.boolean().default(fallback));
const list = <T extends string>(allowed: readonly T[]) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v === undefined ? [] : v),
    z.array(z.enum(allowed as unknown as [T, ...T[]])).default([]),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ----- demo / tests
  NEXT_PUBLIC_DEMO_MODE: bool(false),
  /** Explicit opt-in to run the synthetic providers on a production build (E2E tests only). */
  ALLOW_MOCK_PROVIDERS: bool(false),

  // ----- routing
  ROUTING_PROVIDER: z.preprocess(emptyToUndefined, z.enum(ROUTING_IDS).optional()),
  ROUTING_PROVIDER_PRIMARY: z.preprocess(emptyToUndefined, z.enum(ROUTING_IDS).optional()),
  ROUTING_PROVIDER_FALLBACK: z.preprocess(emptyToUndefined, z.enum(ROUTING_IDS).optional()),
  ROUTING_VALHALLA_URL: url.default("https://valhalla1.openstreetmap.de"),
  GRAPHHOPPER_API_KEY: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  GRAPHHOPPER_URL: url.default("https://graphhopper.com/api/1"),
  OPENROUTESERVICE_API_KEY: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  OPENROUTESERVICE_URL: url.default("https://api.openrouteservice.org"),
  ROUTING_OSRM_URL: url,
  ROUTING_OSRM_BICYCLE_PROFILE: z.preprocess(emptyToUndefined, z.string().default("bike")),
  ROUTING_OSRM_PEDESTRIAN_PROFILE: z.preprocess(emptyToUndefined, z.string().default("foot")),
  ROUTING_TIMEOUT_MS: intBetween(1000, 120_000, 20_000),
  ROUTING_CONCURRENCY: intBetween(1, 10, 3),
  ROUTE_CANDIDATE_COUNT: intBetween(3, 30, 12),
  ROUTE_MAX_ITERATIONS: intBetween(0, 5, 2),
  ROUTE_MAX_ROUTING_CALLS: intBetween(5, 120, 40),

  // ----- geocoding
  GEOCODING_PROVIDER: z.preprocess(emptyToUndefined, z.enum(GEOCODING_IDS).default("photon")),
  GEOCODING_PROVIDER_FALLBACK: z.preprocess(emptyToUndefined, z.enum(GEOCODING_IDS).optional()),
  GEOCODING_PHOTON_URL: url.default("https://photon.komoot.io"),
  GEOCODING_NOMINATIM_URL: url.default("https://nominatim.openstreetmap.org"),
  GEOCODING_NOMINATIM_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  GEOCODING_USER_AGENT: z.preprocess(emptyToUndefined, z.string().min(5).default(DEFAULT_USER_AGENT)),

  // ----- elevation
  ELEVATION_PROVIDER: z.preprocess(emptyToUndefined, z.enum(ELEVATION_IDS).default("open-meteo")),
  ELEVATION_PROVIDER_FALLBACK: list(ELEVATION_IDS),
  ELEVATION_OPEN_METEO_URL: url.default("https://api.open-meteo.com/v1/elevation"),
  ELEVATION_OPENTOPODATA_URL: url.default("https://api.opentopodata.org/v1/srtm30m"),
  ELEVATION_SAMPLE_POINTS: intBetween(50, 2000, 300),

  // ----- limits
  RATE_LIMIT_PER_MINUTE: intBetween(1, 100_000, 60),
  RATE_LIMIT_GEOCODING_PER_MINUTE: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100_000).optional()),
  RATE_LIMIT_GENERATION_PER_MINUTE: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100_000).optional()),
  RATE_LIMIT_CALCULATE_PER_MINUTE: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100_000).optional()),
  RATE_LIMIT_IMPORT_PER_MINUTE: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100_000).optional()),
  RATE_LIMIT_DIAGNOSTICS_PER_MINUTE: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100_000).optional()),
  GPX_MAX_FILE_BYTES: intBetween(10_000, 100 * 1024 * 1024, 10 * 1024 * 1024),

  // ----- observability / diagnostics
  LOG_LEVEL: z.preprocess(emptyToUndefined, z.enum(["debug", "info", "warn", "error", "silent"]).optional()),
  LOG_FORMAT: z.preprocess(emptyToUndefined, z.enum(["json", "pretty"]).optional()),
  DIAGNOSTICS_ENABLED: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),

  NL_PARSER: z.preprocess(emptyToUndefined, z.enum(["rules"]).default("rules")),
});

export type RawServerEnv = z.infer<typeof schema>;

function build(raw: RawServerEnv) {
  const demo = raw.NEXT_PUBLIC_DEMO_MODE;
  const primaryRouting = raw.ROUTING_PROVIDER_PRIMARY ?? raw.ROUTING_PROVIDER ?? "valhalla";
  const isDev = raw.NODE_ENV !== "production";

  const routing = {
    provider: demo ? ("mock" as RoutingProviderId) : primaryRouting,
    fallback: demo ? undefined : raw.ROUTING_PROVIDER_FALLBACK && raw.ROUTING_PROVIDER_FALLBACK !== primaryRouting ? raw.ROUTING_PROVIDER_FALLBACK : undefined,
    valhallaUrl: raw.ROUTING_VALHALLA_URL.replace(/\/$/, ""),
    graphhopperKey: raw.GRAPHHOPPER_API_KEY,
    graphhopperUrl: raw.GRAPHHOPPER_URL.replace(/\/$/, ""),
    orsKey: raw.OPENROUTESERVICE_API_KEY,
    orsUrl: raw.OPENROUTESERVICE_URL.replace(/\/$/, ""),
    osrmUrl: raw.ROUTING_OSRM_URL?.replace(/\/$/, ""),
    osrmBicycleProfile: raw.ROUTING_OSRM_BICYCLE_PROFILE,
    osrmPedestrianProfile: raw.ROUTING_OSRM_PEDESTRIAN_PROFILE,
    timeoutMs: raw.ROUTING_TIMEOUT_MS,
    concurrency: raw.ROUTING_CONCURRENCY,
    candidateCount: raw.ROUTE_CANDIDATE_COUNT,
    maxIterations: raw.ROUTE_MAX_ITERATIONS,
    maxRoutingCalls: raw.ROUTE_MAX_ROUTING_CALLS,
  };

  const geocoding = {
    provider: demo ? ("mock" as GeocodingProviderId) : raw.GEOCODING_PROVIDER,
    fallback: demo
      ? undefined
      : (raw.GEOCODING_PROVIDER_FALLBACK ?? (raw.GEOCODING_PROVIDER === "photon" ? "nominatim" : raw.GEOCODING_PROVIDER === "nominatim" ? "photon" : undefined)),
    photonUrl: raw.GEOCODING_PHOTON_URL.replace(/\/$/, ""),
    nominatimUrl: raw.GEOCODING_NOMINATIM_URL.replace(/\/$/, ""),
    nominatimEmail: raw.GEOCODING_NOMINATIM_EMAIL,
    userAgent: raw.GEOCODING_USER_AGENT,
  };
  if (geocoding.fallback === geocoding.provider) geocoding.fallback = undefined;

  const elevationFallback = demo
    ? []
    : raw.ELEVATION_PROVIDER_FALLBACK.length > 0
      ? raw.ELEVATION_PROVIDER_FALLBACK
      : raw.ELEVATION_PROVIDER === "open-meteo"
        ? (["valhalla"] as ElevationProviderId[])
        : [];
  const elevation = {
    provider: demo ? ("mock" as ElevationProviderId) : raw.ELEVATION_PROVIDER,
    fallback: elevationFallback.filter((id) => id !== raw.ELEVATION_PROVIDER),
    openMeteoUrl: raw.ELEVATION_OPEN_METEO_URL,
    openTopoDataUrl: raw.ELEVATION_OPENTOPODATA_URL,
    samplePoints: raw.ELEVATION_SAMPLE_POINTS,
  };

  const base = raw.RATE_LIMIT_PER_MINUTE;
  const limits = {
    /** Requests per minute and per IP, by bucket. */
    perMinute: {
      geocoding: raw.RATE_LIMIT_GEOCODING_PER_MINUTE ?? base * 2,
      generation: raw.RATE_LIMIT_GENERATION_PER_MINUTE ?? Math.max(1, Math.round(base / 5)),
      calculate: raw.RATE_LIMIT_CALCULATE_PER_MINUTE ?? base,
      import: raw.RATE_LIMIT_IMPORT_PER_MINUTE ?? base,
      diagnostics: raw.RATE_LIMIT_DIAGNOSTICS_PER_MINUTE ?? 6,
    },
    gpxMaxFileBytes: raw.GPX_MAX_FILE_BYTES,
  };

  const problems: string[] = [];
  if (!demo) {
    const needs = (id: RoutingProviderId, label: string) => {
      if (id === "graphhopper" && !routing.graphhopperKey) problems.push(`${label} : GRAPHHOPPER_API_KEY manquante`);
      if (id === "openrouteservice" && !routing.orsKey) problems.push(`${label} : OPENROUTESERVICE_API_KEY manquante`);
      if (id === "osrm" && !routing.osrmUrl) problems.push(`${label} : ROUTING_OSRM_URL manquante`);
    };
    needs(routing.provider, "ROUTING_PROVIDER");
    if (routing.fallback) needs(routing.fallback, "ROUTING_PROVIDER_FALLBACK");
    const mockRefused = !isDev && !raw.ALLOW_MOCK_PROVIDERS;
    if (mockRefused && routing.provider === "mock") problems.push("ROUTING_PROVIDER=mock est réservé aux tests (NODE_ENV=production sans ALLOW_MOCK_PROVIDERS=true)");
    if (mockRefused && geocoding.provider === "mock") problems.push("GEOCODING_PROVIDER=mock est réservé aux tests (NODE_ENV=production sans ALLOW_MOCK_PROVIDERS=true)");
    if (mockRefused && elevation.provider === "mock") problems.push("ELEVATION_PROVIDER=mock est réservé aux tests (NODE_ENV=production sans ALLOW_MOCK_PROVIDERS=true)");
  }

  // Non-blocking warnings: the configuration works but is not what a
  // production deployment usually wants. Logged once at startup and shown on
  // /api/health so that they are not silently forgotten.
  const warnings: string[] = [];
  if (!isDev) {
    const local = (label: string, value: string | undefined) => {
      if (value && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(value)) warnings.push(`${label} pointe vers une adresse locale (${value})`);
    };
    local("ROUTING_VALHALLA_URL", routing.provider === "valhalla" || routing.fallback === "valhalla" ? routing.valhallaUrl : undefined);
    local("ROUTING_OSRM_URL", routing.osrmUrl);
    local("GEOCODING_PHOTON_URL", geocoding.photonUrl);
    local("GEOCODING_NOMINATIM_URL", geocoding.nominatimUrl);
    local("ELEVATION_OPEN_METEO_URL", elevation.openMeteoUrl);
    local("ELEVATION_OPENTOPODATA_URL", elevation.openTopoDataUrl);
    const diagnosticsEnabled = raw.DIAGNOSTICS_ENABLED === "true";
    if (diagnosticsEnabled) warnings.push("DIAGNOSTICS_ENABLED=true expose /diagnostics et /api/health?probe=1 en production (limité en débit, mais public)");
    if (raw.ALLOW_MOCK_PROVIDERS && !demo) warnings.push("ALLOW_MOCK_PROVIDERS=true en production : réservé aux tests E2E");
    if (routing.provider === "valhalla" && routing.valhallaUrl === "https://valhalla1.openstreetmap.de") warnings.push("ROUTING_VALHALLA_URL utilise l'instance publique FOSSGIS : réservée à un usage modéré, pas à un trafic de production");
    if (geocoding.userAgent === DEFAULT_USER_AGENT) warnings.push("GEOCODING_USER_AGENT n'identifie pas votre déploiement (contact demandé par Photon / Nominatim)");
  }

  return {
    nodeEnv: raw.NODE_ENV,
    isDev,
    demoMode: demo,
    routing,
    geocoding,
    elevation,
    limits,
    observability: {
      logLevel: raw.LOG_LEVEL ?? (isDev ? "debug" : "info"),
      logFormat: raw.LOG_FORMAT ?? (isDev ? "pretty" : "json"),
      diagnosticsEnabled: raw.DIAGNOSTICS_ENABLED ? raw.DIAGNOSTICS_ENABLED === "true" : isDev,
    },
    nl: { parser: raw.NL_PARSER },
    problems,
    warnings,
  };
}

export type ServerEnv = ReturnType<typeof build>;

let cached: ServerEnv | undefined;

/**
 * Parses and validates process.env (memoised). Throws NOT_CONFIGURED with an
 * explicit message when a variable is invalid or a required key is missing
 * for the selected provider.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".") || "env"} : ${i.message}`).join(" ; ");
    throw new AppError("NOT_CONFIGURED", `Configuration serveur invalide — ${details}`, { details });
  }
  const env = build(parsed.data);
  if (env.problems.length > 0) {
    const details = env.problems.join(" ; ");
    throw new AppError("NOT_CONFIGURED", `Configuration serveur incomplète — ${details}`, { details });
  }
  cached = env;
  return env;
}

/** Parses an arbitrary environment object (used by tests and diagnostics). */
export function parseServerEnv(source: Record<string, string | undefined>): { env?: ServerEnv; errors: string[] } {
  const parsed = schema.safeParse(source);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => `${i.path.join(".") || "env"} : ${i.message}`) };
  const env = build(parsed.data);
  return { env, errors: env.problems };
}
