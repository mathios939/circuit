import type { RoutePoint, RouteWaypoint } from "@/lib/types";

export interface GpxBuildOptions {
  name: string;
  description?: string;
  /** Activity label written in the track type (Garmin / Strava read it). */
  activityType?: string;
  points: readonly RoutePoint[];
  /** Optional waypoints written as <wpt> (start / finish / vias). */
  waypoints?: readonly RouteWaypoint[];
  /** ISO timestamp of creation. */
  time?: string;
  /** Creator string in the <gpx> root. */
  creator?: string;
  /** Link back to the route (share URL). */
  link?: string;
  /** Extra keywords for the metadata block. */
  keywords?: string;
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const fmtCoord = (n: number): string => n.toFixed(6);
const fmtEle = (n: number): string => n.toFixed(1);

/**
 * Builds a GPX 1.1 document with a single track (the format best supported by
 * Garmin, Wahoo, Hammerhead, Strava and Komoot). Coordinates are rounded to
 * 6 decimals (~10 cm), elevation to 0.1 m. Output is deterministic.
 */
export function buildGpx(options: GpxBuildOptions): string {
  const name = escapeXml(options.name);
  const creator = escapeXml(options.creator ?? "Circuit - https://github.com/mathios939/circuit");
  const time = options.time ?? new Date().toISOString();
  const bounds = computeBounds(options.points);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<gpx version="1.1" creator="${creator}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`,
  );
  lines.push("  <metadata>");
  lines.push(`    <name>${name}</name>`);
  if (options.description) lines.push(`    <desc>${escapeXml(options.description)}</desc>`);
  if (options.link) lines.push(`    <link href="${escapeXml(options.link)}"><text>${name}</text></link>`);
  lines.push(`    <time>${escapeXml(time)}</time>`);
  if (options.keywords) lines.push(`    <keywords>${escapeXml(options.keywords)}</keywords>`);
  if (bounds) {
    lines.push(
      `    <bounds minlat="${fmtCoord(bounds.minlat)}" minlon="${fmtCoord(bounds.minlon)}" maxlat="${fmtCoord(bounds.maxlat)}" maxlon="${fmtCoord(bounds.maxlon)}"/>`,
    );
  }
  lines.push("  </metadata>");

  for (const wp of options.waypoints ?? []) {
    lines.push(`  <wpt lat="${fmtCoord(wp.lat)}" lon="${fmtCoord(wp.lng)}">`);
    lines.push(`    <name>${escapeXml(wp.name ?? waypointLabel(wp.kind))}</name>`);
    lines.push(`    <sym>${wp.kind === "start" ? "Flag, Green" : wp.kind === "end" ? "Flag, Red" : "Waypoint"}</sym>`);
    lines.push("  </wpt>");
  }

  lines.push("  <trk>");
  lines.push(`    <name>${name}</name>`);
  if (options.description) lines.push(`    <desc>${escapeXml(options.description)}</desc>`);
  if (options.activityType) lines.push(`    <type>${escapeXml(options.activityType)}</type>`);
  lines.push("    <trkseg>");
  for (const p of options.points) {
    if (typeof p.ele === "number" && Number.isFinite(p.ele)) {
      lines.push(`      <trkpt lat="${fmtCoord(p.lat)}" lon="${fmtCoord(p.lng)}"><ele>${fmtEle(p.ele)}</ele></trkpt>`);
    } else {
      lines.push(`      <trkpt lat="${fmtCoord(p.lat)}" lon="${fmtCoord(p.lng)}"/>`);
    }
  }
  lines.push("    </trkseg>");
  lines.push("  </trk>");
  lines.push("</gpx>");
  return lines.join("\n") + "\n";
}

function computeBounds(points: readonly RoutePoint[]) {
  if (points.length === 0) return null;
  let minlat = Infinity;
  let minlon = Infinity;
  let maxlat = -Infinity;
  let maxlon = -Infinity;
  for (const p of points) {
    if (p.lat < minlat) minlat = p.lat;
    if (p.lat > maxlat) maxlat = p.lat;
    if (p.lng < minlon) minlon = p.lng;
    if (p.lng > maxlon) maxlon = p.lng;
  }
  return { minlat, minlon, maxlat, maxlon };
}

function waypointLabel(kind: RouteWaypoint["kind"]): string {
  return kind === "start" ? "Départ" : kind === "end" ? "Arrivée" : "Point de passage";
}
