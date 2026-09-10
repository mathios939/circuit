import type { RoutePoint } from "@/lib/types";

/**
 * Elevation gain / loss.
 *
 * Method (documented in README → "Dénivelé") :
 * 1. the elevation channel is *filtered* — a moving median (window 5) removes
 *    isolated spikes of the digital elevation model, then a short moving
 *    average (window 3) smooths interpolation steps;
 * 2. climbing is accumulated with a *hysteresis* threshold: an ascent (or a
 *    descent) is only counted once the elevation has moved by at least
 *    `thresholdM` from the last confirmed extremum. Small oscillations
 *    (±1–2 m, typical DEM / GPS noise) therefore never add up.
 *
 * The raw (unfiltered, threshold 0) gain is also returned so that the two can
 * be compared in the debug panel and in tests.
 */
export interface ElevationGain {
  ascentM: number;
  descentM: number;
  /** Ascent accumulated on the raw channel without any filtering, for comparison. */
  ascentRawM: number;
  minEleM?: number;
  maxEleM?: number;
  maxGradientPct?: number;
  hasElevation: boolean;
}

export const DEFAULT_GAIN_THRESHOLD_M = 4;

export function computeElevationGain(points: readonly RoutePoint[], thresholdM = DEFAULT_GAIN_THRESHOLD_M): ElevationGain {
  const withEle = points.filter((p): p is RoutePoint & { ele: number } => typeof p.ele === "number" && Number.isFinite(p.ele));
  if (withEle.length < 2) {
    return { ascentM: 0, descentM: 0, ascentRawM: 0, hasElevation: false };
  }

  const raw = withEle.map((p) => p.ele);
  const filtered = filterElevationSeries(raw);

  let min = Infinity;
  let max = -Infinity;
  for (const e of filtered) {
    if (e < min) min = e;
    if (e > max) max = e;
  }

  const { ascent, descent } = accumulateWithHysteresis(filtered, thresholdM);
  const rawGain = accumulateWithHysteresis(raw, 0);
  const filteredPoints = withEle.map((p, i) => ({ ...p, ele: filtered[i]! }));

  return {
    ascentM: Math.round(ascent),
    descentM: Math.round(descent),
    ascentRawM: Math.round(rawGain.ascent),
    minEleM: Math.round(min),
    maxEleM: Math.round(max),
    maxGradientPct: computeMaxGradient(filteredPoints, 100),
    hasElevation: true,
  };
}

/** Accumulates gain/loss counting only excursions larger than the threshold. */
export function accumulateWithHysteresis(series: readonly number[], thresholdM: number): { ascent: number; descent: number } {
  let ascent = 0;
  let descent = 0;
  if (series.length < 2) return { ascent, descent };
  let reference = series[0]!;
  let direction: 1 | -1 | 0 = 0;
  let extremum = series[0]!;
  for (let i = 1; i < series.length; i++) {
    const e = series[i]!;
    if (direction >= 0 && e > extremum) extremum = e;
    if (direction <= 0 && e < extremum) extremum = e;
    if (direction === 0) {
      if (e - reference >= thresholdM) {
        direction = 1;
        extremum = e;
      } else if (reference - e >= thresholdM) {
        direction = -1;
        extremum = e;
      }
      continue;
    }
    if (direction === 1) {
      if (e > extremum) extremum = e;
      if (extremum - e >= thresholdM) {
        ascent += extremum - reference;
        reference = extremum;
        direction = -1;
        extremum = e;
      }
    } else {
      if (e < extremum) extremum = e;
      if (e - extremum >= thresholdM) {
        descent += reference - extremum;
        reference = extremum;
        direction = 1;
        extremum = e;
      }
    }
  }
  // Close the last open excursion.
  if (direction === 1 && extremum > reference) ascent += extremum - reference;
  if (direction === -1 && extremum < reference) descent += reference - extremum;
  return { ascent, descent };
}

/** Moving median (window 5) followed by a moving average (window 3). */
export function filterElevationSeries(series: readonly number[]): number[] {
  if (series.length < 5) return [...series];
  const median = movingMedian(series, 5);
  return movingMean(median, 3);
}

/** Symmetric windows shrink near the ends so that the first / last values are never distorted. */
export function movingMedian(series: readonly number[], window: number): number[] {
  const maxHalf = Math.floor(window / 2);
  return series.map((_, i) => {
    const half = Math.min(maxHalf, i, series.length - 1 - i);
    const slice: number[] = [];
    for (let k = i - half; k <= i + half; k++) slice.push(series[k]!);
    slice.sort((a, b) => a - b);
    const mid = slice.length >> 1;
    return slice.length % 2 === 1 ? slice[mid]! : (slice[mid - 1]! + slice[mid]!) / 2;
  });
}

export function movingMean(series: readonly number[], window: number): number[] {
  const maxHalf = Math.floor(window / 2);
  return series.map((_, i) => {
    const half = Math.min(maxHalf, i, series.length - 1 - i);
    let sum = 0;
    let n = 0;
    for (let k = i - half; k <= i + half; k++) {
      sum += series[k]!;
      n++;
    }
    return sum / n;
  });
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

/** Applies the elevation filter to route points (keeps positions and distances). */
export function smoothElevation(points: readonly RoutePoint[]): RoutePoint[] {
  const indices: number[] = [];
  const series: number[] = [];
  points.forEach((p, i) => {
    if (typeof p.ele === "number" && Number.isFinite(p.ele)) {
      indices.push(i);
      series.push(p.ele);
    }
  });
  if (series.length < 5) return [...points];
  const filtered = filterElevationSeries(series);
  const out = [...points];
  indices.forEach((pointIndex, k) => {
    out[pointIndex] = { ...out[pointIndex]!, ele: Math.round(filtered[k]! * 10) / 10 };
  });
  return out;
}
