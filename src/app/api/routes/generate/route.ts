import { NextResponse } from "next/server";
import { getElevationProvider } from "@/lib/elevation";
import { getRoutingProvider } from "@/lib/routing";
import { generateRoutes } from "@/lib/route-generator";
import { enforceRateLimit, errorResponse, parseJsonBody } from "@/lib/server/api";
import { getServerEnv } from "@/lib/server/env";
import { routeRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/routes/generate — generates up to three route proposals. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Generation is expensive upstream: it counts for several requests.
    enforceRateLimit(request, 5);
    const body = await parseJsonBody(request, routeRequestSchema);
    const env = getServerEnv();
    const result = await generateRoutes(body, {
      routing: getRoutingProvider(),
      elevation: getElevationProvider(),
      concurrency: env.routing.concurrency,
      elevationSamples: env.elevation.samplePoints,
      signal: AbortSignal.timeout(env.routing.timeoutMs * 4),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
