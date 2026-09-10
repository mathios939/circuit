import type { LatLng } from "@/lib/types";
import { destinationPoint, haversineDistance } from "@/lib/geo";

/**
 * Loop candidate shapes. A shape describes via points *relative to the
 * start*: each via point sits at `bearing + angle` degrees and
 * `radiusM × factor` metres from the start. The polygon start → vias → start
 * is then routed by the engine; its perimeter grows linearly with `radiusM`,
 * which is what the distance refinement adjusts.
 *
 * Several strategies avoid the "every loop is a triangle" effect:
 * - radial_triangle / radial_quad: compact, rounded loops;
 * - biased_loop: asymmetric (egg-shaped) loops;
 * - directional_loop: elongated loops going out along a bearing and coming
 *   back on a parallel corridor (valleys, coastlines, river banks).
 */
export type LoopStrategy = "radial_triangle" | "radial_quad" | "biased_loop" | "directional_loop" | "wide_loop";

export interface LoopVia {
  /** Angle relative to the main bearing, degrees. */
  angle: number;
  /** Distance factor applied to the radius. */
  factor: number;
}

export interface LoopShape {
  strategy: LoopStrategy;
  /** Compass bearing (degrees) of the loop's main axis, from the start. */
  bearing: number;
  /** Scale of the loop in metres (distance factor 1). */
  radiusM: number;
  clockwise: boolean;
  vias: LoopVia[];
}

/** Via templates per strategy (angles for a counter-clockwise traversal). */
export const STRATEGY_TEMPLATES: Record<LoopStrategy, LoopVia[]> = {
  radial_triangle: [
    { angle: -38, factor: 1 },
    { angle: 38, factor: 1 },
  ],
  radial_quad: [
    { angle: -42, factor: 0.85 },
    { angle: 0, factor: 1.12 },
    { angle: 42, factor: 0.85 },
  ],
  biased_loop: [
    { angle: -58, factor: 0.68 },
    { angle: -12, factor: 1.15 },
    { angle: 34, factor: 0.92 },
  ],
  directional_loop: [
    { angle: -16, factor: 0.62 },
    { angle: -6, factor: 1.22 },
    { angle: 9, factor: 1.24 },
    { angle: 22, factor: 0.64 },
  ],
  wide_loop: [
    { angle: -62, factor: 0.66 },
    { angle: -24, factor: 1 },
    { angle: 22, factor: 1 },
    { angle: 62, factor: 0.66 },
  ],
};

export const LOOP_STRATEGIES: LoopStrategy[] = ["radial_triangle", "radial_quad", "biased_loop", "directional_loop", "wide_loop"];

/**
 * Empirical ratio between the real road distance of a loop and the perimeter
 * of the polygon drawn through its via points. Tuned for street networks;
 * the generator adapts it after the first routing pass anyway.
 */
export const DEFAULT_DETOUR_FACTOR = 1.25;

/** Via points in traversal order (mirrored when clockwise). */
export function loopViaPoints(start: LatLng, shape: LoopShape): LatLng[] {
  const vias = shape.clockwise ? [...shape.vias].reverse().map((v) => ({ angle: -v.angle, factor: v.factor })) : shape.vias;
  return vias.map((v) => destinationPoint(start, (shape.bearing + v.angle + 360) % 360, shape.radiusM * v.factor));
}

/** Straight-line perimeter of start → vias → start for the given shape. */
export function shapePerimeter(start: LatLng, shape: LoopShape): number {
  const pts = [start, ...loopViaPoints(start, shape), start];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += haversineDistance(pts[i - 1]!, pts[i]!);
  return total;
}

/** Radius giving approximately `targetM` of road distance for a strategy. */
export function radiusForDistance(start: LatLng, targetM: number, strategy: LoopStrategy, bearing = 0, detourFactor = DEFAULT_DETOUR_FACTOR): number {
  const unit: LoopShape = { strategy, bearing, radiusM: 1000, clockwise: false, vias: STRATEGY_TEMPLATES[strategy] };
  const perimeterPerKm = shapePerimeter(start, unit) / 1000;
  return targetM / (perimeterPerKm * detourFactor);
}

/** Evenly spread bearings starting from a seeded offset. */
export function spreadBearings(count: number, seedOffset: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push((seedOffset + (360 / count) * i) % 360);
  return out;
}

/**
 * Builds `count` initial shapes mixing bearings and strategies so that
 * candidates differ in direction *and* in silhouette.
 */
export function initialShapes(start: LatLng, targetM: number, count: number, rnd: () => number): LoopShape[] {
  const bearings = spreadBearings(count, rnd() * 360);
  return bearings.map((bearing, i) => {
    const strategy = LOOP_STRATEGIES[i % LOOP_STRATEGIES.length]!;
    return {
      strategy,
      bearing,
      radiusM: radiusForDistance(start, targetM, strategy, bearing),
      clockwise: rnd() < 0.5,
      vias: STRATEGY_TEMPLATES[strategy],
    };
  });
}
