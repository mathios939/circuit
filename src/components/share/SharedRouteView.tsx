"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Download, PencilLine } from "lucide-react";
import { useEffect, useState } from "react";
import type { RouteResult } from "@/lib/types";
import { ACTIVITY_LABELS } from "@/lib/activities/profiles";
import { downloadTextFile, exportRoute } from "@/lib/client/download";
import { waypointsFromTrack } from "@/lib/editor/waypoints";
import { buildRouteResult } from "@/lib/route-generator/build";
import { decodeSharedRoute } from "@/lib/share/encode";
import { getRouteRepository } from "@/lib/storage/local";
import { Button } from "@/components/ui/Button";
import { ElevationProfile } from "@/components/results/ElevationProfile";
import { RouteDNA } from "@/components/results/RouteDNA";
import { RouteStats } from "@/components/results/RouteStats";
import { useRouteStore } from "@/store/route-store";

const RouteMap = dynamic(() => import("@/components/map/RouteMap").then((m) => m.RouteMap), { ssr: false });

/** Read-only presentation of a shared route (map, stats, elevation profile). */
export function SharedRouteView({ id, encoded }: { id: string; encoded: string | null }) {
  const [route, setRoute] = useState<RouteResult | null | undefined>(undefined);
  const loadRoute = useRouteStore((s) => s.loadRoute);

  useEffect(() => {
    let cancelled = false;
    const resolve = async (): Promise<RouteResult | null> => {
      if (encoded) {
        const shared = decodeSharedRoute(encoded);
        if (shared) {
          const last = shared.points[shared.points.length - 1]!;
          const first = shared.points[0]!;
          return buildRouteResult({
            id,
            name: shared.name,
            request: {
              mode: shared.mode,
              activity: shared.activity,
              start: { lat: first.lat, lng: first.lng, name: "Départ" },
              end: shared.mode === "point_to_point" ? { lat: last.lat, lng: last.lng, name: "Arrivée" } : undefined,
              distanceKm: Math.round(last.dist / 100) / 10,
            },
            style: "balanced",
            raw: { coordinates: shared.points, distanceM: last.dist },
            points: shared.points,
            segments: [],
            waypoints: waypointsFromTrack({ points: shared.points }),
            provider: "shared-link",
          });
        }
      }
      const repo = getRouteRepository();
      const entries = await repo.list();
      const entry = entries.find((e) => e.route.id === id || e.id === id);
      return entry ? { ...entry.route, name: entry.name } : null;
    };
    void resolve().then((r) => {
      if (cancelled) return;
      setRoute(r);
      if (r) loadRoute(r);
    });
    return () => {
      cancelled = true;
    };
  }, [id, encoded, loadRoute]);

  if (route === undefined) {
    return <div className="flex h-full items-center justify-center text-sm text-ink-500">Chargement du parcours…</div>;
  }
  if (route === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-ink-700">Ce parcours est introuvable ou le lien est invalide.</p>
        <Link href="/" className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
          Créer un parcours
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="panel-scroll order-2 max-h-[55%] overflow-y-auto border-t border-ink-200 bg-white p-5 lg:order-1 lg:max-h-none lg:w-[420px] lg:border-r lg:border-t-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{ACTIVITY_LABELS[route.activity]}</p>
        <h1 className="mb-4 text-lg font-bold leading-tight text-ink-900">{route.name}</h1>
        <div className="space-y-5">
          <RouteStats route={route} />
          <ElevationProfile route={route} />
          <RouteDNA dna={route.dna} />
          <div className="flex gap-2">
            <Button
              variant="accent"
              block
              icon={<Download className="h-4 w-4" />}
              onClick={() => {
                const file = exportRoute(route, "gpx");
                if (file) downloadTextFile(file);
              }}
            >
              Télécharger GPX
            </Button>
            <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 hover:bg-ink-50">
              <PencilLine className="h-4 w-4" /> Ouvrir dans l&apos;éditeur
            </Link>
          </div>
        </div>
      </aside>
      <main className="relative order-1 min-h-[45%] flex-1 lg:order-2">
        <RouteMap fitPadding={{ top: 60, right: 40, bottom: 40, left: 40 }} />
      </main>
    </div>
  );
}
