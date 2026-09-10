import type { LatLng } from "@/lib/types";
import { haversineDistance } from "@/lib/geo";

/**
 * Geometric similarity between two routes, 0 (nothing in common) to 1
 * (same ground). Both geometries are rasterised on a ~`cellM` grid; the
 * result is the share of each route's length that lies in cells also used by
 * the other one (symmetric average). Direction is ignored: an identical loop
 * ridden the other way round scores 1.
 */
export function routeSimilarity(a: readonly LatLng[], b: readonly LatLng[], cellM = 50): number {
  if (a.length < 2 || b.length < 2) return 0;
  const lat0 = a[0]!.lat;
  const mLat = 111_320;
  const mLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const cell = (p: LatLng) => `${Math.floor((p.lat * mLat) / cellM)}:${Math.floor((p.lng * mLng) / cellM)}`;

  const cellsOf = (pts: readonly LatLng[]): { cells: Set<string>; lengths: number[]; ids: string[] } => {
    const cells = new Set<string>();
    const lengths: number[] = [];
    const ids: string[] = [];
    for (let i = 1; i < pts.length; i++) {
      const from = pts[i - 1]!;
      const to = pts[i]!;
      const len = haversineDistance(from, to);
      // Densify long segments so that every crossed cell is registered.
      const steps = Math.max(1, Math.ceil(len / cellM));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const id = cell({ lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t });
        cells.add(id);
        ids.push(id);
        lengths.push(len / steps);
      }
    }
    return { cells, lengths, ids };
  };

  const A = cellsOf(a);
  const B = cellsOf(b);
  // Tolerate neighbouring cells (parallel lanes / slight offsets).
  const near = (set: Set<string>, id: string): boolean => {
    if (set.has(id)) return true;
    const [x, y] = id.split(":").map(Number) as [number, number];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (set.has(`${x + dx}:${y + dy}`)) return true;
    return false;
  };
  const shared = (src: typeof A, other: Set<string>): number => {
    let total = 0;
    let common = 0;
    src.ids.forEach((id, i) => {
      total += src.lengths[i]!;
      if (near(other, id)) common += src.lengths[i]!;
    });
    return total > 0 ? common / total : 0;
  };
  return Math.min(1, (shared(A, B.cells) + shared(B, A.cells)) / 2);
}
