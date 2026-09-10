"use client";

import { BuilderForm } from "@/components/builder/BuilderForm";
import { SavedRoutesPanel } from "@/components/library/SavedRoutesPanel";
import { ResultsPanel } from "@/components/results/ResultsPanel";
import { useRouteStore, type PanelTab } from "@/store/route-store";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "create", label: "Créer" },
  { id: "results", label: "Résultats" },
  { id: "library", label: "Mes parcours" },
];

/** Tabbed left panel (desktop) / bottom sheet content (mobile). */
export function BuilderPanel() {
  const tab = useRouteStore((s) => s.panelTab);
  const setTab = useRouteStore((s) => s.setPanelTab);
  const routeCount = useRouteStore((s) => s.routes.length);
  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Sections" className="flex shrink-0 gap-1 border-b border-ink-200 px-4 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? "text-ink-900" : "text-ink-500 hover:text-ink-900"}`}
          >
            {t.label}
            {t.id === "results" && routeCount > 0 ? <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 text-[10px] font-semibold text-brand-700">{routeCount}</span> : null}
            {tab === t.id ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink-900" /> : null}
          </button>
        ))}
      </div>
      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4" role="tabpanel">
        {tab === "create" ? <BuilderForm /> : tab === "results" ? <ResultsPanel /> : <SavedRoutesPanel />}
      </div>
    </div>
  );
}
