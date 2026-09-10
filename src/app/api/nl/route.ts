import { NextResponse } from "next/server";
import { getIntentParser } from "@/lib/nl/parser";
import { enforceRateLimit, errorResponse, parseJsonBody } from "@/lib/server/api";
import { nlRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/nl — turns a natural-language request into structured route parameters. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    enforceRateLimit(request);
    const { text } = await parseJsonBody(request, nlRequestSchema);
    const intent = await getIntentParser().parse(text);
    return NextResponse.json({ intent });
  } catch (e) {
    return errorResponse(e);
  }
}
