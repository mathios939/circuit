"use client";

import { Bookmark, Download, Link2 } from "lucide-react";
import { useState } from "react";
import type { RouteResult } from "@/lib/types";
import { EXPORTERS } from "@/lib/export";
import { buildShareUrl, copyToClipboard, downloadTextFile, exportRoute } from "@/lib/client/download";
import { Button } from "@/components/ui/Button";
import { useRouteStore } from "@/store/route-store";

/** Download (GPX, GeoJSON…), share link and save actions. */
export function ExportMenu({ route }: { route: RouteResult }) {
  const saveCurrent = useRouteStore((s) => s.saveCurrent);
  const setToast = useRouteStore((s) => s.setToast);
  const [format, setFormat] = useState("gpx");

  const download = () => {
    const file = exportRoute(route, format);
    if (file) downloadTextFile(file);
  };

  const share = async () => {
    const url = buildShareUrl(route);
    if (navigator.share) {
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
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button variant="accent" size="lg" block onClick={download} icon={<Download className="h-4 w-4" />} data-testid="download-button">
          Télécharger {EXPORTERS.find((e) => e.format === format)?.label ?? format.toUpperCase()}
        </Button>
        {EXPORTERS.length > 1 ? (
          <select aria-label="Format d'export" value={format} onChange={(e) => setFormat(e.target.value)} className="h-12 rounded-xl border border-ink-200 bg-white px-2 text-sm">
            {EXPORTERS.map((e) => (
              <option key={e.format} value={e.format}>
                {e.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button block onClick={() => saveCurrent()} icon={<Bookmark className="h-4 w-4" />} data-testid="save-button">
          Enregistrer
        </Button>
        <Button block onClick={share} icon={<Link2 className="h-4 w-4" />} data-testid="share-button">
          Partager
        </Button>
      </div>
    </div>
  );
}
