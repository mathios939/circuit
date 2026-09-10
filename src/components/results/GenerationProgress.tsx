"use client";

import { Check, Loader2 } from "lucide-react";
import type { GenerationStage } from "@/lib/types";
import { useRouteStore } from "@/store/route-store";

const STAGES: { id: GenerationStage; label: string }[] = [
  { id: "geocoding", label: "Recherche du lieu" },
  { id: "candidates", label: "Création des variantes" },
  { id: "routing", label: "Calcul des itinéraires" },
  { id: "elevation", label: "Analyse de l'altitude" },
  { id: "scoring", label: "Sélection des meilleurs parcours" },
];

/**
 * Real generation stages streamed by the server. No fake percentage: a stage
 * is either done, running (with the live detail sent by the engine) or
 * pending.
 */
export function GenerationProgressView() {
  const progress = useRouteStore((s) => s.progress);
  const current = progress?.stage ?? "candidates";
  const currentIndex = STAGES.findIndex((s) => s.id === current);

  return (
    <div className="space-y-4 py-4" role="status" aria-live="polite" data-testid="generation-progress">
      <ol className="space-y-2">
        {STAGES.map((stage, i) => {
          // The place is already resolved client side before the request starts.
          const done = i < currentIndex || stage.id === "geocoding";
          const active = i === currentIndex && stage.id !== "geocoding";
          return (
            <li key={stage.id} className={`flex items-start gap-3 text-sm ${done ? "text-ink-500" : active ? "text-ink-900" : "text-ink-300"}`}>
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? <Check className="h-4 w-4 text-brand-600" aria-hidden /> : active ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden /> : <span className="h-2 w-2 rounded-full bg-ink-200" aria-hidden />}
              </span>
              <span>
                <span className={active ? "font-medium" : ""}>{stage.label}</span>
                {active && progress?.detail ? <span className="block text-xs text-ink-500">{progress.detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-ink-500">Plusieurs directions sont explorées et les distances réelles mesurées ; cela prend généralement 5 à 30 secondes selon le moteur.</p>
    </div>
  );
}
