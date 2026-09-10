import type { ActivityProfile, SurfaceBreakdown } from "@/lib/types";

export interface DurationInput {
  distanceM: number;
  ascentM: number;
  descentM: number;
  surfaces?: SurfaceBreakdown;
}

/**
 * Estimates the moving time in seconds for an activity profile.
 *
 * Model: flat time from a surface-weighted cruising speed, plus a per-metre
 * ascent penalty (Naismith-like), minus a small descent bonus. This is
 * intentionally simple and fully driven by the profile so that user-level
 * calibration (fitness, e-bike) can be added by overriding the profile.
 */
export function estimateDurationSeconds(profile: ActivityProfile, input: DurationInput): number {
  const { distanceM, ascentM, descentM, surfaces } = input;
  if (distanceM <= 0) return 0;

  let surfaceFactor = 1;
  if (surfaces) {
    const known = surfaces.paved + surfaces.gravel + surfaces.trail;
    if (known > 0) {
      surfaceFactor =
        (surfaces.paved * profile.surfaceSpeedFactor.paved +
          surfaces.gravel * profile.surfaceSpeedFactor.gravel +
          surfaces.trail * profile.surfaceSpeedFactor.trail +
          surfaces.unknown * profile.surfaceSpeedFactor.unknown) /
        (known + surfaces.unknown);
    }
  }

  const speedMs = (profile.flatSpeedKmh * surfaceFactor) / 3.6;
  const flatSeconds = distanceM / speedMs;
  const climbSeconds = Math.max(0, ascentM) * profile.ascentSecondsPerMeter;
  // Descents give back a fraction of the time spent on the equivalent flat distance.
  const descentBonus = Math.max(0, descentM) * profile.ascentSecondsPerMeter * (1 - profile.descentFactor) * 0.5;

  return Math.max(0, Math.round(flatSeconds + climbSeconds - descentBonus));
}
