import type { ActivityType, DifficultyLevel, SurfaceType, WayType } from "./activity";
import type { BBox, LatLng, RoutePoint } from "./geo";

export type RouteMode = "loop" | "point_to_point";

/** The three "characters" the generator proposes for a request. */
export const ROUTE_STYLES = ["fast", "balanced", "adventure"] as const;
export type RouteStyle = (typeof ROUTE_STYLES)[number];

export type ElevationMode = "auto" | "minimize" | "maximize";
export type SurfacePreference = "any" | "paved" | "unpaved";

/** A named place resolved through geocoding (or picked on the map). */
export interface Place extends LatLng {
  name: string;
  /** Free-form secondary label (city, country, ...). */
  label?: string;
}

export interface RouteWaypoint extends LatLng {
  id: string;
  kind: "start" | "via" | "end";
  name?: string;
}

/** User preferences influencing routing costs and scoring. All optional. */
export interface RoutePreferences {
  avoidBusyRoads?: boolean;
  avoidMajorRoads?: boolean;
  avoidPrivateRoads?: boolean;
  avoidFerries?: boolean;
  preferNature?: boolean;
  preferCycleways?: boolean;
  preferTrails?: boolean;
  preferSingletracks?: boolean;
  preferQuietRoads?: boolean;
  scenic?: boolean;
  elevationMode?: ElevationMode;
  surface?: SurfacePreference;
  /** Bounding boxes to avoid (west, south, east, north). */
  avoidAreas?: BBox[];
}

export interface RouteRequest {
  mode: RouteMode;
  activity: ActivityType;
  start: Place;
  end?: Place;
  /** Target distance in km (required for loops). */
  distanceKm?: number;
  /** Initial distance tolerance as a ratio (default 0.05). */
  distanceTolerance?: number;
  /** Desired positive elevation gain in metres. */
  elevationTargetM?: number;
  /** Maximum acceptable positive elevation gain in metres. */
  elevationMaxM?: number;
  /** Desired difficulty. */
  difficulty?: DifficultyLevel;
  /** Desired duration in minutes (converted to distance using the activity profile when no distance is given). */
  durationMinutes?: number;
  preferences?: RoutePreferences;
  /** Restrict generation to given styles (default: all three). */
  styles?: RouteStyle[];
  /** Random seed driving the loop direction; different seeds give different loops. */
  seed?: number;
}

export type SurfaceBreakdown = Record<SurfaceType, number>;
export type WayBreakdown = Record<WayType, number>;

export interface RouteStatistics {
  distanceM: number;
  ascentM: number;
  descentM: number;
  minEleM?: number;
  maxEleM?: number;
  /** Estimated moving duration in seconds for the requested activity. */
  durationS: number;
  hasElevation: boolean;
  difficulty: DifficultyLevel;
  /** Share (0..1) of the distance by surface type. */
  surfaces: SurfaceBreakdown;
  /** Share (0..1) of the distance by way type. */
  ways: WayBreakdown;
  /** Share (0..1) of the surface data that is actually known. */
  surfaceCoverage: number;
  /** Number of manoeuvres reported by the routing engine, if any. */
  turnCount?: number;
  /** Share (0..1) of the distance travelled twice (loops only). */
  overlapRatio: number;
  /** Steepest 100 m gradient (percentage), when elevation is available. */
  maxGradientPct?: number;
}

/** Attributes of a contiguous stretch of the route, as reported by the routing engine. */
export interface RouteSegment {
  startIndex: number;
  endIndex: number;
  lengthM: number;
  surface: SurfaceType;
  way: WayType;
  name?: string;
}

export interface ScoreComponent {
  id: string;
  label: string;
  /** Normalised score 0..1. */
  value: number;
  weight: number;
  /** Optional detail for explanations. */
  detail?: string;
}

export interface RouteScore {
  /** Weighted total 0..100. */
  total: number;
  components: ScoreComponent[];
}

export interface RouteInsight {
  tone: "positive" | "neutral" | "warning";
  message: string;
}

/** "Route DNA": 0..100 estimations describing the character of the route. */
export interface RouteDNA {
  nature: number;
  calm: number;
  difficulty: number;
  technical: number;
  panorama: number;
  /** True when the underlying data is partial and the values are rough estimates. */
  estimated: boolean;
}

export interface RouteResult {
  id: string;
  name: string;
  activity: ActivityType;
  mode: RouteMode;
  style: RouteStyle;
  points: RoutePoint[];
  waypoints: RouteWaypoint[];
  stats: RouteStatistics;
  segments: RouteSegment[];
  score: RouteScore;
  dna: RouteDNA;
  insights: RouteInsight[];
  provider: string;
  createdAt: string;
  bbox: BBox;
  /** The request that produced the route (used to regenerate / adjust). */
  request?: RouteRequest;
}

/** Response of the generation API: several variants, best first. */
export interface RouteGenerationResult {
  routes: RouteResult[];
  /** Human-readable notes about the generation (tolerance widened, ...). */
  notes: string[];
  provider: string;
}

/** Quick adjustments applied to an existing route. */
export type RouteAdjustment =
  | "distance_plus"
  | "distance_minus"
  | "elevation_plus"
  | "elevation_minus"
  | "more_nature"
  | "more_rolling"
  | "more_quiet"
  | "more_technical";
