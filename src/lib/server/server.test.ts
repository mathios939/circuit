import { describe, expect, it } from "vitest";
import { LruTtlCache, memoizeAsync } from "./cache";
import { parseServerEnv } from "./env";
import { createThrottle } from "./http";
import { createLogger, MemorySink, redact } from "./logger";
import { checkRateLimit, clientKeyFromHeaders, RATE_LIMIT_MESSAGES } from "./rate-limit";
import { AppError, isRetryableError, toAppError, USER_MESSAGES } from "@/lib/errors";

describe("LruTtlCache", () => {
  it("stores, expires and evicts", () => {
    const cache = new LruTtlCache<number>(2, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3); // evicts "b" (least recently used)
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    cache.set("d", 4, -1); // already expired
    expect(cache.get("d")).toBeUndefined();
  });

  it("memoises async computations and shares in-flight promises", async () => {
    const cache = new LruTtlCache<string>();
    const memo = memoizeAsync(cache);
    let calls = 0;
    const compute = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return "v";
    };
    const [a, b] = await Promise.all([memo("k", compute), memo("k", compute)]);
    expect(a).toBe("v");
    expect(b).toBe("v");
    expect(calls).toBe(1);
    await memo("k", compute);
    expect(calls).toBe(1);
  });
});

describe("checkRateLimit (buckets)", () => {
  it("allows up to the limit per minute per bucket, then blocks until the window resets", () => {
    const key = `test-${Math.random()}`;
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(checkRateLimit("generation", key, 3, now).allowed).toBe(true);
    const blocked = checkRateLimit("generation", key, 3, now + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterS).toBeGreaterThan(0);
    // Another bucket for the same client is not affected.
    expect(checkRateLimit("geocoding", key, 3, now + 10).allowed).toBe(true);
    expect(checkRateLimit("generation", key, 3, now + 61_000).allowed).toBe(true);
  });
  it("supports weighted requests and has a message per bucket", () => {
    const key = `w-${Math.random()}`;
    expect(checkRateLimit("calculate", key, 5, 0, 3).allowed).toBe(true);
    expect(checkRateLimit("calculate", key, 5, 0, 3).allowed).toBe(false);
    expect(RATE_LIMIT_MESSAGES.geocoding).toMatch(/recherches/);
    expect(RATE_LIMIT_MESSAGES.generation).toMatch(/générations/);
  });
  it("derives a client key from forwarding headers", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientKeyFromHeaders(new Headers())).toBe("local");
  });
});

describe("AppError", () => {
  it("carries a user-friendly message and status", () => {
    const e = new AppError("NOT_ROUTABLE");
    expect(e.message).toBe(USER_MESSAGES.NOT_ROUTABLE);
    expect(e.status).toBe(422);
    expect(e.toJSON().error.code).toBe("NOT_ROUTABLE");
  });
  it("wraps unknown errors without leaking details", () => {
    const wrapped = toAppError(new Error("ECONNRESET at socket"));
    expect(wrapped.code).toBe("UNKNOWN");
    expect(wrapped.message).not.toContain("ECONNRESET");
    const timeout = toAppError(Object.assign(new Error("t"), { name: "TimeoutError" }));
    expect(timeout.code).toBe("PROVIDER_TIMEOUT");
  });
  it("classifies retryable (service) vs request failures", () => {
    expect(isRetryableError(new AppError("PROVIDER_TIMEOUT"))).toBe(true);
    expect(isRetryableError(new AppError("PROVIDER_UNAVAILABLE"))).toBe(true);
    expect(isRetryableError(new AppError("RATE_LIMITED"))).toBe(true);
    expect(isRetryableError(new AppError("NO_ROUTE"))).toBe(false);
    expect(isRetryableError(new AppError("NOT_ROUTABLE"))).toBe(false);
    expect(isRetryableError(new AppError("INVALID_REQUEST"))).toBe(false);
  });
});

describe("server env validation", () => {
  const base = { NODE_ENV: "development" };
  it("provides sane defaults with an empty environment", () => {
    const { env, errors } = parseServerEnv(base);
    expect(errors).toEqual([]);
    expect(env!.routing.provider).toBe("valhalla");
    expect(env!.geocoding.provider).toBe("photon");
    expect(env!.geocoding.fallback).toBe("nominatim");
    expect(env!.elevation.provider).toBe("open-meteo");
    expect(env!.elevation.fallback).toEqual(["valhalla"]);
    expect(env!.routing.candidateCount).toBe(12);
    expect(env!.limits.perMinute.generation).toBeGreaterThan(0);
    expect(env!.limits.perMinute.geocoding).toBeGreaterThan(env!.limits.perMinute.generation);
  });
  it("reports invalid values and missing keys explicitly", () => {
    expect(parseServerEnv({ ...base, ROUTING_TIMEOUT_MS: "abc" }).errors[0]).toMatch(/ROUTING_TIMEOUT_MS/);
    expect(parseServerEnv({ ...base, ROUTING_PROVIDER: "graphhopper" }).errors[0]).toMatch(/GRAPHHOPPER_API_KEY/);
    expect(parseServerEnv({ ...base, ROUTING_PROVIDER: "valhalla", ROUTING_PROVIDER_FALLBACK: "openrouteservice" }).errors[0]).toMatch(/OPENROUTESERVICE_API_KEY/);
    expect(parseServerEnv({ ...base, ROUTING_VALHALLA_URL: "not a url" }).errors[0]).toMatch(/ROUTING_VALHALLA_URL/);
    expect(parseServerEnv({ NODE_ENV: "production", ROUTING_PROVIDER: "mock" }).errors[0]).toMatch(/réservé aux tests/);
    expect(parseServerEnv({ NODE_ENV: "production", ROUTING_PROVIDER: "mock", ALLOW_MOCK_PROVIDERS: "true" }).errors).toEqual([]);
  });
  it("warns (without failing) about risky production settings", () => {
    const prod = parseServerEnv({ NODE_ENV: "production", ROUTING_PROVIDER: "osrm", ROUTING_OSRM_URL: "http://localhost:5000", DIAGNOSTICS_ENABLED: "true", GEOCODING_USER_AGENT: "my-app/1.0 (ops@example.com)" });
    expect(prod.errors).toEqual([]);
    expect(prod.env!.warnings.some((w) => w.includes("ROUTING_OSRM_URL") && w.includes("locale"))).toBe(true);
    expect(prod.env!.warnings.some((w) => w.includes("DIAGNOSTICS_ENABLED"))).toBe(true);
    expect(prod.env!.warnings.some((w) => w.includes("GEOCODING_USER_AGENT"))).toBe(false);
    // The public FOSSGIS instance and the default User-Agent are flagged in production only.
    const defaults = parseServerEnv({ NODE_ENV: "production" });
    expect(defaults.env!.warnings.some((w) => w.includes("FOSSGIS"))).toBe(true);
    expect(defaults.env!.warnings.some((w) => w.includes("GEOCODING_USER_AGENT"))).toBe(true);
    expect(parseServerEnv({ NODE_ENV: "development", ROUTING_PROVIDER: "osrm", ROUTING_OSRM_URL: "http://localhost:5000" }).env!.warnings).toEqual([]);
  });
  it("bounds the whole generation below the platform function limit", () => {
    expect(parseServerEnv(base).env!.routing.generationTimeoutMs).toBe(55_000);
    expect(parseServerEnv({ ...base, GENERATION_TIMEOUT_MS: "1000" }).errors[0]).toMatch(/GENERATION_TIMEOUT_MS/);
    const long = parseServerEnv({ NODE_ENV: "production", GENERATION_TIMEOUT_MS: "120000", GEOCODING_USER_AGENT: "my-app/1.0 (ops@example.com)" });
    expect(long.env!.warnings.some((w) => w.includes("GENERATION_TIMEOUT_MS"))).toBe(true);
    const http = parseServerEnv({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://circuit.example.com", GEOCODING_USER_AGENT: "my-app/1.0 (ops@example.com)" });
    expect(http.env!.warnings.some((w) => w.includes("NEXT_PUBLIC_SITE_URL"))).toBe(true);
  });
  it("honours primary/fallback routing and demo mode", () => {
    const { env } = parseServerEnv({ ...base, ROUTING_PROVIDER_PRIMARY: "osrm", ROUTING_OSRM_URL: "http://localhost:5000", ROUTING_PROVIDER_FALLBACK: "valhalla" });
    expect(env!.routing.provider).toBe("osrm");
    expect(env!.routing.fallback).toBe("valhalla");
    const demo = parseServerEnv({ NODE_ENV: "production", NEXT_PUBLIC_DEMO_MODE: "true" });
    expect(demo.errors).toEqual([]);
    expect(demo.env!.routing.provider).toBe("mock");
    expect(demo.env!.geocoding.provider).toBe("mock");
    expect(demo.env!.elevation.provider).toBe("mock");
  });
});

describe("logger", () => {
  it("redacts secrets in fields and query strings", () => {
    const out = redact({ apiKey: "abc", url: "https://x?key=SECRET&q=1", nested: { Authorization: "Bearer t" }, ok: 1 }) as Record<string, unknown>;
    expect(out.apiKey).toBe("[redacted]");
    expect(out.url).toBe("https://x?key=[redacted]&q=1");
    expect((out.nested as Record<string, unknown>).Authorization).toBe("[redacted]");
    expect(out.ok).toBe(1);
  });
  it("writes structured records with request id and timings", async () => {
    const sink = new MemorySink();
    const logger = createLogger({ sink, level: "debug" }).child({ requestId: "r1" });
    await logger.time("op", { provider: "valhalla" }, async () => 1);
    logger.debug("hidden?", { token: "x" });
    expect(sink.records[0]!.requestId).toBe("r1");
    expect(sink.records[0]!.provider).toBe("valhalla");
    expect(typeof sink.records[0]!.durationMs).toBe("number");
    expect(sink.records[1]!.token).toBe("[redacted]");
  });
});

describe("createThrottle", () => {
  it("serialises calls with a minimum interval", async () => {
    const throttle = createThrottle(30);
    const stamps: number[] = [];
    await Promise.all([1, 2, 3].map(() => throttle(async () => stamps.push(Date.now()))));
    expect(stamps[2]! - stamps[0]!).toBeGreaterThanOrEqual(55);
  });
});
