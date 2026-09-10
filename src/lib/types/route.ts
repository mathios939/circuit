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
  /** Ascent computed on the raw elevation samples (before filtering), for comparison. */
  ascentRawM?: number;
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
  /** Weighted total 0..100 ("Score Circuit"). */
  total: number;
  components: ScoreComponent[];
  /** Five headline sub-scores (0..100) shown to the user, all estimations. */
  summary: RouteScoreSummary;
}

export interface RouteScoreSummary {
  distance: number;
  nature: number;
  calm: number;
  difficulty: number;
  variety: number;
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
  /** Technicity of the terrain (relevant for MTB, trail, hiking). */
  technical: number;
  panorama: number;
  /** Diversity of the ground covered (few repeated sections, varied way types). */
  variety: number;
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
  /** Turn-by-turn instructions when the engine provides them. */
  instructions?: RouteInstruction[];
  /** Post-routing quality assessment. */
  quality?: RouteQualityReport;
  /** Technical details for the development debug panel. */
  debug?: RouteDebugInfo;
}

/** Turn-by-turn instruction as reported by the routing engine (stored for future exports). */
export interface RouteInstruction {
  /** Length of the manoeuvre's stretch, in metres. */
  distanceM: number;
  /** Engine-estimated duration of the stretch, in seconds. */
  durationS?: number;
  /** Normalised manoeuvre type. */
  type: RouteInstructionType;
  streetName?: string;
  /** Position where the manoeuvre happens. */
  coordinates: LatLng;
  /** Index of that position in the route geometry. */
  pointIndex: number;
  /** Human-readable instruction text (engine language). */
  text?: string;
}

export type RouteInstructionType =
  | "depart"
  | "arrive"
  | "continue"
  | "turn_left"
  | "turn_slight_left"
  | "turn_sharp_left"
  | "turn_right"
  | "turn_slight_right"
  | "turn_sharp_right"
  | "u_turn"
  | "roundabout"
  | "keep_left"
  | "keep_right"
  | "ferry"
  | "waypoint"
  | "other";

/**
 * Post-routing quality assessment. A route can be technically valid yet a
 * poor sports route; this report drives the quality gate.
 */
export interface RouteQualityReport {
  /** 1 − |distance − target| / target (1 when no target). */
  distanceAccuracy: number;
  /** Share of the length that re-uses ground already travelled. */
  overlapRatio: number;
  /** Share of the length travelled in the opposite direction on already used ground (out-and-back). */
  outAndBackRatio: number;
  /** Number of sharp reversals (> 150°) along the geometry. */
  uTurnCount: number;
  /** Farthest point from the start, in metres. */
  maxDistanceFromStartM: number;
  /** Number of waypoints used to build the route. */
  waypointCount: number;
  /** Geometry sanity: enough points, finite coordinates, no impossible jumps, plausible length. */
  geometryValid: boolean;
  /** 0..1 share of the distance on ways suited to the activity (0.5 when unknown). */
  activityCompatibility: number;
  /** 0..1: how well the waypoints are spread along the route (1 = evenly spaced, no cluster). */
  waypointQuality: number;
  /** Similarity (0..1) with the best other proposal of the same generation, when known. */
  similarityToBest?: number;
  /** Aggregated 0..100 score. */
  qualityScore: number;
  /** True when the route should not be shown. */
  rejected: boolean;
  reasons: string[];
}

/** Technical details kept for the development debug panel. */
export interface RouteDebugInfo {
  strategy?: string;
  bearing?: number;
  iterations?: number;
  candidateScore?: number;
  distanceError?: number;
  /** Ascent computed on raw (unfiltered) elevation, to compare with the filtered value. */
  rawAscentM?: number;
  timings?: Partial<Record<"routing" | "details" | "elevation" | "scoring", number>>;
  pointCount: number;
}

/** Stages reported while a generation is running. */
export type GenerationStage = "geocoding" | "candidates" | "routing" | "elevation" | "scoring" | "done";

export interface GenerationProgress {
  stage: GenerationStage;
  message: string;
  /** Optional detail such as "12 candidats". */
  detail?: string;
}

/** Response of the generation API: several variants, best first. */
export interface RouteGenerationResult {
  routes: RouteResult[];
  /** Human-readable notes about the generation (tolerance widened, ...). */
  notes: string[];
  provider: string;
  /** Wall-clock timings per stage, in milliseconds. */
  timings: Partial<Record<GenerationStage | "total", number>>;
  /** Number of upstream routing calls performed. */
  routingCalls: number;
  /** Number of candidates evaluated before selection. */
  candidatesEvaluated: number;
  /**
   * Present when no proposal met the distance tolerance: the routes returned
   * are the closest acceptable ones and the UI must say so.
   */
  distanceMismatch?: { requestedKm: number; bestKm: number };
}

/** Quick adjustments applied to an existing route. */
export type RouteAdjustment =
  | "distance_plus"
  | "distance_minus"
  | "easier"
  | "harder"
  | "more_nature"
  | "more_rolling"
  | "less_elevation"
  | "more_elevation"
  | "more_quiet";
