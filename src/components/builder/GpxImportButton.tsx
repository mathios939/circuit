"use client";

import { Upload } from "lucide-react";
import { useRef } from "react";
import { useRouteStore } from "@/store/route-store";

export function GpxImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const importGpx = useRouteStore((s) => s.importGpx);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        className="sr-only"
        data-testid="gpx-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importGpx(file);
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-900">
        <Upload className="h-3.5 w-3.5" /> Importer un fichier GPX
      </button>
    </>
  );
}
