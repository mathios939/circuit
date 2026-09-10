import type { ActivityType, LatLng, RouteInstruction, RoutePreferences, RouteSegment, RouteStyle } from "@/lib/types";

/** What the routing engine should optimise for. */
export interface RoutingProfileOptions {
  activity: ActivityType;
  style: RouteStyle;
  preferences: RoutePreferences;
}

export interface RawRouteCoordinate extends LatLng {
  ele?: number;
}

/** Engine-agnostic route as returned by a RoutingProvider. */
export interface RawRoute {
  coordinates: RawRouteCoordinate[];
  /** Distance reported by the engine, in metres. */
  distanceM: number;
  /** Duration reported by the engine (its own model), in seconds. */
  durationS?: number;
  /** Number of manoeuvres, when available. */
  turnCount?: number;
  /** Surface / way attributes per stretch, when the engine returns them inline. */
  segments?: RouteSegment[];
  /** Indices in `coordinates` where each input waypoint was snapped. */
  waypointIndices?: number[];
  /** Turn-by-turn instructions, normalised, when the engine returns them. */
  instructions?: RouteInstruction[];
}

export interface CalculateRouteInput {
  /** At least two waypoints: start, [via...], end. */
  waypoints: LatLng[];
  profile: RoutingProfileOptions;
  signal?: AbortSignal;
}

export interface CalculateLoopInput {
  start: LatLng;
  distanceM: number;
  /** Seed steering the loop direction; different seeds → different loops. */
  seed: number;
  profile: RoutingProfileOptions;
  signal?: AbortSignal;
}

export interface CalculateMatrixInput {
  sources: LatLng[];
  targets: LatLng[];
  profile: RoutingProfileOptions;
  signal?: AbortSignal;
}

export interface RoutingCapabilities {
  /** Engine can build round trips natively (GraphHopper, openrouteservice). */
  nativeLoop: boolean;
  /** Engine returns elevation inline. */
  elevation: boolean;
  /** Engine can return surface / way-type attributes (inline or via getRouteDetails). */
  segments: boolean;
  matrix: boolean;
}

/**
 * Abstraction over routing engines (Valhalla, GraphHopper, OSRM, ...).
 * The route generator only depends on this interface.
 */
export interface RoutingProvider {
  readonly id: string;
  readonly capabilities: RoutingCapabilities;

  /** Route through the given waypoints, in order. */
  calculateRoute(input: CalculateRouteInput): Promise<RawRoute>;

  /** Distance matrix in metres (sources × targets). */
  calculateMatrix?(input: CalculateMatrixInput): Promise<number[][]>;

  /** Native round trip of approximately `distanceM`. */
  calculateLoop?(input: CalculateLoopInput): Promise<RawRoute>;

  /** Surface / way-type attributes along a route (extra call for engines that do not inline them). */
  getRouteDetails?(route: RawRoute, profile: RoutingProfileOptions, signal?: AbortSignal): Promise<RouteSegment[]>;
}
