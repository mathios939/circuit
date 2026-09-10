import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — configuration summary (no secrets). */
export async function GET(): Promise<NextResponse> {
  const env = getServerEnv();
  return NextResponse.json({
    status: "ok",
    providers: {
      routing: env.routing.provider,
      geocoding: env.geocoding.provider,
      elevation: env.elevation.provider,
    },
  });
}
