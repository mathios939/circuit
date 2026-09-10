import { XMLParser } from "fast-xml-parser";
import type { LatLng, RoutePoint, RouteWaypoint } from "@/lib/types";
import { AppError } from "@/lib/errors";
import { isValidLatLng, toRoutePoints } from "@/lib/geo";
import { shortId } from "@/lib/utils/id";

export interface ParsedGpx {
  name?: string;
  description?: string;
  points: RoutePoint[];
  waypoints: RouteWaypoint[];
  hasElevation: boolean;
}

export interface ParseGpxOptions {
  /** Maximum accepted size in bytes (defence against huge uploads). */
  maxBytes?: number;
  /** Maximum number of track points kept (the rest is skipped evenly). */
  maxPoints?: number;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_POINTS = 20_000;

/**
 * Parses a GPX 1.0 / 1.1 document into route points. Tracks are preferred;
 * routes (<rte>) are used as a fallback. Entities and DTDs are never
 * processed and nothing from the file is ever executed or interpreted as
 * markup.
 */
export function parseGpx(xml: string, options: ParseGpxOptions = {}): ParsedGpx {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (byteLength(xml) > maxBytes) throw new AppError("GPX_TOO_LARGE");
  if (!/<gpx[\s>]/i.test(xml)) throw new AppError("GPX_INVALID");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
    allowBooleanAttributes: true,
    parseTagValue: false,
    parseAttributeValue: false,
    removeNSPrefix: true,
    isArray: (name) => ["trk", "trkseg", "trkpt", "rte", "rtept", "wpt"].includes(name),
  });

  // DOCTYPE declarations (and any entity definitions) are dropped before parsing.
  const sanitised = xml.replace(/<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?>/gi, "");

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(sanitised) as Record<string, unknown>;
  } catch {
    throw new AppError("GPX_INVALID");
  }
  const gpx = doc.gpx as Record<string, unknown> | undefined;
  if (!gpx || typeof gpx !== "object") throw new AppError("GPX_INVALID");

  const metadata = gpx.metadata as Record<string, unknown> | undefined;
  let name = text(metadata?.name);
  let description = text(metadata?.desc);

  let coords: (LatLng & { ele?: number })[] = [];
  const tracks = (gpx.trk as Record<string, unknown>[] | undefined) ?? [];
  for (const trk of tracks) {
    name ??= text(trk.name);
    description ??= text(trk.desc);
    const segs = (trk.trkseg as Record<string, unknown>[] | undefined) ?? [];
    for (const seg of segs) {
      for (const pt of (seg.trkpt as Record<string, unknown>[] | undefined) ?? []) {
        const c = readPoint(pt);
        if (c) coords.push(c);
      }
    }
  }
  if (coords.length < 2) {
    const routes = (gpx.rte as Record<string, unknown>[] | undefined) ?? [];
    for (const rte of routes) {
      name ??= text(rte.name);
      for (const pt of (rte.rtept as Record<string, unknown>[] | undefined) ?? []) {
        const c = readPoint(pt);
        if (c) coords.push(c);
      }
    }
  }
  if (coords.length < 2) throw new AppError("GPX_INVALID");

  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  if (coords.length > maxPoints) {
    const step = coords.length / maxPoints;
    const reduced: typeof coords = [];
    for (let i = 0; i < coords.length; i += step) reduced.push(coords[Math.floor(i)]!);
    if (reduced[reduced.length - 1] !== coords[coords.length - 1]) reduced.push(coords[coords.length - 1]!);
    coords = reduced;
  }

  const waypoints: RouteWaypoint[] = [];
  for (const wpt of (gpx.wpt as Record<string, unknown>[] | undefined) ?? []) {
    const c = readPoint(wpt);
    if (c) waypoints.push({ id: shortId(6), kind: "via", lat: c.lat, lng: c.lng, name: text(wpt.name) });
  }

  const points = toRoutePoints(coords);
  const withEle = points.filter((p) => typeof p.ele === "number").length;
  return {
    name: name?.slice(0, 120),
    description: description?.slice(0, 500),
    points,
    waypoints,
    hasElevation: withEle >= points.length * 0.9,
  };
}

function readPoint(pt: Record<string, unknown>): (LatLng & { ele?: number }) | null {
  const lat = Number(pt["@_lat"]);
  const lng = Number(pt["@_lon"]);
  const candidate = { lat, lng };
  if (!isValidLatLng(candidate)) return null;
  const eleRaw = text(pt.ele);
  const ele = eleRaw !== undefined ? Number(eleRaw) : NaN;
  return Number.isFinite(ele) ? { ...candidate, ele } : candidate;
}

/** Decodes the five predefined XML entities (the parser never expands anything else). */
function decodeEntities(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (m, name: string) => {
    switch (name) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default: {
        const code = name.startsWith("#x") ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : m;
      }
    }
  });
}

function text(value: unknown): string | undefined {
  if (typeof value === "string") {
    const t = decodeEntities(value.trim());
    return t.length > 0 ? t : undefined;
  }
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return text((value as Record<string, unknown>)["#text"]);
  return undefined;
}

function byteLength(s: string): number {
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s).length : s.length;
}
