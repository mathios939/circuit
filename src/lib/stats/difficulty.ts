import type { ActivityProfile, DifficultyLevel } from "@/lib/types";

export interface DifficultyInput {
  distanceM: number;
  ascentM: number;
  /** Share of trail / path surface, 0..1. */
  trailShare?: number;
  maxGradientPct?: number;
}

/**
 * Difficulty is computed from a 0..1 "effort" index combining relative
 * distance and ascent (relative to the activity's thresholds), with a bonus
 * for technical surface and steep gradients.
 */
export function estimateDifficulty(profile: ActivityProfile, input: DifficultyInput): DifficultyLevel {
  const distanceRatio = input.distanceM / 1000 / profile.difficulty.longDistanceKm;
  const ascentRatio = input.ascentM / profile.difficulty.hillyAscentM;
  const technical = (input.trailShare ?? 0) * 0.25;
  const steep = input.maxGradientPct !== undefined && input.maxGradientPct > 15 ? 0.2 : 0;

  const effort = distanceRatio * 0.55 + ascentRatio * 0.6 + technical + steep;
  if (effort < 0.45) return "easy";
  if (effort < 0.9) return "moderate";
  if (effort < 2) return "hard";
  return "expert";
}

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: "Facile",
  moderate: "Modérée",
  hard: "Difficile",
  expert: "Expert",
};
