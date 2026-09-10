import type { ActivityType, LocomotionMode, RouteStyle } from "@/lib/types";
import { getActivityProfile } from "@/lib/activities/profiles";
import { clamp } from "@/lib/utils/format";
import type { RoutingProfileOptions } from "./provider";

/**
 * Engine-agnostic routing intent, derived from activity + style + preferences.
 * Each provider maps these 0..1 knobs onto its own costing parameters, which
 * keeps the activity rules in one place.
 */
export interface RoutingIntent {
  locomotion: LocomotionMode;
  /** 0 = stay away from roads (prefer paths/cycleways), 1 = roads are fine. */
  useRoads: number;
  /** 0 = avoid hills, 1 = seek hills. */
  useHills: number;
  /** 0 = stay on pavement, 1 = unpaved is welcome. */
  useUnpaved: number;
  /** 0 = avoid trails / tracks, 1 = seek them. */
  useTrails: number;
  /** 0 = avoid living streets/quiet streets, 1 = prefer them. */
  useQuietStreets: number;
  avoidFerries: boolean;
  avoidMajorRoads: boolean;
  avoidPrivate: boolean;
  /** Prefer the shortest path instead of the "best" one. */
  shortest: boolean;
  /** Valhalla-style bicycle category. */
  bicycleType: "Road" | "Hybrid" | "Cross" | "Mountain";
  /** Max hiking difficulty (OSM sac_scale, 0..6) for pedestrian modes. */
  maxHikingDifficulty: number;
  /** Cruising speed hint in km/h. */
  speedKmh: number;
}

const BASE_INTENT: Record<ActivityType, Omit<RoutingIntent, "locomotion" | "speedKmh" | "avoidFerries" | "avoidMajorRoads" | "avoidPrivate" | "shortest">> = {
  road_cycling: { useRoads: 0.7, useHills: 0.5, useUnpaved: 0.05, useTrails: 0.02, useQuietStreets: 0.5, bicycleType: "Road", maxHikingDifficulty: 0 },
  gravel: { useRoads: 0.35, useHills: 0.5, useUnpaved: 0.8, useTrails: 0.6, useQuietStreets: 0.6, bicycleType: "Cross", maxHikingDifficulty: 0 },
  mtb: { useRoads: 0.15, useHills: 0.6, useUnpaved: 1, useTrails: 1, useQuietStreets: 0.5, bicycleType: "Mountain", maxHikingDifficulty: 0 },
  running: { useRoads: 0.3, useHills: 0.4, useUnpaved: 0.6, useTrails: 0.6, useQuietStreets: 0.8, bicycleType: "Hybrid", maxHikingDifficulty: 1 },
  trail_running: { useRoads: 0.1, useHills: 0.7, useUnpaved: 1, useTrails: 1, useQuietStreets: 0.5, bicycleType: "Hybrid", maxHikingDifficulty: 3 },
  hiking: { useRoads: 0.1, useHills: 0.6, useUnpaved: 1, useTrails: 1, useQuietStreets: 0.5, bicycleType: "Hybrid", maxHikingDifficulty: 4 },
  walking: { useRoads: 0.3, useHills: 0.3, useUnpaved: 0.5, useTrails: 0.5, useQuietStreets: 0.9, bicycleType: "Hybrid", maxHikingDifficulty: 1 },
};

/** How each style shifts the base intent. */
const STYLE_SHIFT: Record<RouteStyle, { roads: number; trails: number; unpaved: number; shortest: boolean }> = {
  fast: { roads: +0.25, trails: -0.3, unpaved: -0.3, shortest: true },
  balanced: { roads: 0, trails: 0, unpaved: 0, shortest: false },
  adventure: { roads: -0.3, trails: +0.3, unpaved: +0.25, shortest: false },
};

export function buildRoutingIntent(options: RoutingProfileOptions): RoutingIntent {
  const profile = getActivityProfile(options.activity);
  const base = BASE_INTENT[options.activity];
  const shift = STYLE_SHIFT[options.style];
  const p = options.preferences ?? {};

  let useRoads = base.useRoads + shift.roads;
  let useTrails = base.useTrails + shift.trails;
  let useUnpaved = base.useUnpaved + shift.unpaved;
  let useHills = base.useHills;
  let useQuiet = base.useQuietStreets;

  if (p.avoidBusyRoads || p.preferQuietRoads) {
    useRoads -= 0.25;
    useQuiet += 0.3;
  }
  if (p.preferNature || p.scenic) {
    useRoads -= 0.15;
    useTrails += 0.15;
  }
  if (p.preferCycleways) useRoads -= 0.2;
  if (p.preferTrails || p.preferSingletracks) {
    useTrails += 0.3;
    useUnpaved += 0.2;
  }
  if (p.surface === "paved") {
    useUnpaved = Math.min(useUnpaved, 0.1);
    useTrails = Math.min(useTrails, 0.2);
  } else if (p.surface === "unpaved") {
    useUnpaved = Math.max(useUnpaved, 0.8);
  }
  if (p.elevationMode === "minimize") useHills = 0.05;
  else if (p.elevationMode === "maximize") useHills = 1;

  // Road bikes must never be pushed on trails whatever the preferences.
  if (options.activity === "road_cycling") {
    useTrails = Math.min(useTrails, 0.1);
    useUnpaved = Math.min(useUnpaved, 0.15);
  }

  return {
    locomotion: profile.locomotion,
    useRoads: clamp(useRoads, 0, 1),
    useHills: clamp(useHills, 0, 1),
    useUnpaved: clamp(useUnpaved, 0, 1),
    useTrails: clamp(useTrails, 0, 1),
    useQuietStreets: clamp(useQuiet, 0, 1),
    avoidFerries: p.avoidFerries ?? true,
    avoidMajorRoads: Boolean(p.avoidMajorRoads || p.avoidBusyRoads),
    avoidPrivate: p.avoidPrivateRoads ?? true,
    shortest: shift.shortest && !(p.preferNature || p.scenic),
    bicycleType: base.bicycleType,
    maxHikingDifficulty: base.maxHikingDifficulty,
    speedKmh: profile.flatSpeedKmh,
  };
}
