/** A WGS84 coordinate. Longitude first is deliberately avoided to prevent mix-ups. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A point along a route: coordinate, optional elevation and cumulative distance in metres. */
export interface RoutePoint extends LatLng {
  /** Elevation in metres above sea level, when known. */
  ele?: number;
  /** Cumulative distance from the start of the route, in metres. */
  dist: number;
}

/** A point of the elevation profile (distance along route → elevation). */
export interface ElevationPoint {
  /** Distance from start in metres. */
  dist: number;
  /** Elevation in metres. */
  ele: number;
}

/** Bounding box [west, south, east, north]. */
export type BBox = [number, number, number, number];
