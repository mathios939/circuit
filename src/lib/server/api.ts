import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { AppError, toAppError } from "@/lib/errors";
import { getServerEnv } from "./env";
import { checkRateLimit, clientKeyFromHeaders } from "./rate-limit";

/** JSON error response built from an AppError (never leaks stack traces). */
export function errorResponse(error: unknown): NextResponse {
  const appError = toAppError(error);
  if (appError.code === "UNKNOWN" && process.env.NODE_ENV !== "test") {
    console.error("[api] unexpected error", appError.cause ?? appError);
  }
  const body = appError.toJSON();
  if (process.env.NODE_ENV === "production") delete body.error.details;
  return NextResponse.json(body, { status: appError.status });
}

/** Applies the per-IP rate limit; throws RATE_LIMITED when exceeded. */
export function enforceRateLimit(request: Request, weight = 1): void {
  const limit = getServerEnv().limits.rateLimitPerMinute;
  const key = clientKeyFromHeaders(request.headers);
  let result = checkRateLimit(key, limit);
  for (let i = 1; i < weight; i++) result = checkRateLimit(key, limit);
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", undefined, { details: `retry after ${result.retryAfterS}s` });
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
