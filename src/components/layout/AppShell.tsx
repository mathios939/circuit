"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { Toast } from "@/components/ui/Feedback";
import { useRouteStore } from "@/store/route-store";
import { BuilderPanel } from "./BuilderPanel";

const RouteMap = dynamic(() => import("@/components/map/RouteMap").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse-soft bg-ink-100" aria-label="Chargement de la carte" />,
});

type SheetState = "peek" | "half" | "full";
const SHEET_HEIGHT: Record<SheetState, string> = { peek: "18%", half: "52%", full: "92%" };

/**
 * Desktop: configuration panel on the left, large map on the right.
 * Mobile: full-screen map with a draggable bottom sheet.
 */
export function AppShell() {
  const isMobile = useIsMobile();
  const toast = useRouteStore((s) => s.toast);
  const [sheet, setSheet] = useState<SheetState>("half");
  const dragStart = useRef<{ y: number; state: SheetState } | null>(null);

  // Show the results when a generation completes on mobile; keep the map visible while loading.
  useEffect(() => {
    if (!isMobile) return;
    return useRouteStore.subscribe((state, previous) => {
      if (state.status === previous.status) return;
      if (state.status === "loading") setSheet("peek");
      if (state.status === "success" || state.status === "error") setSheet("half");
    });
  }, [isMobile]);

  if (!isMobile) {
    return (
      <div className="flex h-full w-full overflow-hidden">
        <aside className="flex w-[420px] shrink-0 flex-col border-r border-ink-200 bg-white" aria-label="Configuration du parcours">
          <Header />
          <div className="min-h-0 flex-1">
            <BuilderPanel />
          </div>
        </aside>
        <main className="relative min-w-0 flex-1">
          <RouteMap fitPadding={{ top: 70, right: 60, bottom: 60, left: 60 }} />
        </main>
        <Toast message={toast} />
      </div>
    );
  }

  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = { y: e.touches[0]!.clientY, state: sheet };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const delta = e.changedTouches[0]!.clientY - start.y;
    if (Math.abs(delta) < 40) return;
    const order: SheetState[] = ["peek", "half", "full"];
    const idx = order.indexOf(start.state);
    setSheet(order[Math.max(0, Math.min(order.length - 1, idx + (delta < 0 ? 1 : -1)))]!);
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <main className="absolute inset-0">
        <RouteMap fitPadding={{ top: 80, right: 30, bottom: Math.round(window.innerHeight * 0.55), left: 30 }} />
      </main>
      <section
        aria-label="Configuration du parcours"
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-10px_40px_-12px_rgb(15_23_42_/_0.35)] transition-[height] duration-300"
        style={{ height: SHEET_HEIGHT[sheet] }}
      >
        <button
          type="button"
          aria-label="Déplier ou replier le panneau"
          className="flex shrink-0 flex-col items-center py-2"
          onClick={() => setSheet(sheet === "full" ? "half" : sheet === "half" ? "full" : "half")}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <span className="h-1.5 w-12 rounded-full bg-ink-300" />
          <span className="mt-1 text-xs font-semibold text-ink-900">Circuit</span>
        </button>
        <div className="min-h-0 flex-1">
          <BuilderPanel />
        </div>
      </section>
      <Toast message={toast} />
    </div>
  );
}

function Header() {
  return (
    <header className="flex shrink-0 items-center gap-3 px-5 pb-1 pt-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-900 text-white" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M5 13c4-8 10 8 14 0" />
        </svg>
      </span>
      <div>
        <h1 className="text-base font-bold leading-tight text-ink-900">Circuit</h1>
        <p className="text-xs text-ink-500">Générateur intelligent de parcours</p>
      </div>
    </header>
  );
}
