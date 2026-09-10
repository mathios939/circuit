import type { LatLng } from "@/lib/types";
import { destinationPoint } from "@/lib/geo";

export interface LoopShape {
  /** Compass bearing (degrees) from the start to the centre of the loop. */
  bearing: number;
  /** Radius of the loop in metres. */
  radiusM: number;
  /** Number of intermediate points (2 = triangle, 3 = square-ish). */
  viaCount: 2 | 3;
  /** Direction of travel around the centre. */
  clockwise: boolean;
}

/**
 * Empirical ratio between the real road distance of a loop and the perimeter
 * of the polygon drawn through its via points. Tuned for street networks;
 * the generator adapts it after the first routing pass anyway.
 */
export const DEFAULT_DETOUR_FACTOR = 1.25;

/** Perimeter of the ideal polygon (start + via points on a circle of radius r). */
export function polygonPerimeter(radiusM: number, viaCount: 2 | 3): number {
  const sides = viaCount + 1;
  return sides * 2 * radiusM * Math.sin(Math.PI / sides);
}

/** Radius giving approximately `targetM` of road distance for a shape. */
export function radiusForDistance(targetM: number, viaCount: 2 | 3, detourFactor = DEFAULT_DETOUR_FACTOR): number {
  const sides = viaCount + 1;
  const perimeterPerRadius = sides * 2 * Math.sin(Math.PI / sides);
  return targetM / (perimeterPerRadius * detourFactor);
}

/**
 * Via points of a loop: the start lies on a circle whose centre is `radiusM`
 * away in direction `bearing`; the via points are spread evenly on that
 * circle. The route start → via… → start therefore draws a rounded polygon.
 */
export function loopViaPoints(start: LatLng, shape: LoopShape): LatLng[] {
  const centre = destinationPoint(start, shape.bearing, shape.radiusM);
  // Angle of the start as seen from the centre.
  const startAngle = (shape.bearing + 180) % 360;
  const sides = shape.viaCount + 1;
  const step = 360 / sides;
  const points: LatLng[] = [];
  for (let i = 1; i <= shape.viaCount; i++) {
    const angle = startAngle + (shape.clockwise ? 1 : -1) * step * i;
    points.push(destinationPoint(centre, (angle + 360) % 360, shape.radiusM));
  }
  return points;
}

/** Evenly spread bearings starting from a seeded offset. */
export function spreadBearings(count: number, seedOffset: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push((seedOffset + (360 / count) * i) % 360);
  return out;
}
