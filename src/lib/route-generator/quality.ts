import type { ActivityProfile, LatLng, RouteQualityReport, RouteSegment } from "@/lib/types";
import { bearing, haversineDistance } from "@/lib/geo";
import { clamp } from "@/lib/utils/format";
import { ROUTE_ENGINE } from "./config";
import { computeOverlapRatio } from "./overlap";

const Q = ROUTE_ENGINE.quality;

export interface QualityInput {
  coordinates: readonly LatLng[];
  /** Distance reported by the engine, in metres. */
  distanceM: number;
  targetM?: number;
  start: LatLng;
  /** Waypoints used to build the route, in order (start … end). */
  waypoints: readonly LatLng[];
  isLoop: boolean;
  profile: ActivityProfile;
  segments?: readonly RouteSegment[];
  /** Acceptable distance error ratio (default: ROUTE_ENGINE.distance.maxTolerance). */
  maxDistanceError?: number;
}

/**
 * Post-routing quality gate. A route that the engine happily computed can
 * still be a poor sports route: mostly out-and-back, folded on itself,
 * absurdly short, or built on ways unsuited to the activity.
 *
 * Rules (thresholds in ROUTE_ENGINE.quality):
 * - geometryValid: enough points, finite coordinates, no jump > maxJumpM,
 *   path length consistent with the engine distance, loop closed;
 * - distance: |distance − target| / target ≤ maxDistanceError;
 * - loops: outAndBackRatio ≤ maxOutAndBackRatio and overlapRatio ≤ maxOverlapRatio;
 * - U-turns per km ≤ maxUTurnsPerKm;
 * - loops: farthest point ≥ minExtentRatio × distance (not folded on itself);
 * - activityCompatibility ≥ minActivityCompatibility when surface data exists.
 * The 0..100 qualityScore weights distance accuracy, out-and-back, overlap,
 * U-turns, activity compatibility and waypoint spacing.
 */
export function assessRouteQuality(input: QualityInput): RouteQualityReport {
  const { coordinates, distanceM, targetM, start, profile } = input;
  const reasons: string[] = [];

  // --- geometry sanity ------------------------------------------------------
  let geometryValid = coordinates.length >= Q.minPoints && Number.isFinite(distanceM) && distanceM > Q.minDistanceM;
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
    if (d > Q.maxJumpM) {
      geometryValid = false;
      reasons.push("Saut anormal dans le tracé");
      break;
    }
    pathLength += d;
  }
  if (geometryValid && (pathLength < distanceM * Q.lengthConsistency || pathLength > distanceM / Q.lengthConsistency)) {
    geometryValid = false;
    reasons.push("Longueur de la géométrie incohérente avec la distance annoncée");
  }
  if (geometryValid && input.isLoop && haversineDistance(coordinates[0]!, coordinates[coordinates.length - 1]!) > Q.loopClosureM) {
    geometryValid = false;
    reasons.push("La boucle ne revient pas au départ");
  }

  // --- distance ---------------------------------------------------------------
  const distanceError = targetM ? Math.abs(distanceM - targetM) / targetM : 0;
  const distanceAccuracy = clamp(1 - distanceError, 0, 1);
  const maxDistanceError = input.maxDistanceError ?? ROUTE_ENGINE.distance.maxTolerance;
  const distanceRejected = targetM !== undefined && distanceError > maxDistanceError;
  if (distanceRejected) reasons.push(`Distance hors tolérance (${Math.round(distanceError * 100)} %)`);

  // --- overlap / out-and-back / u-turns ---------------------------------------
  const overlapRatio = computeOverlapRatio(coordinates, Q.cellM);
  const outAndBackRatio = computeOutAndBackRatio(coordinates, Q.cellM);
  const uTurnCount = countUTurns(coordinates, Q.uTurnWindowM, Q.uTurnAngle);
  const uTurnsPerKm = uTurnCount / Math.max(1, distanceM / 1000);
  const shapeRejected = input.isLoop && (outAndBackRatio > Q.maxOutAndBackRatio || overlapRatio > Q.maxOverlapRatio);
  if (input.isLoop && outAndBackRatio > Q.maxOutAndBackRatio) reasons.push(`Trop d'aller-retour (${Math.round(outAndBackRatio * 100)} %)`);
  else if (input.isLoop && overlapRatio > Q.maxOverlapRatio) reasons.push(`Tracé trop souvent répété (${Math.round(overlapRatio * 100)} %)`);
  const uTurnsRejected = uTurnsPerKm > Q.maxUTurnsPerKm;
  if (uTurnsRejected) reasons.push(`Trop de demi-tours (${uTurnCount})`);

  // --- extent -------------------------------------------------------------------
  let maxDistanceFromStartM = 0;
  for (const p of coordinates) {
    const d = haversineDistance(start, p);
    if (d > maxDistanceFromStartM) maxDistanceFromStartM = d;
  }
  const foldedRejected = input.isLoop && geometryValid && maxDistanceFromStartM < distanceM * Q.minExtentRatio;
  if (foldedRejected) reasons.push("Boucle repliée sur elle-même");

  // --- activity compatibility ---------------------------------------------------
  const activityCompatibility = compatibility(input.segments, profile);
  const compatibilityRejected = activityCompatibility < Q.minActivityCompatibility;
  if (compatibilityRejected) reasons.push("Voies peu adaptées à l'activité");

  // --- waypoint spacing ---------------------------------------------------------
  const waypointQuality = computeWaypointQuality(input.waypoints, distanceM, input.isLoop);

  // --- score ----------------------------------------------------------------------
  const w = Q.weights;
  const score =
    distanceAccuracy * w.distance +
    (1 - clamp(outAndBackRatio / Q.maxOutAndBackRatio, 0, 1)) * w.outAndBack +
    (1 - clamp(overlapRatio / Q.maxOverlapRatio, 0, 1)) * w.overlap +
    (1 - clamp(uTurnsPerKm / (Q.maxUTurnsPerKm * 1.5), 0, 1)) * w.uTurns +
    activityCompatibility * w.compatibility +
    waypointQuality * w.waypoints;
  const qualityScore = geometryValid ? Math.round(clamp(score, 0, 100)) : 0;

  const rejected = !geometryValid || distanceRejected || shapeRejected || uTurnsRejected || foldedRejected || compatibilityRejected;

  return {
    distanceAccuracy: round3(distanceAccuracy),
    overlapRatio: round3(overlapRatio),
    outAndBackRatio: round3(outAndBackRatio),
    uTurnCount,
    maxDistanceFromStartM: Math.round(maxDistanceFromStartM),
    waypointCount: input.waypoints.length,
    geometryValid,
    activityCompatibility: round3(activityCompatibility),
    waypointQuality: round3(waypointQuality),
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
export function computeOutAndBackRatio(points: readonly LatLng[], cellM = Q.cellM): number {
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

/** Counts direction reversals (> `angle`° within ~`windowM`), which usually mean dead ends or artificial detours. */
export function countUTurns(points: readonly LatLng[], windowM = Q.uTurnWindowM, angle = Q.uTurnAngle): number {
  let count = 0;
  let lastTurnIndex = -10;
  for (let i = 1; i < points.length - 1; i++) {
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
      if (diff > angle && i - lastTurnIndex > 5) {
        count++;
        lastTurnIndex = i;
      }
    }
  }
  return count;
}

/**
 * 1 when consecutive waypoints are spread along the route (straight-line
 * spacing ≥ minSpacingRatio × distance), decreasing when two of them sit on
 * top of each other, which produces pinched or doubled-back shapes.
 */
export function computeWaypointQuality(waypoints: readonly LatLng[], distanceM: number, isLoop: boolean): number {
  const vias = isLoop ? waypoints.slice(0, -1) : waypoints;
  if (vias.length <= 2 || distanceM <= 0) return 1;
  const minSpacing = distanceM * ROUTE_ENGINE.waypoints.minSpacingRatio;
  let worst = 1;
  for (let i = 0; i < vias.length; i++) {
    for (let j = i + 1; j < vias.length; j++) {
      const d = haversineDistance(vias[i]!, vias[j]!);
      worst = Math.min(worst, clamp(d / minSpacing, 0, 1));
    }
  }
  return worst;
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
