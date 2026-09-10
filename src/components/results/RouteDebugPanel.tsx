"use client";

import type { RouteResult } from "@/lib/types";
import { formatDistance, formatElevation } from "@/lib/utils/format";
import { useRouteStore } from "@/store/route-store";

/** True outside production builds, or when explicitly enabled. */
export const DEBUG_ROUTES_ENABLED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_ROUTES === "true";

/**
 * Development-only technical view of a route: provider, waypoints, candidate
 * scores, quality report, DNA, point count and timings. Invaluable to tune
 * the loop generator; never shown in production unless opted in.
 */
export function RouteDebugPanel({ route }: { route: RouteResult }) {
  const timings = useRouteStore((s) => s.lastTimings);
  if (!DEBUG_ROUTES_ENABLED) return null;
  const q = route.quality;
  const d = route.debug;
  return (
    <details className="rounded-xl border border-dashed border-ink-300 bg-ink-50 p-3 text-xs text-ink-700" data-testid="route-debug">
      <summary className="cursor-pointer select-none font-semibold text-ink-900">Debug (développement)</summary>
      <dl className="mt-2 grid grid-cols-[130px_1fr] gap-x-2 gap-y-1">
        <Row k="Provider" v={route.provider} />
        <Row k="Style" v={route.style} />
        <Row k="Stratégie" v={d?.strategy ?? "–"} />
        <Row k="Cap" v={d?.bearing !== undefined ? `${d.bearing}°` : "–"} />
        <Row k="Itérations" v={d?.iterations ?? "–"} />
        <Row k="Score candidat" v={d?.candidateScore ?? "–"} />
        <Row k="Erreur distance" v={d?.distanceError !== undefined ? `${(d.distanceError * 100).toFixed(1)} %` : "–"} />
        <Row k="Score qualité" v={q ? `${q.qualityScore}${q.rejected ? " (rejeté)" : ""}` : "–"} />
        <Row k="Précision distance" v={q ? q.distanceAccuracy.toFixed(3) : "–"} />
        <Row k="Recouvrement" v={q ? `${Math.round(q.overlapRatio * 100)} %` : "–"} />
        <Row k="Aller-retour" v={q ? `${Math.round(q.outAndBackRatio * 100)} %` : "–"} />
        <Row k="Demi-tours" v={q?.uTurnCount ?? "–"} />
        <Row k="Éloignement max" v={q ? formatDistance(q.maxDistanceFromStartM) : "–"} />
        <Row k="Compatibilité" v={q ? q.activityCompatibility.toFixed(2) : "–"} />
        <Row k="Score total" v={route.score.total} />
        <Row k="Route DNA" v={`N${route.dna.nature} C${route.dna.calm} D${route.dna.difficulty} T${route.dna.technical} P${route.dna.panorama}`} />
        <Row k="Points" v={d?.pointCount ?? route.points.length} />
        <Row k="Waypoints" v={route.waypoints.map((w) => `${w.kind[0]}:${w.lat.toFixed(4)},${w.lng.toFixed(4)}`).join(" · ")} />
        <Row k="D+ brut / filtré" v={route.stats.hasElevation ? `${formatElevation(d?.rawAscentM ?? 0)} / ${formatElevation(route.stats.ascentM)}` : "–"} />
        <Row k="Instructions" v={route.instructions ? `${route.instructions.length}` : "aucune"} />
        <Row k="Temps route" v={d?.timings ? `details ${d.timings.details ?? "–"} ms · altitude ${d.timings.elevation ?? "–"} ms · scoring ${d.timings.scoring ?? "–"} ms` : "–"} />
        <Row k="Temps génération" v={timings ? Object.entries(timings).map(([k, v]) => `${k} ${v}${k.startsWith("routing") || k.startsWith("candidates") ? "" : " ms"}`).join(" · ") : "–"} />
        {q && q.reasons.length > 0 ? <Row k="Raisons" v={q.reasons.join(" ; ")} /> : null}
      </dl>
    </details>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <>
      <dt className="text-ink-500">{k}</dt>
      <dd className="break-words font-mono text-[11px] text-ink-900">{v}</dd>
    </>
  );
}
