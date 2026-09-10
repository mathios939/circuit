"use client";

import { ArrowLeft } from "lucide-react";
import { ErrorBanner, InfoNote } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { AdjustButtons } from "./AdjustButtons";
import { ElevationProfile } from "./ElevationProfile";
import { ExportMenu } from "./ExportMenu";
import { GenerationProgressView } from "./GenerationProgress";
import { RouteDebugPanel } from "./RouteDebugPanel";
import { RouteDNA } from "./RouteDNA";
import { RouteInsights } from "./RouteInsights";
import { RouteStats } from "./RouteStats";
import { RouteVariantList } from "./RouteVariantList";
import { useRouteStore, useSelectedRoute } from "@/store/route-store";

/** The "Résultats" tab: variants comparison, details of the selected one, editing and export. */
export function ResultsPanel() {
  const status = useRouteStore((s) => s.status);
  const error = useRouteStore((s) => s.error);
  const notes = useRouteStore((s) => s.notes);
  const routes = useRouteStore((s) => s.routes);
  const setPanelTab = useRouteStore((s) => s.setPanelTab);
  const clear = useRouteStore((s) => s.clearResults);
  const route = useSelectedRoute();

  if (status === "loading") return <GenerationProgressView />;

  if (status === "error" && error) {
    return (
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Button block onClick={() => { clear(); setPanelTab("create"); }} icon={<ArrowLeft className="h-4 w-4" />}>
          Modifier la demande
        </Button>
      </div>
    );
  }

  if (routes.length === 0 || !route) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-ink-500">Aucun parcours pour le moment.</p>
        <Button onClick={() => setPanelTab("create")} icon={<ArrowLeft className="h-4 w-4" />}>
          Créer un parcours
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {notes.map((n) => (
        <InfoNote key={n}>{n}</InfoNote>
      ))}
      {routes.length > 1 ? <RouteVariantList /> : null}
      <h2 className="text-base font-semibold leading-tight text-ink-900" data-testid="route-name">
        {route.name}
      </h2>
      <RouteStats route={route} />
      <ElevationProfile route={route} />
      <EditorToolbar route={route} />
      <AdjustButtons route={route} />
      <RouteInsights insights={route.insights} score={route.score} />
      <RouteDNA dna={route.dna} />
      <ExportMenu route={route} />
      <RouteDebugPanel route={route} />
      <button type="button" onClick={() => setPanelTab("create")} className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-3.5 w-3.5" /> Nouvelle demande
      </button>
    </div>
  );
}
