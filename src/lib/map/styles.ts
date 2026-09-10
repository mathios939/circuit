import type { StyleSpecification } from "maplibre-gl";

export type BasemapKind = "standard" | "outdoor" | "topo" | "satellite";

export interface Basemap {
  id: string;
  label: string;
  kind: BasemapKind;
  /** MapLibre style URL or inline style specification. */
  style: string | StyleSpecification;
}

/**
 * Map provider abstraction (client side). Basemaps are declared here so the
 * rest of the UI only deals with `Basemap` objects. Public map keys
 * (NEXT_PUBLIC_MAPTILER_KEY) are meant to be domain-restricted in the
 * provider's console.
 *
 * The public OpenStreetMap tile servers are deliberately not used: OpenFreeMap
 * serves free vector tiles without a key, and MapTiler adds outdoor / topo /
 * satellite when a key is configured.
 */
export function getBasemaps(): Basemap[] {
  const provider = process.env.NEXT_PUBLIC_MAP_PROVIDER ?? "openfreemap";
  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const maps: Basemap[] = [];

  if (provider === "maptiler" && maptilerKey) {
    const mt = (id: string) => `https://api.maptiler.com/maps/${id}/style.json?key=${encodeURIComponent(maptilerKey)}`;
    maps.push(
      { id: "maptiler-outdoor", label: "Outdoor", kind: "outdoor", style: mt("outdoor-v2") },
      { id: "maptiler-streets", label: "Standard", kind: "standard", style: mt("streets-v2") },
      { id: "maptiler-topo", label: "Topographique", kind: "topo", style: mt("topo-v2") },
      { id: "maptiler-satellite", label: "Satellite", kind: "satellite", style: mt("satellite") },
    );
  } else {
    maps.push(
      { id: "ofm-liberty", label: "Standard", kind: "standard", style: "https://tiles.openfreemap.org/styles/liberty" },
      { id: "ofm-bright", label: "Clair", kind: "outdoor", style: "https://tiles.openfreemap.org/styles/bright" },
    );
    if (maptilerKey) {
      maps.push(
        { id: "maptiler-outdoor", label: "Outdoor", kind: "outdoor", style: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${encodeURIComponent(maptilerKey)}` },
        { id: "maptiler-satellite", label: "Satellite", kind: "satellite", style: `https://api.maptiler.com/maps/satellite/style.json?key=${encodeURIComponent(maptilerKey)}` },
      );
    }
  }

  maps.push({
    id: "opentopomap",
    label: "Topo (OpenTopoMap)",
    kind: "topo",
    style: {
      version: 8,
      sources: {
        opentopomap: {
          type: "raster",
          tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png", "https://b.tile.opentopomap.org/{z}/{x}/{y}.png", "https://c.tile.opentopomap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          maxzoom: 17,
          attribution:
            'Données © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · SRTM · Rendu © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
        },
      },
      layers: [{ id: "opentopomap", type: "raster", source: "opentopomap" }],
    },
  });

  return maps;
}

export const DEFAULT_MAP_CENTER: [number, number] = [2.5, 46.6]; // lng, lat — France
export const DEFAULT_MAP_ZOOM = 5.2;
