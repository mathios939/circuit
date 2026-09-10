"use client";

import { ArrowLeft } from "lucide-react";
import { ErrorBanner, InfoNote } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { Disclaimer } from "@/components/layout/Disclaimer";
import { AdjustButtons } from "./AdjustButtons";
import { ElevationProfile } from "./ElevationProfile";
import { GenerationProgressView } from "./GenerationProgress";
import { RouteActions } from "./RouteActions";
import { RouteDebugPanel } from "./RouteDebugPanel";
import { RouteDNA } from "./RouteDNA";
import { RouteInsights } from "./RouteInsights";
import { RouteStats } from "./RouteStats";
import { RouteSummary } from "./RouteSummary";
import { RouteVariantList } from "./RouteVariantList";
import { useRouteStore, useSelectedRoute } from "@/store/route-store";

/**
 * The "Résultats" tab: headline summary, proposals comparison, actions,
 * editing, elevation profile, Route DNA, then secondary information.
 */
export function ResultsPanel() {
  const status = useRouteStore((s) => s.status);
  const error = useRouteStore((s) => s.error);
  const errorHint = useRouteStore((s) => s.errorHint);
  const notes = useRouteStore((s) => s.notes);
  const distanceMismatch = useRouteStore((s) => s.distanceMismatch);
  const routes = useRouteStore((s) => s.routes);
  const editing = useRouteStore((s) => s.editing);
  const setPanelTab = useRouteStore((s) => s.setPanelTab);
  const clear = useRouteStore((s) => s.clearResults);
  const route = useSelectedRoute();

  if (status === "loading") return <GenerationProgressView />;

  if (status === "error" && error) {
    return (
      <div className="space-y-3">
        <ErrorBanner message={error} hint={errorHint ?? undefined} />
        <Button
          block
          onClick={() => {
            clear();
            setPanelTab("create");
          }}
          icon={<ArrowLeft className="h-4 w-4" />}
        >
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
      {distanceMismatch ? (
        <div role="status" data-testid="distance-mismatch" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">
            Nous n&apos;avons pas trouvé de parcours de {distanceMismatch.requestedKm} km suffisamment qualitatif. Meilleure proposition : {distanceMismatch.bestKm.toLocaleString("fr-FR")} km.
          </p>
          <p className="mt-1 text-xs text-amber-800">Vous pouvez la garder telle quelle, l&apos;ajuster ci-dessous, ou modifier la demande.</p>
          <div className="mt-2">
            <Button size="sm" onClick={() => setPanelTab("create")} icon={<ArrowLeft className="h-3.5 w-3.5" />}>
              Modifier la demande
            </Button>
          </div>
        </div>
      ) : null}
      {notes.map((n) => (
        <InfoNote key={n}>{n}</InfoNote>
      ))}

      <RouteSummary route={route} />
      {routes.length > 1 ? <RouteVariantList /> : null}
      <h2 className="text-sm font-semibold leading-tight text-ink-900" data-testid="route-name">
        {route.name}
      </h2>
      <RouteActions route={route} />
      {editing ? <EditorToolbar route={route} /> : null}
      <ElevationProfile route={route} />
      <RouteDNA dna={route.dna} activity={route.activity} />
      <AdjustButtons route={route} />
      <RouteStats route={route} />
      <RouteInsights insights={route.insights} score={route.score} />
      <Disclaimer activity={route.activity} compact />
      <RouteDebugPanel route={route} />
      <button type="button" onClick={() => setPanelTab("create")} className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-3.5 w-3.5" /> Nouvelle demande
      </button>
    </div>
  );
}
