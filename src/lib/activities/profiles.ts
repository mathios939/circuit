import type { ActivityProfile, ActivityType, SurfaceType, WayType } from "@/lib/types";

const surfaces = (paved: number, gravel: number, trail: number, unknown = 0.7): Record<SurfaceType, number> => ({
  paved,
  gravel,
  trail,
  unknown,
});

const ways = (w: Partial<Record<WayType, number>>): Record<WayType, number> => ({
  major_road: 0.1,
  road: 0.5,
  residential: 0.6,
  cycleway: 0.6,
  track: 0.6,
  path: 0.6,
  footway: 0.5,
  ferry: 0.3,
  other: 0.5,
  ...w,
});

/**
 * Activity profiles. Speeds are for a recreational, reasonably fit user.
 * Everything here is data so that user-level customisation can override it.
 */
export const ACTIVITY_PROFILES: Record<ActivityType, ActivityProfile> = {
  road_cycling: {
    id: "road_cycling",
    locomotion: "bicycle",
    flatSpeedKmh: 26,
    ascentSecondsPerMeter: 7,
    descentFactor: 0.85,
    surfaceSpeedFactor: surfaces(1, 0.7, 0.45, 0.9),
    surfaceAffinity: surfaces(1, 0.15, 0.02),
    wayAffinity: ways({ major_road: 0.15, road: 0.8, residential: 0.85, cycleway: 0.9, track: 0.1, path: 0.02, footway: 0.05 }),
    minDistanceKm: 5,
    maxDistanceKm: 300,
    defaultDistanceKm: 60,
    difficulty: { longDistanceKm: 100, hillyAscentM: 1200 },
  },
  gravel: {
    id: "gravel",
    locomotion: "bicycle",
    flatSpeedKmh: 21,
    ascentSecondsPerMeter: 8,
    descentFactor: 0.9,
    surfaceSpeedFactor: surfaces(1, 0.85, 0.6, 0.9),
    surfaceAffinity: surfaces(0.6, 1, 0.6),
    wayAffinity: ways({ major_road: 0.05, road: 0.5, residential: 0.6, cycleway: 0.8, track: 1, path: 0.6, footway: 0.2 }),
    minDistanceKm: 5,
    maxDistanceKm: 250,
    defaultDistanceKm: 50,
    difficulty: { longDistanceKm: 80, hillyAscentM: 1000 },
  },
  mtb: {
    id: "mtb",
    locomotion: "bicycle",
    flatSpeedKmh: 15,
    ascentSecondsPerMeter: 10,
    descentFactor: 0.9,
    surfaceSpeedFactor: surfaces(1.2, 1, 0.75, 0.9),
    surfaceAffinity: surfaces(0.25, 0.8, 1),
    wayAffinity: ways({ major_road: 0.02, road: 0.2, residential: 0.35, cycleway: 0.5, track: 0.9, path: 1, footway: 0.3 }),
    minDistanceKm: 3,
    maxDistanceKm: 150,
    defaultDistanceKm: 30,
    difficulty: { longDistanceKm: 50, hillyAscentM: 900 },
  },
  running: {
    id: "running",
    locomotion: "pedestrian",
    flatSpeedKmh: 10.5,
    ascentSecondsPerMeter: 6,
    descentFactor: 0.95,
    surfaceSpeedFactor: surfaces(1, 0.95, 0.85, 0.95),
    surfaceAffinity: surfaces(0.8, 1, 0.8),
    wayAffinity: ways({ major_road: 0.05, road: 0.35, residential: 0.6, cycleway: 0.8, track: 0.9, path: 1, footway: 0.9 }),
    minDistanceKm: 1,
    maxDistanceKm: 60,
    defaultDistanceKm: 10,
    difficulty: { longDistanceKm: 21, hillyAscentM: 400 },
  },
  trail_running: {
    id: "trail_running",
    locomotion: "pedestrian",
    flatSpeedKmh: 9,
    ascentSecondsPerMeter: 8,
    descentFactor: 0.95,
    surfaceSpeedFactor: surfaces(1.05, 1, 0.9, 0.95),
    surfaceAffinity: surfaces(0.3, 0.8, 1),
    wayAffinity: ways({ major_road: 0.02, road: 0.2, residential: 0.35, cycleway: 0.5, track: 0.8, path: 1, footway: 0.6 }),
    minDistanceKm: 2,
    maxDistanceKm: 100,
    defaultDistanceKm: 15,
    difficulty: { longDistanceKm: 30, hillyAscentM: 1000 },
  },
  hiking: {
    id: "hiking",
    locomotion: "pedestrian",
    flatSpeedKmh: 4.5,
    ascentSecondsPerMeter: 6,
    descentFactor: 1,
    surfaceSpeedFactor: surfaces(1, 1, 0.9, 0.95),
    surfaceAffinity: surfaces(0.3, 0.8, 1),
    wayAffinity: ways({ major_road: 0.02, road: 0.2, residential: 0.35, cycleway: 0.4, track: 0.8, path: 1, footway: 0.7 }),
    minDistanceKm: 1,
    maxDistanceKm: 60,
    defaultDistanceKm: 12,
    difficulty: { longDistanceKm: 20, hillyAscentM: 800 },
  },
  walking: {
    id: "walking",
    locomotion: "pedestrian",
    flatSpeedKmh: 5,
    ascentSecondsPerMeter: 6,
    descentFactor: 1,
    surfaceSpeedFactor: surfaces(1, 0.95, 0.85, 0.95),
    surfaceAffinity: surfaces(0.9, 0.9, 0.7),
    wayAffinity: ways({ major_road: 0.05, road: 0.35, residential: 0.7, cycleway: 0.7, track: 0.8, path: 0.9, footway: 1 }),
    minDistanceKm: 0.5,
    maxDistanceKm: 40,
    defaultDistanceKm: 6,
    difficulty: { longDistanceKm: 15, hillyAscentM: 400 },
  },
};

export function getActivityProfile(activity: ActivityType): ActivityProfile {
  return ACTIVITY_PROFILES[activity];
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  road_cycling: "Vélo de route",
  gravel: "Gravel",
  mtb: "VTT",
  running: "Course à pied",
  trail_running: "Trail",
  hiking: "Randonnée",
  walking: "Marche",
};

/** Short slug used in file names and URLs. */
export const ACTIVITY_SLUGS: Record<ActivityType, string> = {
  road_cycling: "velo",
  gravel: "gravel",
  mtb: "vtt",
  running: "course",
  trail_running: "trail",
  hiking: "rando",
  walking: "marche",
};
