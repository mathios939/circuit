import type { GenerationProgress, RouteGenerationResult, RoutePreferences, RouteRequest, RouteResult, RouteStyle, RouteWaypoint } from "@/lib/types";
import type { GeocodeResult } from "@/lib/geocoding/provider";
import type { RouteIntent } from "@/lib/nl/parser";
import { USER_HINTS, USER_MESSAGES, type AppErrorCode } from "@/lib/errors";

/** Error surfaced to the UI: always carries a user-friendly French message. */
export class ApiError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("PROVIDER_UNAVAILABLE", "Impossible de joindre le serveur. Vérifiez votre connexion.", 0);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: AppErrorCode; message?: string } } | null)?.error;
    const code = err?.code ?? "UNKNOWN";
    throw new ApiError(code, err?.message ?? USER_MESSAGES[code] ?? USER_MESSAGES.UNKNOWN, res.status);
  }
  return json as T;
}

/**
 * Generation is streamed as NDJSON events (progress…, then result | error) so
 * that the UI can show the real stage instead of a blind spinner.
 */
export async function generateRoutesApi(body: RouteRequest, options: { signal?: AbortSignal; onProgress?(p: GenerationProgress): void } = {}): Promise<RouteGenerationResult> {
  let res: Response;
  try {
    res = await fetch("/api/routes/generate", {
      method: "POST",
      headers: { Accept: "application/x-ndjson, application/json", "Content-Type": "application/json" },
      body: JSON.stringify(stripUndefined(body)),
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("PROVIDER_UNAVAILABLE", "Impossible de joindre le serveur. Vérifiez votre connexion.", 0);
  }
  if (!res.ok) {
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* no body */
    }
    const err = (json as { error?: { code?: AppErrorCode; message?: string } } | null)?.error;
    const code = err?.code ?? "UNKNOWN";
    throw new ApiError(code, err?.message ?? USER_MESSAGES[code] ?? USER_MESSAGES.UNKNOWN, res.status);
  }
  if (!res.body) throw new ApiError("UNKNOWN", USER_MESSAGES.UNKNOWN, res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: RouteGenerationResult | undefined;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as { type: string; progress?: GenerationProgress; result?: RouteGenerationResult; error?: { code: AppErrorCode; message: string } };
    if (event.type === "progress" && event.progress) options.onProgress?.(event.progress);
    else if (event.type === "result" && event.result) result = event.result;
    else if (event.type === "error" && event.error) throw new ApiError(event.error.code, event.error.message, 200);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) handle(buffer);
  if (!result) throw new ApiError("PROVIDER_UNAVAILABLE", "Le serveur a interrompu la génération. Réessayez.", 0);
  return result;
}

export interface CalculateBody {
  activity: RouteRequest["activity"];
  style?: RouteStyle;
  waypoints: RouteWaypoint[];
  preferences?: RoutePreferences;
  name?: string;
  request?: RouteRequest;
}

export async function calculateRouteApi(body: CalculateBody, signal?: AbortSignal): Promise<RouteResult> {
  const { route } = await request<{ route: RouteResult }>("/api/routes/calculate", { method: "POST", body: JSON.stringify(stripUndefined(body)), signal });
  return route;
}

export async function geocodeApi(q: string, options: { near?: { lat: number; lng: number }; signal?: AbortSignal } = {}): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q });
  if (options.near) {
    params.set("lat", options.near.lat.toFixed(3));
    params.set("lng", options.near.lng.toFixed(3));
  }
  const { results } = await request<{ results: GeocodeResult[] }>(`/api/geocode?${params.toString()}`, { signal: options.signal });
  return results;
}

export async function reverseGeocodeApi(lat: number, lng: number, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const { result } = await request<{ result: GeocodeResult | null }>(`/api/geocode/reverse?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`, { signal });
  return result;
}

export async function parseNaturalLanguageApi(text: string, signal?: AbortSignal): Promise<RouteIntent> {
  const { intent } = await request<{ intent: RouteIntent }>("/api/nl", { method: "POST", body: JSON.stringify({ text }), signal });
  return intent;
}

/** Removes undefined fields so that strict server schemas do not reject them. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof DOMException && e.name === "AbortError") return "Requête annulée.";
  return USER_MESSAGES.UNKNOWN;
}

/** Actionable hint matching the error, when one exists. */
export function errorHint(e: unknown): string | null {
  if (e instanceof ApiError) return USER_HINTS[e.code] ?? null;
  if (e instanceof DOMException && e.name === "AbortError") return null;
  return USER_HINTS.UNKNOWN ?? null;
}
