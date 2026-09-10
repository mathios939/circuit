import { NextResponse } from "next/server";
import { getGeocodingProvider, type GeocodeResult } from "@/lib/geocoding";
import { enforceRateLimit, errorResponse, parseSearchParams } from "@/lib/server/api";
import { getGlobalCache, memoizeAsync } from "@/lib/server/cache";
import { reverseQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = getGlobalCache<GeocodeResult | null>("reverse-geocode", 2000, 6 * 60 * 60 * 1000);
const memo = memoizeAsync(cache);

/** GET /api/geocode/reverse?lat=..&lng=.. — name of a position clicked on the map. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    enforceRateLimit(request);
    const { lat, lng } = parseSearchParams(request, reverseQuerySchema);
    const provider = getGeocodingProvider();
    const key = `${provider.id}|${lat.toFixed(4)},${lng.toFixed(4)}`;
    const result = await memo(key, async () => (await provider.reverse({ lat, lng }, { lang: "fr" })) ?? null);
    return NextResponse.json({ result }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return errorResponse(e);
  }
}
