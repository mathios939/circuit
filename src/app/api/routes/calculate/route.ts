import { NextResponse } from "next/server";
import { getElevationProvider } from "@/lib/elevation";
import { getRoutingProvider } from "@/lib/routing";
import { recalculateRoute } from "@/lib/route-generator";
import { enforceRateLimit, errorResponse, parseJsonBody } from "@/lib/server/api";
import { getServerEnv } from "@/lib/server/env";
import { shortId } from "@/lib/utils/id";
import { calculateRequestSchema } from "@/lib/validation/schemas";
import type { RouteRequest, RouteWaypoint } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/routes/calculate — routes through explicit waypoints (editor / recalculation). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    enforceRateLimit(request, 2);
    const body = await parseJsonBody(request, calculateRequestSchema);
    const env = getServerEnv();

    const waypoints: RouteWaypoint[] = body.waypoints.map((w, i) => ({
      id: w.id ?? shortId(6),
      lat: w.lat,
      lng: w.lng,
      name: w.name,
      kind: w.kind ?? (i === 0 ? "start" : i === body.waypoints.length - 1 ? "end" : "via"),
    }));
    const first = waypoints[0]!;
    const last = waypoints[waypoints.length - 1]!;
    const isLoop = Math.abs(first.lat - last.lat) < 1e-5 && Math.abs(first.lng - last.lng) < 1e-5;

    const routeRequest: RouteRequest = body.request ?? {
      mode: isLoop ? "loop" : "point_to_point",
      activity: body.activity,
      start: { lat: first.lat, lng: first.lng, name: first.name ?? "Départ" },
      end: isLoop ? undefined : { lat: last.lat, lng: last.lng, name: last.name ?? "Arrivée" },
      preferences: body.preferences,
    };

    const route = await recalculateRoute(
      { request: { ...routeRequest, activity: body.activity, preferences: body.preferences ?? routeRequest.preferences }, style: body.style ?? "balanced", waypoints, name: body.name },
      {
        routing: getRoutingProvider(),
        elevation: getElevationProvider(),
        concurrency: env.routing.concurrency,
        elevationSamples: env.elevation.samplePoints,
        signal: AbortSignal.timeout(env.routing.timeoutMs * 2),
      },
    );
    return NextResponse.json({ route }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
