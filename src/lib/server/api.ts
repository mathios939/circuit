import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { AppError, toAppError } from "@/lib/errors";
import { getServerEnv } from "./env";
import { createLogger, getRootLogger, newRequestId, setRootLogger, type Logger } from "./logger";
import { checkRateLimit, clientKeyFromHeaders, RATE_LIMIT_MESSAGES, type RateLimitBucket } from "./rate-limit";

/** Per-request context: identifier and logger carrying it. */
export interface RequestContext {
  requestId: string;
  logger: Logger;
  startedAt: number;
}

let configured = false;

/** Root logger configured from the environment (once per process). */
export function getServerLogger(): Logger {
  if (!configured) {
    try {
      const env = getServerEnv();
      setRootLogger(createLogger({ level: env.nodeEnv === "test" ? "silent" : env.observability.logLevel, format: env.observability.logFormat }));
      for (const warning of env.warnings) getRootLogger().warn("configuration warning", { warning });
    } catch {
      /* configuration errors are reported by the route itself */
    }
    configured = true;
  }
  return getRootLogger();
}

export function createRequestContext(request: Request, route: string): RequestContext {
  const requestId = request.headers.get("x-request-id")?.slice(0, 64) ?? newRequestId();
  return { requestId, logger: getServerLogger().child({ requestId, route }), startedAt: performance.now() };
}

/** JSON error response built from an AppError (never leaks stack traces). */
export function errorResponse(error: unknown, ctx?: RequestContext): NextResponse {
  const appError = toAppError(error);
  const logger = ctx?.logger ?? getServerLogger();
  const fields = { code: appError.code, status: appError.status, details: appError.details, durationMs: ctx ? Math.round(performance.now() - ctx.startedAt) : undefined };
  if (appError.code === "UNKNOWN" || appError.code === "NOT_CONFIGURED") logger.error("request failed", { ...fields, error: appError.cause ?? appError });
  else logger.info("request rejected", fields);
  const body = appError.toJSON();
  if (process.env.NODE_ENV === "production" && appError.code !== "NOT_CONFIGURED") delete body.error.details;
  return NextResponse.json(body, { status: appError.status, headers: ctx ? { "x-request-id": ctx.requestId } : undefined });
}

/** Applies the per-IP rate limit of a bucket; throws RATE_LIMITED with a bucket-specific message. */
export function enforceRateLimit(request: Request, bucket: RateLimitBucket, weight = 1): void {
  const limit = getServerEnv().limits.perMinute[bucket];
  const key = clientKeyFromHeaders(request.headers);
  const result = checkRateLimit(bucket, key, limit, Date.now(), weight);
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", RATE_LIMIT_MESSAGES[bucket], { details: `${bucket}: retry after ${result.retryAfterS}s (limit ${result.limit}/min)` });
  }
}

/** Parses and validates a JSON body; throws INVALID_REQUEST with a readable message. */
export async function parseJsonBody<T>(request: Request, schema: ZodType<T>, maxBytes = 512 * 1024): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new AppError("INVALID_REQUEST", "Requête trop volumineuse.");
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new AppError("INVALID_REQUEST", "Corps de requête JSON invalide.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.map(String).join(".") ?? "";
    throw new AppError("INVALID_REQUEST", first ? `${path ? path + " : " : ""}${first.message}` : undefined, {
      details: parsed.error.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join("; "),
    });
  }
  return parsed.data;
}

/** Validates URL search params against a schema. */
export function parseSearchParams<T>(request: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AppError("INVALID_REQUEST", first ? `${first.path.map(String).join(".")} : ${first.message}` : undefined);
  }
  return parsed.data;
}

/** JSON success response carrying the request id. */
export function jsonResponse(body: unknown, ctx: RequestContext, init: { status?: number; cacheControl?: string } = {}): NextResponse {
  ctx.logger.info("request completed", { status: init.status ?? 200, durationMs: Math.round(performance.now() - ctx.startedAt) });
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { "x-request-id": ctx.requestId, "Cache-Control": init.cacheControl ?? "no-store" },
  });
}
