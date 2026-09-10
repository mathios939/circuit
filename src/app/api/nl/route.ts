import { NextResponse } from "next/server";
import { getIntentParser } from "@/lib/nl/parser";
import { createRequestContext, enforceRateLimit, errorResponse, jsonResponse, parseJsonBody } from "@/lib/server/api";
import { nlRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/nl — turns a natural-language request into structured route parameters. */
export async function POST(request: Request): Promise<NextResponse> {
  const ctx = createRequestContext(request, "nl");
  try {
    enforceRateLimit(request, "import");
    const { text } = await parseJsonBody(request, nlRequestSchema);
    const intent = await getIntentParser().parse(text);
    return jsonResponse({ intent }, ctx);
  } catch (e) {
    return errorResponse(e, ctx);
  }
}
