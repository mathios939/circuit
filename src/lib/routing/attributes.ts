import type { SurfaceType, WayType } from "@/lib/types";

/**
 * Normalises surface descriptors coming from OSM tags or routing engines
 * (Valhalla, GraphHopper, openrouteservice) into our coarse SurfaceType.
 */
export function normaliseSurface(raw: string | undefined | null): SurfaceType {
  if (!raw) return "unknown";
  const s = raw.toLowerCase();
  if (
    s === "paved" ||
    s === "paved_smooth" ||
    s === "paved_rough" ||
    s === "asphalt" ||
    s === "concrete" ||
    s.startsWith("concrete") ||
    s === "paving_stones" ||
    s === "sett" ||
    s === "cobblestone" ||
    s === "metal" ||
    s === "wood" ||
    s === "chipseal" ||
    s === "tarmac"
  ) {
    return "paved";
  }
  if (
    s === "compacted" ||
    s === "gravel" ||
    s === "fine_gravel" ||
    s === "pebblestone" ||
    s === "unpaved" ||
    s === "compacted_gravel"
  ) {
    return "gravel";
  }
  if (
    s === "dirt" ||
    s === "path" ||
    s === "ground" ||
    s === "earth" ||
    s === "grass" ||
    s === "mud" ||
    s === "sand" ||
    s === "rock" ||
    s === "impassable" ||
    s === "woodchips" ||
    s === "grass_paver"
  ) {
    return "trail";
  }
  return "unknown";
}

/**
 * Normalises a road class / highway tag plus an optional "use" descriptor
 * (Valhalla) into our coarse WayType.
 */
export function normaliseWay(roadClass: string | undefined | null, use?: string | undefined | null): WayType {
  const u = use?.toLowerCase();
  if (u) {
    if (u === "cycleway" || u === "mountain_bike") return "cycleway";
    if (u === "track") return "track";
    if (u === "path" || u === "bridleway") return "path";
    if (u === "footway" || u === "sidewalk" || u === "pedestrian" || u === "steps" || u === "pedestrian_crossing") return "footway";
    if (u === "ferry" || u === "rail-ferry") return "ferry";
    if (u === "living_street") return "residential";
  }
  const c = roadClass?.toLowerCase();
  if (!c) return "other";
  if (c === "motorway" || c === "trunk" || c === "primary" || c === "state road" || c === "motorway_link" || c === "trunk_link" || c === "primary_link") {
    return "major_road";
  }
  if (c === "secondary" || c === "tertiary" || c === "unclassified" || c === "road" || c === "secondary_link" || c === "tertiary_link") return "road";
  if (c === "residential" || c === "living_street" || c === "street" || c === "service" || c === "service_other") return "residential";
  if (c === "cycleway") return "cycleway";
  if (c === "track") return "track";
  if (c === "path" || c === "bridleway") return "path";
  if (c === "footway" || c === "pedestrian" || c === "steps") return "footway";
  if (c === "ferry") return "ferry";
  return "other";
}
