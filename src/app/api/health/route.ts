import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { createRequestContext, enforceRateLimit, errorResponse, jsonResponse } from "@/lib/server/api";
import { describeConfiguration, runDiagnostics } from "@/lib/server/diagnostics";
import { getServerEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — application status and configuration summary (no secret).
 * GET /api/health?probe=1 — additionally calls every configured provider
 * with a tiny request and reports latency / errors. Probes are only allowed
 * when diagnostics are enabled (development by default, or
 * DIAGNOSTICS_ENABLED=true) and are rate limited.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const ctx = createRequestContext(request, "health");
  try {
    let env;
    try {
      env = getServerEnv();
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError("NOT_CONFIGURED");
      return NextResponse.json({ status: "misconfigured", message: err.message }, { status: 500, headers: { "x-request-id": ctx.requestId } });
    }
    const probe = new URL(request.url).searchParams.get("probe") === "1";
    const base = { status: "ok" as const, version: process.env.npm_package_version ?? "0.1.0", time: new Date().toISOString(), configuration: describeConfiguration() };
    if (!probe) return jsonResponse(base, ctx);
    if (!env.observability.diagnosticsEnabled) {
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
