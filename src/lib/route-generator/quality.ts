import type { ActivityProfile, LatLng, RouteQualityReport, RouteSegment } from "@/lib/types";
import { bearing, haversineDistance } from "@/lib/geo";
import { clamp } from "@/lib/utils/format";
import { computeOverlapRatio } from "./overlap";

export interface QualityInput {
  coordinates: readonly LatLng[];
  /** Distance reported by the engine, in metres. */
  distanceM: number;
  targetM?: number;
  start: LatLng;
  waypointCount: number;
  isLoop: boolean;
  profile: ActivityProfile;
  segments?: readonly RouteSegment[];
  /** Acceptable distance error ratio (default 0.10). */
  maxDistanceError?: number;
}

/**
 * Post-routing quality gate. A route that the engine happily computed can
 * still be a poor sports route: mostly out-and-back, folded on itself,
 * absurdly short, or built on ways unsuited to the activity. This report is
 * used to reject candidates before they are shown and to rank the others.
 */
export function assessRouteQuality(input: QualityInput): RouteQualityReport {
  const { coordinates, distanceM, targetM, start, profile } = input;
  const reasons: string[] = [];

  // --- geometry sanity ------------------------------------------------------
  let geometryValid = coordinates.length >= 4 && Number.isFinite(distanceM) && distanceM > 200;
  if (!geometryValid) reasons.push("Géométrie trop courte ou incomplète");
  let pathLength = 0;
  for (let i = 1; i < coordinates.length && geometryValid; i++) {
    const a = coordinates[i - 1]!;
    const b = coordinates[i]!;
    if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) {
      geometryValid = false;
      reasons.push("Coordonnées invalides");
      break;
    }
    const d = haversineDistance(a, b);
    if (d > 3000) {
      geometryValid = false;
      reasons.push("Saut anormal dans le tracé");
      break;
    }
    pathLength += d;
  }
  if (geometryValid && (pathLength < distanceM * 0.5 || pathLength > distanceM * 1.5)) {
    geometryValid = false;
    reasons.push("Longueur de la géométrie incohérente avec la distance annoncée");
  }
  if (geometryValid && input.isLoop && haversineDistance(coordinates[0]!, coordinates[coordinates.length - 1]!) > 250) {
    geometryValid = false;
    reasons.push("La boucle ne revient pas au départ");
  }

  // --- distance ---------------------------------------------------------------
  const distanceError = targetM ? Math.abs(distanceM - targetM) / targetM : 0;
  const distanceAccuracy = clamp(1 - distanceError, 0, 1);
  const maxDistanceError = input.maxDistanceError ?? 0.1;
  if (targetM && distanceError > maxDistanceError) reasons.push(`Distance hors tolérance (${Math.round(distanceError * 100)} %)`);

  // --- overlap / out-and-back / u-turns ---------------------------------------
  const overlapRatio = computeOverlapRatio(coordinates);
  const outAndBackRatio = computeOutAndBackRatio(coordinates);
  const uTurnCount = countUTurns(coordinates);
  if (input.isLoop && outAndBackRatio > 0.35) reasons.push(`Trop d'aller-retour (${Math.round(outAndBackRatio * 100)} %)`);
  else if (input.isLoop && overlapRatio > 0.45) reasons.push(`Tracé trop souvent répété (${Math.round(overlapRatio * 100)} %)`);
  const uTurnsPerKm = uTurnCount / Math.max(1, distanceM / 1000);
  if (uTurnsPerKm > 1.2) reasons.push(`Trop de demi-tours (${uTurnCount})`);

  // --- extent -------------------------------------------------------------------
  let maxDistanceFromStartM = 0;
  for (const p of coordinates) {
    const d = haversineDistance(start, p);
    if (d > maxDistanceFromStartM) maxDistanceFromStartM = d;
  }
  // A loop that never gets farther than 8 % of its length from the start is folded on itself.
  if (input.isLoop && geometryValid && maxDistanceFromStartM < distanceM * 0.08) reasons.push("Boucle repliée sur elle-même");

  // --- activity compatibility ---------------------------------------------------
  const activityCompatibility = compatibility(input.segments, profile);
  if (activityCompatibility < 0.2) reasons.push("Voies peu adaptées à l'activité");

  // --- score ----------------------------------------------------------------------
  const score =
    distanceAccuracy * 35 +
    (1 - clamp(outAndBackRatio * 2.5, 0, 1)) * 25 +
    (1 - clamp(overlapRatio * 2, 0, 1)) * 15 +
    (1 - clamp(uTurnsPerKm / 2, 0, 1)) * 10 +
    activityCompatibility * 15;
  const qualityScore = geometryValid ? Math.round(clamp(score, 0, 100)) : 0;

  const rejected =
    !geometryValid ||
    (targetM !== undefined && distanceError > maxDistanceError) ||
    (input.isLoop && (outAndBackRatio > 0.35 || overlapRatio > 0.45)) ||
    uTurnsPerKm > 1.2 ||
    (input.isLoop && geometryValid && maxDistanceFromStartM < distanceM * 0.08) ||
    activityCompatibility < 0.2;

  return {
    distanceAccuracy: round3(distanceAccuracy),
    overlapRatio: round3(overlapRatio),
    outAndBackRatio: round3(outAndBackRatio),
    uTurnCount,
    maxDistanceFromStartM: Math.round(maxDistanceFromStartM),
    waypointCount: input.waypointCount,
    geometryValid,
    activityCompatibility: round3(activityCompatibility),
    qualityScore,
    rejected,
    reasons,
  };
}

/**
 * Share of the length travelled on ground already used *in the opposite
 * direction* (classic out-and-back). Cells store the heading of the first
 * visit; a later visit with a heading ~180° apart counts as out-and-back.
 */
export function computeOutAndBackRatio(points: readonly LatLng[], cellM = 40): number {
  if (points.length < 3) return 0;
  const lat0 = points[0]!.lat;
  const mLat = 111_320;
  const mLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const cellOf = (p: LatLng) => `${Math.floor((p.lat * mLat) / cellM)}:${Math.floor((p.lng * mLng) / cellM)}`;
  const headings = new Map<string, { heading: number; index: number }>();
  let total = 0;
  let back = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = haversineDistance(a, b);
    if (len <= 0) continue;
    total += len;
    const h = bearing(a, b);
    const id = cellOf(b);
    const seen = headings.get(id);
    if (seen && i - seen.index > 3) {
      // Absolute angle between the two headings, in [0, 180]: ~180 means the opposite direction.
      const angle = Math.abs(((h - seen.heading + 540) % 360) - 180);
      if (angle > 135) back += len;
    } else if (!seen) {
      headings.set(id, { heading: h, index: i });
    }
  }
  return total > 0 ? Math.min(1, back / total) : 0;
}

/** Counts direction reversals (> 150° within ~60 m), which usually mean dead ends or artificial detours. */
export function countUTurns(points: readonly LatLng[], windowM = 60): number {
  let count = 0;
  let lastTurnIndex = -10;
  let i = 1;
  while (i < points.length - 1) {
    // Heading over a window before and after point i.
    let j = i;
    let before = 0;
    while (j > 0 && before < windowM) {
      before += haversineDistance(points[j - 1]!, points[j]!);
      j--;
    }
    let k = i;
    let after = 0;
    while (k < points.length - 1 && after < windowM) {
      after += haversineDistance(points[k]!, points[k + 1]!);
      k++;
    }
    if (before >= 20 && after >= 20) {
      const h1 = bearing(points[j]!, points[i]!);
      const h2 = bearing(points[i]!, points[k]!);
      const diff = Math.abs(((h2 - h1 + 540) % 360) - 180);
      if (diff > 150 && i - lastTurnIndex > 5) {
        count++;
        lastTurnIndex = i;
      }
    }
    i++;
  }
  return count;
}

function compatibility(segments: readonly RouteSegment[] | undefined, profile: ActivityProfile): number {
  if (!segments || segments.length === 0) return 0.5;
  let total = 0;
  let weighted = 0;
  for (const s of segments) {
    if (s.way === "other" && s.surface === "unknown") continue;
    total += s.lengthM;
    weighted += s.lengthM * (profile.wayAffinity[s.way] * 0.6 + profile.surfaceAffinity[s.surface] * 0.4);
  }
  return total > 0 ? clamp(weighted / total, 0, 1) : 0.5;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
