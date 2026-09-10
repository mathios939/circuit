import { NextResponse } from "next/server";
import { getGeocodingProvider, type GeocodeResult } from "@/lib/geocoding";
import { enforceRateLimit, errorResponse, parseSearchParams } from "@/lib/server/api";
import { getGlobalCache, memoizeAsync } from "@/lib/server/cache";
import { geocodeQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = getGlobalCache<GeocodeResult[]>("geocode", 2000, 6 * 60 * 60 * 1000);
const memo = memoizeAsync(cache);

/** GET /api/geocode?q=Annecy[&limit=6][&lat=..&lng=..] — place search with suggestions. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    enforceRateLimit(request);
    const params = parseSearchParams(request, geocodeQuerySchema);
    const provider = getGeocodingProvider();
    const near = params.lat !== undefined && params.lng !== undefined ? { lat: Math.round(params.lat * 10) / 10, lng: Math.round(params.lng * 10) / 10 } : undefined;
    const key = `${provider.id}|${params.q.toLowerCase()}|${params.limit ?? 6}|${near ? `${near.lat},${near.lng}` : ""}`;
    const results = await memo(key, () => provider.search(params.q, { limit: params.limit ?? 6, near, lang: "fr" }));
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return errorResponse(e);
  }
}
