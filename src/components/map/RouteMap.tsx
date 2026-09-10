"use client";

import { FullscreenControl, GeolocateControl, Map as MapLibreMap, type MapMouseEvent, Marker, NavigationControl, ScaleControl } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteWaypoint } from "@/lib/types";
import { nearestPointIndex, pointAtDistance } from "@/lib/geo";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, getBasemaps } from "@/lib/map/styles";
import { useRouteStore, useSelectedRoute } from "@/store/route-store";
import { ensureRouteLayers, LAYERS, setCutPoints, setHoverPoint, setRouteData } from "./map-layers";
import { MapControls } from "./MapControls";

export interface RouteMapProps {
  /** Extra padding (px) when fitting the route, e.g. to keep it above a bottom sheet. */
  fitPadding?: { top: number; right: number; bottom: number; left: number };
}

/**
 * MapLibre map showing the selected route, the alternative variants, the
 * draggable waypoints, the hover cursor and handling click interactions
 * (pick start/end, add waypoint, cut).
 */
export function RouteMap({ fitPadding }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [styleId, setStyleId] = useState<string | null>(null);
  const basemaps = useMemo(() => getBasemaps(), []);
  const basemapId = useRouteStore((s) => s.basemapId) ?? basemaps[0]!.id;
  const routes = useRouteStore((s) => s.routes);
  const route = useSelectedRoute();
  const hoverDist = useRouteStore((s) => s.hoverDist);
  const cutBuffer = useRouteStore((s) => s.cutBuffer);
  const editing = useRouteStore((s) => s.editing);
  const tool = useRouteStore((s) => s.tool);
  const pickTarget = useRouteStore((s) => s.pickTarget);
  const fitRequestId = useRouteStore((s) => s.fitRequestId);
  const paddingRef = useRef(fitPadding);
  useEffect(() => {
    paddingRef.current = fitPadding;
  }, [fitPadding]);

  // ----- map creation ---------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // The map is created once; the basemap chosen at that moment is read from
    // the store, later changes are applied by the "basemap switching" effect.
    const initialId = useRouteStore.getState().basemapId;
    const initial = basemaps.find((b) => b.id === initialId) ?? basemaps[0]!;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: initial.style,
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), "top-right");
    map.addControl(new FullscreenControl({ container: containerRef.current.parentElement ?? undefined }), "top-right");
    map.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
    // Tile errors (offline, blocked network) must never break the app.
    map.on("error", (e) => {
      if (process.env.NODE_ENV !== "production") console.warn("[map]", e.error?.message ?? e);
    });
    map.on("load", () => {
      ensureRouteLayers(map);
      setReady(true);
      setStyleId(initial.id);
    });
    map.on("style.load", () => {
      // After setStyle(): re-create our layers on the new style.
      if (map.isStyleLoaded()) ensureRouteLayers(map);
    });

    // Hover along the route → synchronise with the elevation profile.
    let frame = 0;
    map.on("mousemove", LAYERS.line, (e: MapMouseEvent) => {
      const state = useRouteStore.getState();
      const current = state.routes.find((r) => r.id === state.selectedId);
      if (!current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { index } = nearestPointIndex(current.points, { lat: e.lngLat.lat, lng: e.lngLat.lng });
        state.setHoverDist(current.points[index]?.dist ?? null);
      });
    });
    map.on("mouseleave", LAYERS.line, () => useRouteStore.getState().setHoverDist(null));

    map.on("click", (e: MapMouseEvent) => {
      const state = useRouteStore.getState();
      const position = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      if (state.pickTarget) {
        void state.pickFromMap(position);
        return;
      }
      if (!state.editing) return;
      if (state.tool === "add") void state.addWaypointAt(position);
      else if (state.tool === "cut") void state.cutAt(position);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [basemaps]);

  // ----- basemap switching ---------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || styleId === basemapId) return;
    const target = basemaps.find((b) => b.id === basemapId);
    if (!target) return;
    map.setStyle(target.style);
    map.once("style.load", () => {
      ensureRouteLayers(map);
      const state = useRouteStore.getState();
      const current = state.routes.find((r) => r.id === state.selectedId);
      setRouteData(map, current, state.routes.filter((r) => r.id !== current?.id));
      setStyleId(basemapId);
    });
  }, [basemapId, basemaps, ready, styleId]);

  // ----- data sync -------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setRouteData(map, route, routes.filter((r) => r.id !== route?.id));
  }, [route, routes, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const point = route && hoverDist !== null ? pointAtDistance(route.points, hoverDist) : undefined;
    setHoverPoint(map, point ?? null);
  }, [route, hoverDist, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setCutPoints(map, cutBuffer);
  }, [cutBuffer, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    // fitRequestId is the explicit trigger; the route is read from the store at that moment.
    const state = useRouteStore.getState();
    const current = state.routes.find((r) => r.id === state.selectedId);
    if (!current) return;
    const [w, s, e, n] = current.bbox;
    if (w === e && s === n) return;
    map.fitBounds([w, s, e, n], { padding: paddingRef.current ?? 60, duration: 700, maxZoom: 15 });
  }, [fitRequestId, ready]);

  // ----- cursor ------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor = pickTarget || (editing && tool !== "move") ? "crosshair" : "";
  }, [pickTarget, editing, tool, ready]);

  // ----- waypoint markers -------------------------------------------------
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const waypoints = route?.waypoints;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = markersRef.current;
    const wanted = new Map<string, RouteWaypoint>();
    (waypoints ?? []).forEach((w, i) => {
      // For loops the last waypoint duplicates the start: one marker is enough.
      if (i === waypoints!.length - 1 && i > 0 && sameSpot(w, waypoints![0]!)) return;
      wanted.set(w.id, w);
    });
    for (const [id, marker] of markers) {
      if (!wanted.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }
    for (const [id, w] of wanted) {
      let marker = markers.get(id);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "wp-marker";
        el.dataset.kind = w.kind;
        el.title = w.kind === "start" ? "Départ" : w.kind === "end" ? "Arrivée" : "Point de passage (cliquer pour supprimer)";
        marker = new Marker({ element: el, draggable: editing }).setLngLat([w.lng, w.lat]).addTo(map);
        marker.on("dragend", () => {
          const { lng, lat } = marker!.getLngLat();
          void useRouteStore.getState().moveWaypoint(id, { lat, lng });
        });
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const state = useRouteStore.getState();
          if (state.editing && state.tool === "move" && w.kind === "via") void state.removeWaypoint(id);
        });
        markers.set(id, marker);
      } else {
        marker.setLngLat([w.lng, w.lat]);
        marker.setDraggable(editing);
      }
      marker.getElement().dataset.editing = String(editing);
      marker.getElement().dataset.kind = w.kind;
    }
  }, [waypoints, editing, ready]);

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const m of markers.values()) m.remove();
      markers.clear();
    };
  }, []);

  return (
    <div className="relative h-full w-full bg-ink-100" data-testid="route-map">
      <div ref={containerRef} className="h-full w-full" />
      <MapControls basemaps={basemaps} />
      {pickTarget ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-ink-900 px-4 py-2 text-sm text-white shadow-lg">
          Cliquez sur la carte pour placer {pickTarget === "start" ? "le départ" : "l'arrivée"}
        </div>
      ) : null}
    </div>
  );
}

function sameSpot(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;
}
