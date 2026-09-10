"use client";

import type { RouteResult } from "@/lib/types";
import { DIFFICULTY_LABELS } from "@/lib/stats/difficulty";
import { formatDurationApprox, formatElevation, formatPercent } from "@/lib/utils/format";

const DIFFICULTY_TONE = { easy: "bg-brand-50 text-brand-700", moderate: "bg-amber-50 text-amber-800", hard: "bg-orange-50 text-orange-800", expert: "bg-red-50 text-red-800" } as const;

/**
 * Secondary details of a route (the headline numbers live in RouteSummary):
 * descent, gradients, altitudes, estimated duration and surface breakdown.
 */
export function RouteStats({ route }: { route: RouteResult }) {
  const s = route.stats;
  return (
    <div className="space-y-3" data-testid="route-stats">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Détails</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-ink-50 p-3 text-sm">
        <Row label="Type" value={route.mode === "loop" ? "Boucle" : "Point à point"} />
        <Row label="Difficulté">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DIFFICULTY_TONE[s.difficulty]}`}>{DIFFICULTY_LABELS[s.difficulty]}</span>
        </Row>
        <Row label="Durée estimée" value={formatDurationApprox(s.durationS)} />
        <Row label="Dénivelé −" value={s.hasElevation ? formatElevation(s.descentM, "-") : "–"} />
        <Row label="Pente max" value={s.maxGradientPct !== undefined ? `${s.maxGradientPct.toFixed(0)} %` : "–"} />
        <Row label="D+ par km" value={s.hasElevation ? `${Math.round(s.ascentM / Math.max(0.1, s.distanceM / 1000))} m` : "–"} />
        <Row label="Alt. min" value={s.minEleM !== undefined ? formatElevation(s.minEleM) : "–"} />
        <Row label="Alt. max" value={s.maxEleM !== undefined ? formatElevation(s.maxEleM) : "–"} />
      </dl>
      <p className="text-[11px] text-ink-500">
        {s.hasElevation
          ? "Dénivelé calculé à partir d'un modèle numérique de terrain (précision ± 10 %). La durée est une estimation selon l'activité, le dénivelé et le terrain."
          : "Altitudes indisponibles pour ce parcours : la durée est estimée à partir de la distance seule."}
      </p>
      <SurfaceBar route={route} />
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-medium tabular-nums text-ink-900">{children ?? value}</dd>
    </div>
  );
}

function SurfaceBar({ route }: { route: RouteResult }) {
  const s = route.stats.surfaces;
  const known = route.stats.surfaceCoverage;
  if (known < 0.3) {
    return <p className="text-xs text-ink-500">Revêtement non renseigné par le moteur de routing.</p>;
  }
  const parts = [
    { label: "Asphalte", share: s.paved, color: "bg-ink-700" },
    { label: "Piste / gravier", share: s.gravel, color: "bg-amber-500" },
    { label: "Chemin / sentier", share: s.trail, color: "bg-brand-500" },
    { label: "Inconnu", share: s.unknown, color: "bg-ink-200" },
  ].filter((p) => p.share > 0.005);
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Surface approximative</p>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100" role="img" aria-label={parts.map((p) => `${p.label} ${formatPercent(p.share)}`).join(", ")}>
        {parts.map((p) => (
          <div key={p.label} className={p.color} style={{ width: `${p.share * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-700">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${p.color}`} /> {formatPercent(p.share)} {p.label.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
