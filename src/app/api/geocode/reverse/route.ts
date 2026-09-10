import { NextResponse } from "next/server";
import { geocodingError, getGeocodingProvider, type GeocodeResult } from "@/lib/geocoding";
import { createRequestContext, enforceRateLimit, errorResponse, jsonResponse, parseSearchParams } from "@/lib/server/api";
import { getGlobalCache, memoizeAsync } from "@/lib/server/cache";
import { reverseQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reverse results are cached 6 h, keyed on the position rounded to ~10 m. */
const cache = getGlobalCache<GeocodeResult | null>("reverse-geocode", 2000, 6 * 60 * 60 * 1000);
const memo = memoizeAsync(cache);

/** GET /api/geocode/reverse?lat=..&lng=.. — name of a position clicked on the map. */
export async function GET(request: Request): Promise<NextResponse> {
  const ctx = createRequestContext(request, "geocode/reverse");
  try {
    enforceRateLimit(request, "geocoding");
    const { lat, lng } = parseSearchParams(request, reverseQuerySchema);
    const provider = getGeocodingProvider();
    const key = `${provider.id}|${lat.toFixed(4)},${lng.toFixed(4)}`;
    const result = await ctx.logger.time("reverse-geocode", { provider: provider.id }, () => memo(key, async () => (await provider.reverse({ lat, lng }, { lang: "fr" })) ?? null));
    return jsonResponse({ result }, ctx, { cacheControl: "private, max-age=300" });
  } catch (e) {
    return errorResponse(geocodingError(e), ctx);
  }
}
