import type { GenerationProgress, RouteGenerationResult } from "@/lib/types";
import { toAppError } from "@/lib/errors";
import { getElevationProvider } from "@/lib/elevation";
import { getRoutingProvider } from "@/lib/routing";
import { generateRoutes } from "@/lib/route-generator";
import { createRequestContext, enforceRateLimit, errorResponse, parseJsonBody } from "@/lib/server/api";
import { getServerEnv } from "@/lib/server/env";
import { routeRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Events streamed to the client as newline-delimited JSON. */
export type GenerateStreamEvent =
  | { type: "progress"; progress: GenerationProgress }
  | { type: "result"; result: RouteGenerationResult }
  | { type: "error"; error: { code: string; message: string } };

/**
 * POST /api/routes/generate — generates up to three route proposals.
 *
 * The response is a stream of NDJSON events (`progress` … then `result` or
 * `error`) so that the client can show the real stage of the generation
 * (candidates → routing → elevation → scoring) instead of a blind spinner.
 * Validation and rate-limit failures are returned as ordinary JSON errors
 * before the stream starts.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = createRequestContext(request, "routes/generate");
  let body;
  let env;
  try {
    enforceRateLimit(request, "generation");
    body = await parseJsonBody(request, routeRequestSchema);
    env = getServerEnv();
  } catch (e) {
    return errorResponse(e, ctx);
  }

  const routing = getRoutingProvider();
  const elevation = getElevationProvider();
  const encoder = new TextEncoder();
  const logger = ctx.logger.child({ routeMode: body.mode, activity: body.activity, provider: routing.id });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: GenerateStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const result = await generateRoutes(body, {
          routing,
          elevation,
          concurrency: env.routing.concurrency,
          elevationSamples: env.elevation.samplePoints,
          candidateCount: env.routing.candidateCount,
          maxIterations: env.routing.maxIterations,
          maxRoutingCalls: env.routing.maxRoutingCalls,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(env.routing.timeoutMs * 6)]),
          onProgress: (progress) => send({ type: "progress", progress }),
        });
        logger.info("generation completed", {
          routes: result.routes.length,
          routingCalls: result.routingCalls,
          candidates: result.candidatesEvaluated,
          timings: result.timings,
          durationMs: Math.round(performance.now() - ctx.startedAt),
          status: "ok",
        });
        send({ type: "result", result });
      } catch (e) {
        const error = toAppError(e);
        logger.warn("generation failed", { code: error.code, details: error.details, durationMs: Math.round(performance.now() - ctx.startedAt), status: "error", error: error.cause });
        send({ type: "error", error: { code: error.code, message: error.message } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "x-request-id": ctx.requestId,
    },
  });
}
