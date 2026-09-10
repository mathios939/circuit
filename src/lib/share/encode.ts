import type { ActivityType, RouteMode, RoutePoint } from "@/lib/types";
import { ACTIVITY_TYPES } from "@/lib/types";
import { decodePolyline, encodePolyline, simplifyPath, toRoutePoints } from "@/lib/geo";

/**
 * Compact, URL-safe representation of a route so that share links work
 * without a server-side store. The geometry is simplified (≤ MAX_POINTS) and
 * elevations are rounded to the metre. When a server store is introduced,
 * `/route/[id]` can resolve ids there first and fall back to this encoding.
 */
export interface SharedRoutePayload {
  name: string;
  activity: ActivityType;
  mode: RouteMode;
  points: RoutePoint[];
}

const MAX_POINTS = 600;
const VERSION = "1";

export function encodeSharedRoute(payload: SharedRoutePayload): string {
  let tolerance = 5;
  let pts = simplifyPath(payload.points, tolerance);
  while (pts.length > MAX_POINTS && tolerance < 200) {
    tolerance *= 1.6;
    pts = simplifyPath(payload.points, tolerance);
  }
  const hasEle = pts.every((p) => typeof p.ele === "number");
  const data = {
    v: VERSION,
    n: payload.name.slice(0, 80),
    a: payload.activity,
    m: payload.mode,
    p: encodePolyline(pts, 5),
    e: hasEle ? encodeInts(pts.map((p) => Math.round(p.ele!))) : undefined,
  };
  return toBase64Url(JSON.stringify(data));
}

export function decodeSharedRoute(encoded: string): SharedRoutePayload | null {
  try {
    const json = fromBase64Url(encoded);
    const data = JSON.parse(json) as Record<string, unknown>;
    if (data.v !== VERSION || typeof data.p !== "string") return null;
    const activity = ACTIVITY_TYPES.includes(data.a as ActivityType) ? (data.a as ActivityType) : "walking";
    const mode: RouteMode = data.m === "point_to_point" ? "point_to_point" : "loop";
    const coords = decodePolyline(data.p, 5);
    if (coords.length < 2) return null;
    const eles = typeof data.e === "string" ? decodeInts(data.e) : [];
    const withEle = coords.map((c, i) => (eles.length === coords.length ? { ...c, ele: eles[i] } : c));
    return {
      name: typeof data.n === "string" ? data.n : "Parcours partagé",
      activity,
      mode,
      points: toRoutePoints(withEle),
    };
  } catch {
    return null;
  }
}

/** Delta + zigzag + base-32 varint encoding of integers (same scheme as polylines). */
export function encodeInts(values: readonly number[]): string {
  let out = "";
  let prev = 0;
  for (const v of values) {
    let n = v - prev;
    prev = v;
    n = n < 0 ? ~(n << 1) : n << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  }
  return out;
}

export function decodeInts(encoded: string): number[] {
  const out: number[] = [];
  let index = 0;
  let value = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    value += result & 1 ? ~(result >> 1) : result >> 1;
    out.push(value);
  }
  return out;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const binary = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
