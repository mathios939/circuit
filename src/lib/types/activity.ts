export const ACTIVITY_TYPES = [
  "road_cycling",
  "gravel",
  "mtb",
  "running",
  "trail_running",
  "hiking",
  "walking",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Broad locomotion family used by routing engines. */
export type LocomotionMode = "bicycle" | "pedestrian";

export type DifficultyLevel = "easy" | "moderate" | "hard" | "expert";

/** Coarse surface categories used for statistics and scoring. */
export const SURFACE_TYPES = ["paved", "gravel", "trail", "unknown"] as const;
export type SurfaceType = (typeof SURFACE_TYPES)[number];

/** Coarse way categories derived from OSM highway / use tags. */
export const WAY_TYPES = [
  "major_road",
  "road",
  "residential",
  "cycleway",
  "track",
  "path",
  "footway",
  "ferry",
  "other",
] as const;
export type WayType = (typeof WAY_TYPES)[number];

/**
 * Speed and effort model for an activity. Values are deliberately simple so
 * they can later be overridden per user (fitness level, e-bike, ...).
 */
export interface ActivityProfile {
  id: ActivityType;
  locomotion: LocomotionMode;
  /** Typical flat cruising speed in km/h. */
  flatSpeedKmh: number;
  /** Extra time per metre of ascent, in seconds (Naismith-like). */
  ascentSecondsPerMeter: number;
  /** Time factor applied on descents (1 = neutral, <1 = faster). */
  descentFactor: number;
  /** Multiplier applied to speed by surface type. */
  surfaceSpeedFactor: Record<SurfaceType, number>;
  /** Preference weight of each surface type for scoring (0 = avoid, 1 = ideal). */
  surfaceAffinity: Record<SurfaceType, number>;
  /** Preference weight of each way type for scoring (0 = avoid, 1 = ideal). */
  wayAffinity: Record<WayType, number>;
  /** Distance sanity bounds in km. */
  minDistanceKm: number;
  maxDistanceKm: number;
  defaultDistanceKm: number;
  /** Difficulty thresholds. */
  difficulty: {
    /** Distance (km) beyond which the route counts as long. */
    longDistanceKm: number;
    /** Ascent (m) beyond which the route counts as hilly. */
    hillyAscentM: number;
  };
}
