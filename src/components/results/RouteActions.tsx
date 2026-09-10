"use client";

import { ArrowLeftRight, Bookmark, Download, Link2, Pencil } from "lucide-react";
import type { RouteResult } from "@/lib/types";
import { buildShareUrl, copyToClipboard, downloadTextFile, exportRoute } from "@/lib/client/download";
import { Button } from "@/components/ui/Button";
import { useRouteStore } from "@/store/route-store";

/** Primary actions of a route: edit, reverse, download GPX, share (+ save, GeoJSON). */
export function RouteActions({ route }: { route: RouteResult }) {
  const editing = useRouteStore((s) => s.editing);
  const setEditing = useRouteStore((s) => s.setEditing);
  const reverse = useRouteStore((s) => s.reverseRoute);
  const recalcStatus = useRouteStore((s) => s.recalcStatus);
  const saveCurrent = useRouteStore((s) => s.saveCurrent);
  const setToast = useRouteStore((s) => s.setToast);

  const download = (format: "gpx" | "geojson") => {
    const file = exportRoute(route, format);
    if (file) downloadTextFile(file);
  };

  const share = async () => {
    const url = buildShareUrl(route);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: route.name, url });
        return;
      } catch {
        /* user cancelled: fall back to clipboard */
      }
    }
    setToast((await copyToClipboard(url)) ? "Lien copié dans le presse-papiers." : "Impossible de copier le lien.");
  };

  return (
    <div className="space-y-2" data-testid="route-actions">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="accent" size="lg" className="whitespace-nowrap px-3" onClick={() => download("gpx")} icon={<Download className="h-4 w-4 shrink-0" />} data-testid="download-button">
          Télécharger GPX
        </Button>
        <Button size="lg" className="whitespace-nowrap px-3" onClick={share} icon={<Link2 className="h-4 w-4 shrink-0" />} data-testid="share-button">
          Partager
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" onClick={() => setEditing(!editing)} aria-pressed={editing} icon={<Pencil className="h-3.5 w-3.5" />} data-testid="edit-button">
          {editing ? "Terminer" : "Modifier"}
        </Button>
        <Button size="sm" onClick={reverse} disabled={recalcStatus === "loading"} icon={<ArrowLeftRight className="h-3.5 w-3.5" />}>
          Inverser
        </Button>
        <Button size="sm" onClick={() => saveCurrent()} icon={<Bookmark className="h-3.5 w-3.5" />} data-testid="save-button">
          Enregistrer
        </Button>
      </div>
      <button type="button" onClick={() => download("geojson")} className="text-[11px] text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline">
        Exporter en GeoJSON
      </button>
    </div>
  );
}
