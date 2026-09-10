"use client";

import { getStyleDescriptions, getStyleLabels } from "@/lib/activities/profiles";
import { formatDistance, formatDurationApprox, formatElevation, formatPercent } from "@/lib/utils/format";
import { useRouteStore } from "@/store/route-store";

const LETTERS = ["A", "B", "C", "D", "E"];

/**
 * Comparison of the generated proposals: one card per variant plus a compact
 * side-by-side table (distance, D+, duration, road / trail shares, score).
 * Clicking a card shows that route on the map.
 */
export function RouteVariantList() {
  const routes = useRouteStore((s) => s.routes);
  const selectedId = useRouteStore((s) => s.selectedId);
  const select = useRouteStore((s) => s.selectRoute);
  if (routes.length === 0) return null;
  const labels = getStyleLabels(routes[0]!.activity);
  const descriptions = getStyleDescriptions(routes[0]!.activity);
  const hasSurface = routes.some((r) => r.stats.surfaceCoverage > 0.3);

  return (
    <div className="space-y-3" data-testid="variant-list">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(3, routes.length)}, minmax(0, 1fr))` }}>
        {routes.map((route, i) => {
          const active = route.id === selectedId;
          return (
            <button
              key={route.id}
              type="button"
              onClick={() => select(route.id)}
              aria-pressed={active}
              data-testid="variant-card"
              className={`rounded-xl border p-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                active ? "border-ink-900 bg-ink-900 text-white shadow-panel" : "border-ink-200 bg-white text-ink-900 hover:border-ink-400"
              }`}
            >
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${active ? "text-white/70" : "text-ink-500"}`}>{LETTERS[i]}</span>
              <span className="block text-sm font-semibold leading-tight">{labels[route.style]}</span>
              <span className={`mt-1 block text-xs tabular-nums ${active ? "text-white/80" : "text-ink-500"}`}>
                {formatDistance(route.stats.distanceM)} · {route.stats.hasElevation ? formatElevation(route.stats.ascentM, "+") : "D+ n/d"}
              </span>
            </button>
          );
        })}
      </div>

      {routes.length > 1 ? (
        <table className="w-full text-xs" data-testid="variant-table">
          <caption className="sr-only">Comparaison des propositions</caption>
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-ink-500">
              <th scope="col" className="py-1 text-left font-semibold"></th>
              {routes.map((r, i) => (
                <th key={r.id} scope="col" className={`py-1 text-right font-semibold ${r.id === selectedId ? "text-ink-900" : ""}`}>
                  {LETTERS[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 text-ink-700">
            <Row label="Distance" values={routes.map((r) => formatDistance(r.stats.distanceM))} selected={routes.map((r) => r.id === selectedId)} />
            <Row label="D+" values={routes.map((r) => (r.stats.hasElevation ? formatElevation(r.stats.ascentM, "+") : "–"))} selected={routes.map((r) => r.id === selectedId)} />
            <Row label="Durée" values={routes.map((r) => formatDurationApprox(r.stats.durationS))} selected={routes.map((r) => r.id === selectedId)} />
            {hasSurface ? (
              <>
                <Row label="Route" values={routes.map((r) => (r.stats.surfaceCoverage > 0.3 ? formatPercent(r.stats.surfaces.paved) : "–"))} selected={routes.map((r) => r.id === selectedId)} />
                <Row label="Chemins" values={routes.map((r) => (r.stats.surfaceCoverage > 0.3 ? formatPercent(r.stats.surfaces.gravel + r.stats.surfaces.trail) : "–"))} selected={routes.map((r) => r.id === selectedId)} />
              </>
            ) : null}
            <Row label="Score" values={routes.map((r) => `${r.score.total}`)} selected={routes.map((r) => r.id === selectedId)} strong />
          </tbody>
        </table>
      ) : null}

      <p className="text-[11px] text-ink-500">{descriptions[routes.find((r) => r.id === selectedId)?.style ?? "balanced"]}</p>
    </div>
  );
}

function Row({ label, values, selected, strong }: { label: string; values: string[]; selected: boolean[]; strong?: boolean }) {
  return (
    <tr>
      <th scope="row" className="py-1 text-left font-medium text-ink-500">
        {label}
      </th>
      {values.map((v, i) => (
        <td key={i} className={`py-1 text-right tabular-nums ${selected[i] ? "font-semibold text-ink-900" : ""} ${strong ? "font-semibold" : ""}`}>
          {v}
        </td>
      ))}
    </tr>
  );
}
