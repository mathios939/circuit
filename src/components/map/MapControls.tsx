"use client";

import { Layers } from "lucide-react";
import { useState } from "react";
import type { Basemap } from "@/lib/map/styles";
import { useRouteStore } from "@/store/route-store";

/** Floating basemap switcher (standard / outdoor / topo / satellite when configured). */
export function MapControls({ basemaps }: { basemaps: Basemap[] }) {
  const [open, setOpen] = useState(false);
  const basemapId = useRouteStore((s) => s.basemapId) ?? basemaps[0]?.id;
  const setBasemap = useRouteStore((s) => s.setBasemap);
  return (
    <div className="absolute left-3 top-3 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Changer de fond de carte"
        className="flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-medium text-ink-900 shadow-panel hover:bg-ink-50"
      >
        <Layers className="h-4 w-4" />
        <span className="hidden sm:inline">{basemaps.find((b) => b.id === basemapId)?.label ?? "Fond"}</span>
      </button>
      {open ? (
        <ul role="listbox" className="mt-1 w-48 overflow-hidden rounded-xl bg-white py-1 shadow-panel">
          {basemaps.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                role="option"
                aria-selected={b.id === basemapId}
                onClick={() => {
                  setBasemap(b.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ink-50 ${b.id === basemapId ? "font-semibold text-ink-900" : "text-ink-700"}`}
              >
                {b.label}
                <span className="text-[10px] uppercase tracking-wide text-ink-500">{b.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
