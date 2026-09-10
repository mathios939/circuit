import type { RouteResult } from "@/lib/types";
import { ACTIVITY_LABELS, ACTIVITY_SLUGS } from "@/lib/activities/profiles";
import { buildGpx } from "@/lib/gpx/build";
import { slugify } from "@/lib/utils/id";
import { formatDistance, formatElevation } from "@/lib/utils/format";

export interface ExportedFile {
  fileName: string;
  mimeType: string;
  content: string;
}

export interface RouteExporter {
  /** Format identifier and file extension. */
  readonly format: string;
  readonly label: string;
  readonly mimeType: string;
  export(route: RouteResult, options?: { link?: string }): ExportedFile;
}

/** e.g. "annecy-vtt-35km" */
export function routeFileStem(route: RouteResult): string {
  const place = route.request?.start.name ?? route.name;
  const km = Math.round(route.stats.distanceM / 1000);
  return `${slugify(place, 30)}-${ACTIVITY_SLUGS[route.activity]}-${km}km`;
}

export const gpxExporter: RouteExporter = {
  format: "gpx",
  label: "GPX",
  mimeType: "application/gpx+xml",
  export(route, options) {
    const description = `${ACTIVITY_LABELS[route.activity]} · ${formatDistance(route.stats.distanceM)} · ${formatElevation(route.stats.ascentM, "+")}`;
    const content = buildGpx({
      name: route.name,
      description,
      activityType: ACTIVITY_LABELS[route.activity],
      points: route.points,
      waypoints: route.waypoints.filter((w) => w.kind !== "via"),
      time: route.createdAt,
      link: options?.link,
      keywords: `${route.activity},${route.mode}`,
    });
    return { fileName: `${routeFileStem(route)}.gpx`, mimeType: this.mimeType, content };
  },
};

export const geoJsonExporter: RouteExporter = {
  format: "geojson",
  label: "GeoJSON",
  mimeType: "application/geo+json",
  export(route) {
    const feature = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            name: route.name,
            activity: route.activity,
            distanceM: route.stats.distanceM,
            ascentM: route.stats.ascentM,
            descentM: route.stats.descentM,
          },
          geometry: {
            type: "LineString",
            coordinates: route.points.map((p) => (typeof p.ele === "number" ? [p.lng, p.lat, p.ele] : [p.lng, p.lat])),
          },
        },
        ...route.waypoints.map((w) => ({
          type: "Feature",
          properties: { kind: w.kind, name: w.name ?? null },
          geometry: { type: "Point", coordinates: [w.lng, w.lat] },
        })),
      ],
    };
    return { fileName: `${routeFileStem(route)}.geojson`, mimeType: this.mimeType, content: JSON.stringify(feature) };
  },
};

/**
 * Registry of available exporters. FIT, TCX and KML can be added by
 * implementing RouteExporter and registering it here — the UI lists
 * whatever is registered.
 */
export const EXPORTERS: readonly RouteExporter[] = [gpxExporter, geoJsonExporter];

export function getExporter(format: string): RouteExporter | undefined {
  return EXPORTERS.find((e) => e.format === format);
}
