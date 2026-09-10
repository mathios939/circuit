import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { createRequestContext, enforceRateLimit, errorResponse, jsonResponse } from "@/lib/server/api";
import { describeConfiguration, runDiagnostics } from "@/lib/server/diagnostics";
import { getServerEnv } from "@/lib/server/env";
import { version } from "../../../../package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/health — liveness check. Always public, never sensitive:
 *   { status: "ok", version, time, providers: { routing, geocoding, elevation } }
 *
 * The detailed configuration summary (limits, fallbacks, key presence,
 * configuration warnings) and the provider probes (`?probe=1`) are only
 * returned when diagnostics are enabled (development by default, or
 * DIAGNOSTICS_ENABLED=true), and probes are rate limited.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const ctx = createRequestContext(request, "health");
  try {
    let env;
    try {
      env = getServerEnv();
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError("NOT_CONFIGURED");
      return NextResponse.json({ status: "misconfigured", message: err.message }, { status: 500, headers: { "x-request-id": ctx.requestId, "Cache-Control": "no-store" } });
    }
    const diagnostics = env.observability.diagnosticsEnabled;
    const probe = new URL(request.url).searchParams.get("probe") === "1";
    const base = {
      status: "ok" as const,
      version,
      time: new Date().toISOString(),
      providers: { routing: env.routing.provider, geocoding: env.geocoding.provider, elevation: env.elevation.provider },
      ...(diagnostics ? { configuration: describeConfiguration() } : {}),
    };
    if (!probe) return jsonResponse(base, ctx);
    if (!diagnostics) {
      throw new AppError("INVALID_REQUEST", "Les diagnostics sont désactivés (DIAGNOSTICS_ENABLED=false).", { status: 403 });
    }
    enforceRateLimit(request, "diagnostics");
    const probes = await runDiagnostics();
    const degraded = probes.some((p) => p.role === "primary" && p.status === "error");
    return jsonResponse({ ...base, status: degraded ? "degraded" : "ok", probes }, ctx);
  } catch (e) {
    return errorResponse(e, ctx);
  }
}
