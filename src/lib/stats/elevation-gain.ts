import type { RoutePoint } from "@/lib/types";

export interface ElevationGain {
  ascentM: number;
  descentM: number;
  minEleM?: number;
  maxEleM?: number;
  maxGradientPct?: number;
  hasElevation: boolean;
}

/**
 * Computes cumulated ascent / descent with a hysteresis threshold so that
 * DEM noise (±1–2 m jitter) is not counted as climbing. `thresholdM` is the
 * minimum elevation change that counts as a real climb / descent segment.
 */
export function computeElevationGain(points: readonly RoutePoint[], thresholdM = 5): ElevationGain {
  const withEle = points.filter((p) => typeof p.ele === "number");
  if (withEle.length < 2) {
    return { ascentM: 0, descentM: 0, hasElevation: false };
  }

  let ascent = 0;
  let descent = 0;
  let min = Infinity;
  let max = -Infinity;
  let reference = withEle[0]!.ele!;

  for (const p of withEle) {
    const ele = p.ele!;
    if (ele < min) min = ele;
    if (ele > max) max = ele;
    const delta = ele - reference;
    if (delta >= thresholdM) {
      ascent += delta;
      reference = ele;
    } else if (delta <= -thresholdM) {
      descent += -delta;
      reference = ele;
    }
  }

  return {
    ascentM: Math.round(ascent),
    descentM: Math.round(descent),
    minEleM: Math.round(min),
    maxEleM: Math.round(max),
    maxGradientPct: computeMaxGradient(withEle, 100),
    hasElevation: true,
  };
}

/** Steepest average gradient (%) over windows of at least `windowM` metres. */
export function computeMaxGradient(points: readonly RoutePoint[], windowM: number): number | undefined {
  if (points.length < 2) return undefined;
  let maxGrad = 0;
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    while (j < points.length && points[j]!.dist - points[i]!.dist < windowM) j++;
    if (j >= points.length) break;
    const a = points[i]!;
    const b = points[j]!;
    const run = b.dist - a.dist;
    if (run <= 0 || a.ele === undefined || b.ele === undefined) continue;
    const grad = Math.abs((b.ele - a.ele) / run) * 100;
    if (grad > maxGrad) maxGrad = grad;
  }
  return Math.round(maxGrad * 10) / 10;
}

/** Moving-average smoothing of the elevation channel (window in points). */
export function smoothElevation(points: readonly RoutePoint[], window = 3): RoutePoint[] {
  if (window <= 1) return [...points];
  const half = Math.floor(window / 2);
  return points.map((p, i) => {
    if (p.ele === undefined) return p;
    let sum = 0;
    let n = 0;
    for (let k = i - half; k <= i + half; k++) {
      const q = points[k];
      if (q && q.ele !== undefined) {
        sum += q.ele;
        n++;
      }
    }
    return { ...p, ele: n > 0 ? sum / n : p.ele };
  });
}
