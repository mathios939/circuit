"use client";

import type { RouteResult, RouteStyle } from "@/lib/types";
import { formatDistance, formatDuration, formatElevation, formatPercent } from "@/lib/utils/format";
import { Chip } from "@/components/ui/Feedback";
import { useRouteStore } from "@/store/route-store";

const STYLE_LABELS: Record<RouteStyle, string> = { fast: "Rapide", balanced: "Équilibrée", adventure: "Aventure" };
const LETTERS = ["A", "B", "C", "D", "E"];

/** Side-by-side comparison of the generated variants; clicking one shows it on the map. */
export function RouteVariantList() {
  const routes = useRouteStore((s) => s.routes);
  const selectedId = useRouteStore((s) => s.selectedId);
  const select = useRouteStore((s) => s.selectRoute);
  if (routes.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="variant-list">
      {routes.map((route, i) => (
        <VariantCard key={route.id} route={route} letter={LETTERS[i] ?? String(i + 1)} active={route.id === selectedId} onSelect={() => select(route.id)} />
      ))}
    </div>
  );
}

function VariantCard({ route, letter, active, onSelect }: { route: RouteResult; letter: string; active: boolean; onSelect(): void }) {
  const s = route.stats;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid="variant-card"
      className={`w-full rounded-xl border p-3 text-left transition-all ${active ? "border-ink-900 bg-white shadow-panel ring-1 ring-ink-900" : "border-ink-200 bg-white hover:border-ink-300"}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${active ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700"}`}>{letter}</span>
          <span className="text-sm font-semibold text-ink-900">{STYLE_LABELS[route.style]}</span>
        </div>
        <Chip tone={route.score.total >= 70 ? "positive" : "neutral"}>Score {route.score.total}</Chip>
      </div>
      <dl className="grid grid-cols-4 gap-1 text-center">
        <Stat label="Distance" value={formatDistance(s.distanceM)} />
        <Stat label="D+" value={s.hasElevation ? formatElevation(s.ascentM, "+") : "–"} />
        <Stat label="Durée" value={formatDuration(s.durationS)} />
        <Stat label="Asphalte" value={s.surfaceCoverage > 0.3 ? formatPercent(s.surfaces.paved) : "–"} />
      </dl>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-ink-900">{value}</dd>
    </div>
  );
}
