import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { LatLng, RoutePoint, RouteResult } from "@/lib/types";

/**
 * Imperative helpers managing the map sources / layers used to display
 * routes. Kept outside React so that they can be re-applied after a style
 * change (`style.load`) without re-rendering anything.
 */

const ROUTE_COLOR = "#ff5a1f";
const ALT_COLOR = "#64748b";

export const LAYERS = {
  altLine: "routes-alt-line",
  casing: "route-casing",
  line: "route-line",
  arrows: "route-arrows",
  hover: "route-hover",
  cut: "route-cut",
} as const;

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

function ensureSource(map: MapLibreMap, id: string) {
  if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: EMPTY });
}

/** Adds the sources and layers if they are missing (idempotent). */
export function ensureRouteLayers(map: MapLibreMap): void {
  ensureSource(map, "routes-alt");
  ensureSource(map, "route");
  ensureSource(map, "hover-point");
  ensureSource(map, "cut-points");

  if (!map.hasImage("route-arrow")) map.addImage("route-arrow", arrowImage(22), { pixelRatio: 2 });

  if (!map.getLayer(LAYERS.altLine)) {
    map.addLayer({
      id: LAYERS.altLine,
      type: "line",
      source: "routes-alt",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ALT_COLOR, "line-width": 3, "line-opacity": 0.55, "line-dasharray": [2, 1.5] },
    });
  }
  if (!map.getLayer(LAYERS.casing)) {
    map.addLayer({
      id: LAYERS.casing,
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 },
    });
  }
  if (!map.getLayer(LAYERS.line)) {
    map.addLayer({
      id: LAYERS.line,
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ROUTE_COLOR, "line-width": 5 },
    });
  }
  if (!map.getLayer(LAYERS.arrows)) {
    map.addLayer({
      id: LAYERS.arrows,
      type: "symbol",
      source: "route",
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 90,
        "icon-image": "route-arrow",
        "icon-size": 0.55,
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
  if (!map.getLayer(LAYERS.hover)) {
    map.addLayer({
      id: LAYERS.hover,
      type: "circle",
      source: "hover-point",
      paint: { "circle-radius": 7, "circle-color": ROUTE_COLOR, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 },
    });
  }
  if (!map.getLayer(LAYERS.cut)) {
    map.addLayer({
      id: LAYERS.cut,
      type: "circle",
      source: "cut-points",
      paint: { "circle-radius": 8, "circle-color": "#111827", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 },
    });
  }
}

function setData(map: MapLibreMap, id: string, data: FeatureCollection | Feature) {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  source?.setData(data);
}

const lineFeature = (points: readonly RoutePoint[]): Feature<LineString> => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
});

const pointFeature = (p: LatLng): Feature<Point> => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Point", coordinates: [p.lng, p.lat] },
});

export function setRouteData(map: MapLibreMap, selected: RouteResult | undefined, others: readonly RouteResult[]): void {
  setData(map, "route", selected ? { type: "FeatureCollection", features: [lineFeature(selected.points)] } : EMPTY);
  setData(map, "routes-alt", { type: "FeatureCollection", features: others.map((r) => lineFeature(r.points)) });
}

export function setHoverPoint(map: MapLibreMap, point: LatLng | null): void {
  setData(map, "hover-point", point ? { type: "FeatureCollection", features: [pointFeature(point)] } : EMPTY);
}

export function setCutPoints(map: MapLibreMap, points: readonly LatLng[]): void {
  setData(map, "cut-points", { type: "FeatureCollection", features: points.map(pointFeature) });
}

/** White arrow head on a route-coloured disc, drawn on a canvas (no glyphs needed). */
function arrowImage(size: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size * 2;
  canvas.height = size * 2;
  const ctx = canvas.getContext("2d")!;
  const c = size;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.9, 0, Math.PI * 2);
  ctx.fillStyle = ROUTE_COLOR;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c + size * 0.55, c);
  ctx.lineTo(c - size * 0.35, c - size * 0.5);
  ctx.lineTo(c - size * 0.15, c);
  ctx.lineTo(c - size * 0.35, c + size * 0.5);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
